/**
 * FormRuntimeStore — the compose-time store for a running published form.
 *
 * Extends QueryBuilderStore so the normalized condition tree, definition(), and
 * undo/redo come for free and the reused qb-* components drive it unchanged. On
 * hydrate it flattens the form's tabs->sections->fields (ResolvedTabNode, the
 * getRuntimeSchema payload) into the QB groups->prompts shape the runtime
 * components consume. RBAC is already applied by the server (none fields omitted,
 * read forced read-only); the store carries the raw form schema plus:
 *   - `values`: fieldKey -> submitted value, kept in sync with the tree for live
 *     rules (Phase 5 FE engine) + server re-enforcement on execute,
 *   - `effectiveFlags`: per-field visible/readOnly/required after rules fold over
 *     the base RBAC-projected state.
 */
import { Injectable, computed, signal } from '@angular/core';
import { QueryBuilderStore } from 'src/app/modules/query-builder/services/query-builder-store';
import { QbSchemaPrompt, QbSchemaResponse } from 'src/app/modules/query-builder/services/qb-runtime.service';
import {
  Condition,
  FieldBaseState,
  FormRuleLike,
  applyRules,
} from '../logic/ruleEngine';
import { PersistedAst, toEngineCondition } from '../logic/ruleAst.adapter';

/** The runtime hydration payload (getRuntimeSchema data). */
export interface FormRuntimeSchema {
  form: {
    id: string;
    name: string;
    description: string | null;
    datasourceId: string;
    defaultLimit: number;
    maxLimit: number;
    forceDistinct: boolean;
    canEdit?: boolean;
  };
  version: number;
  logicalOperators: { code: string; label: string }[];
  tabs: RuntimeTab[];
  rules: RuntimeRule[];
}

export interface RuntimeField {
  formFieldId: string;
  fieldKey: string;
  promptId: string | null;
  blockType: string | null;
  label: string;
  help: string | null;
  type: string | null;
  dataType: string | null;
  isMandatory: boolean;
  isVisible: boolean;
  isReadonly: boolean;
  isLocked: boolean;
  operators: { code: string; label: string; arity: string }[];
  valueSource: QbSchemaPrompt['valueSource'];
  effectiveAccess: 'none' | 'read' | 'write';
}

export interface RuntimeSection {
  id: string;
  name: string | null;
  columns: number;
  sequence: number;
  fields: RuntimeField[];
}

export interface RuntimeTab {
  id: string;
  name: string;
  icon: string | null;
  sequence: number;
  sections: RuntimeSection[];
}

export interface RuntimeRule {
  id: string;
  name: string | null;
  trigger: PersistedAst;
  action: string;
  targetFieldKeys: string[];
  setValueExpr?: string | null;
  sequence?: number;
}

export interface EffectiveFieldFlags {
  visible: boolean;
  readOnly: boolean;
  required: boolean;
}

@Injectable()
export class FormRuntimeStore extends QueryBuilderStore {
  /** The raw hydration payload, kept alongside the QB-shaped schema. */
  readonly formSchema = signal<FormRuntimeSchema | null>(null);

  /** Submitted values keyed by fieldKey — the rule/required-enforcement mirror. */
  readonly values = signal<Record<string, unknown>>({});

  /** fieldKey -> the placement (for RBAC/base-state lookups). */
  readonly fieldsByKey = computed<Record<string, RuntimeField>>(() => {
    const fs = this.formSchema();
    const out: Record<string, RuntimeField> = {};
    if (!fs) return out;
    for (const t of fs.tabs) {
      for (const s of t.sections) {
        for (const f of s.fields) out[f.fieldKey] = f;
      }
    }
    return out;
  });

  /**
   * Rules + RBAC folded live → per-field flags keyed by fieldKey. RBAC is the
   * outer gate (read → disabled). The Phase-5 engine then folds
   * show/hide/enable/disable/require/optional over the current values.
   */
  readonly effectiveFlags = computed<Record<string, EffectiveFieldFlags>>(() => {
    const fs = this.formSchema();
    if (!fs) return {};

    const base: Record<string, FieldBaseState> = {};
    for (const f of Object.values(this.fieldsByKey())) {
      base[f.fieldKey] = {
        visible: f.isVisible,
        // RBAC read → disabled; a locked/read-only placement is disabled too.
        disabled: f.isReadonly || f.isLocked || f.effectiveAccess === 'read',
        required: f.isMandatory,
      };
    }

    const state = applyRules(this.toEngineRules(fs.rules), this.values(), base);
    const flags: Record<string, EffectiveFieldFlags> = {};
    for (const key of Object.keys(state)) {
      flags[key] = {
        visible: state[key].visible,
        readOnly: state[key].disabled,
        required: state[key].required,
      };
    }
    return flags;
  });

  /** Lower persisted rule triggers to the engine Condition shape. */
  private toEngineRules(rules: RuntimeRule[]): FormRuleLike[] {
    const out: FormRuleLike[] = [];
    for (const r of rules ?? []) {
      let trigger: Condition;
      try {
        trigger = toEngineCondition(r.trigger);
      } catch {
        continue; // an unmappable trigger is skipped client-side; server enforces.
      }
      out.push({
        formRuleId: r.id,
        name: r.name ?? undefined,
        order: r.sequence ?? 0,
        trigger,
        action: r.action as FormRuleLike['action'],
        targetFieldKeys: r.targetFieldKeys ?? [],
        setValueExpr: r.setValueExpr ?? null,
      });
    }
    return out;
  }

  /** Hydrate from the runtime schema, flattening to the QB shape. */
  hydrateForm(schema: FormRuntimeSchema): void {
    this.formSchema.set(schema);
    this.values.set({});

    const groups = (schema.tabs ?? []).flatMap(t =>
      (t.sections ?? []).map(s => ({
        groupLabel: s.name ?? null,
        groupSequence: s.sequence ?? 0,
        prompts: (s.fields ?? [])
          // The server already omitted `none` fields; belt-and-suspenders here,
          // and skip layout blocks (no promptId — they carry no filterable value).
          .filter(f => f.effectiveAccess !== 'none' && !!f.promptId && !f.blockType)
          .map<QbSchemaPrompt>(f => ({
            placementId: f.formFieldId,
            promptId: f.promptId as string,
            displayName: f.label,
            description: f.help ?? '',
            type: f.type ?? 'text',
            dataType: f.dataType,
            isMandatory: f.isMandatory,
            isLocked: f.isLocked,
            isSelectable: true,
            isFilterable: true,
            isSortable: true,
            // Form placements carry no appearance blob — presentation lives on
            // the placement columns; qb-value-control reads appearance defensively.
            appearance: {},
            operators: f.operators,
            valueSource: f.valueSource,
          })),
      })),
    );

    const qbShaped: QbSchemaResponse = {
      queryBuilder: {
        id: schema.form.id,
        name: schema.form.name,
        description: schema.form.description ?? '',
        datasourceId: schema.form.datasourceId,
        defaultLimit: schema.form.defaultLimit ?? 1000,
        maxLimit: schema.form.maxLimit ?? 50000,
        forceDistinct: !!schema.form.forceDistinct,
        usesOperatorEngine: true,
        canEdit: !!schema.form.canEdit,
        sharedWithMe: false,
      },
      logicalOperators: schema.logicalOperators,
      groups,
      defaultConditionTree: null,
    };

    // Reuse the parent tree hydration (builds the root AND group).
    this.hydrate(qbShaped);
  }

  /**
   * Recompute the fieldKey-keyed values map from the current tree, so live rules
   * (Phase 5) + RBAC recompute. Conditions key off promptId; rules off fieldKey,
   * so map through the placement. A single value stays scalar; many stays array.
   */
  syncRuleValues(): void {
    const out: Record<string, unknown> = {};
    for (const f of Object.values(this.fieldsByKey())) {
      if (!f.promptId) continue;
      const vals = this.valuesForPrompt(f.promptId);
      if (vals.length) out[f.fieldKey] = vals.length === 1 ? vals[0] : vals;
    }
    this.values.set(out);
  }
}
