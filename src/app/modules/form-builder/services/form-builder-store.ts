import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import {
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { GlobalService } from 'src/app/core/services/global.service';
import { FbAdminService } from './fb-admin.service';
import {
  FbFormRule,
  ResolvedField,
  ResolvedSection,
  ResolvedTab,
  VersionState,
} from './fb-types';
import type { PalettePrompt } from '../components/fb-prompt-palette/fb-prompt-palette.component';
import type { FieldPathOption } from '../models/rbac.types';
import {
  applyRules,
  evaluateExpression,
  FieldBaseState,
  FieldEffectiveState,
  FormRuleLike,
  toEngineCondition,
} from '../logic';

export type SelectedElement =
  | { kind: 'tab'; id: string }
  | { kind: 'section'; id: string }
  | { kind: 'field'; id: string } // id = placementId (formFieldId)
  | null;

interface TreeSnapshot {
  tabs: ResolvedTab[];
}

/** Reorder `list` to match `orderedIds`; pure, returns a new array; drops unknown ids. */
export function applyReorder<T extends { id: string }>(
  orderedIds: string[],
  list: T[],
): T[] {
  const byId = new Map(list.map(x => [x.id, x]));
  return orderedIds.map(id => byId.get(id)).filter((x): x is T => !!x);
}

/**
 * Adapt persisted rule rows → the engine's FormRuleLike (trigger lowered via the
 * AST adapter), skipping disabled rows. The SAME shape the BE runtime feeds
 * `enforceRules`, so the live preview and the server agree.
 */
export function toEngineRules(rules: FbFormRule[]): FormRuleLike[] {
  return (rules ?? [])
    .filter(r => r.isEnabled !== false)
    .map(r => ({
      name: r.name,
      order: r.ruleOrder,
      trigger: toEngineCondition(r.trigger),
      action: r.action,
      targetFieldKeys: r.targetFieldKeys ?? [],
      setValueExpr: r.setValueExpr,
      message: r.message,
    }));
}

/**
 * Pure toggle-to-deselect reducer (the USG bug fix). Clicking the SAME element
 * again deselects; a different element (or kind) switches selection.
 */
export function nextSelection(
  current: SelectedElement,
  kind: NonNullable<SelectedElement>['kind'],
  id: string,
): SelectedElement {
  if (current && current.kind === kind && current.id === id) return null;
  return { kind, id } as SelectedElement;
}

/**
 * FormBuilderStore — per-shell signal store holding the resolved tab→section→
 * placement tree, the active tab, and the selection. Every structural mutation
 * is optimistic-then-reconcile against the version-scoped structure/reorder
 * endpoints, gated on isDraft(). Provided by FbDesignComponent.
 */
@Injectable()
export class FormBuilderStore {
  private readonly admin = inject(FbAdminService);
  private readonly global = inject(GlobalService);

  readonly formId = signal<string>('');
  readonly version = signal<number>(1);
  readonly versionState = signal<VersionState>('draft');
  readonly tabs = signal<ResolvedTab[]>([]);
  readonly activeTabId = signal<string>('');
  readonly selected = signal<SelectedElement>(null);

  readonly isDraft = computed(() => this.versionState() === 'draft');

  readonly sectionsForActiveTab = computed<ResolvedSection[]>(() => {
    const t = this.tabs().find(x => x.id === this.activeTabId());
    return t?.sections ?? [];
  });

  /** CDK drop-list ids for every section in the active tab. */
  readonly allDropIds = computed(() =>
    this.sectionsForActiveTab().map(s => this.dropId(s.id)),
  );

  /** promptIds already placed anywhere in the version — for greying the palette. */
  readonly placedIds = computed(
    () =>
      new Set(
        this.tabs()
          .flatMap(t => t.sections)
          .flatMap(s => s.fields)
          .map(f => f.promptId)
          .filter((x): x is string => !!x),
      ),
  );

  /** Publish gate — every tab has >=1 section, no empty tab. Refined in Phase 7. */
  readonly canPublish = computed(
    () =>
      this.tabs().length > 0 && this.tabs().every(t => t.sections.length > 0),
  );

  // ── Selected-element accessors (Task 9 wiring for the properties panel) ─
  readonly selectedTab = computed(() => {
    const s = this.selected();
    return s?.kind === 'tab'
      ? this.tabs().find(t => t.id === s.id) ?? null
      : null;
  });
  readonly selectedSection = computed(() => {
    const s = this.selected();
    if (s?.kind !== 'section') return null;
    return this.tabs().flatMap(t => t.sections).find(x => x.id === s.id) ?? null;
  });
  readonly selectedField = computed(() => {
    const s = this.selected();
    if (s?.kind !== 'field') return null;
    return (
      this.tabs()
        .flatMap(t => t.sections)
        .flatMap(x => x.fields)
        .find(f => f.formFieldId === s.id) ?? null
    );
  });

  dropId(sectionId: string): string {
    return `fb-sec-${sectionId}`;
  }

  // ── Rules (Phase 5) ───────────────────────────────────────────────────
  readonly rules = signal<FbFormRule[]>([]);
  /** Live values the designer Preview feeds the engine (keyed by fieldKey). */
  readonly previewValues = signal<Record<string, unknown>>({});

  /** Every real (non-layout) placement flattened → the rule field/target source. */
  readonly fieldKeys = computed<
    Array<{ key: string; label: string; dataType: string | null }>
  >(() =>
    this.tabs()
      .flatMap(t => t.sections)
      .flatMap(s => s.fields)
      .filter(f => !f.blockType && !!f.fieldKey)
      .map(f => ({
        key: f.fieldKey as string,
        label: f.label || f.prompt?.name || (f.fieldKey as string),
        dataType: f.dataType,
      })),
  );

  /** The set of known placement fieldKeys — for missing-target warnings. */
  readonly knownFieldKeys = computed(
    () => new Set(this.fieldKeys().map(f => f.key)),
  );

  /**
   * Every real (non-layout) placement flattened into a "Tab › Section › Field"
   * path option (U+203A separators, mirroring USG). Feeds the RBAC editor's
   * field picker so a grant can be set per placement.
   */
  readonly fieldPaths = computed<FieldPathOption[]>(() => {
    const out: FieldPathOption[] = [];
    for (const tab of this.tabs()) {
      for (const section of tab.sections) {
        const sectionName = section.name || 'Section';
        for (const field of section.fields) {
          if (field.blockType) continue; // layout block — no access grid
          const label = field.label || field.prompt?.name || field.formFieldId;
          out.push({
            formFieldId: field.formFieldId,
            path: `${tab.name} › ${sectionName} › ${label}`,
          });
        }
      }
    }
    return out;
  });

  /** Static per-field {visible,required,disabled}, keyed by fieldKey. */
  readonly baseState = computed<Record<string, FieldBaseState>>(() => {
    const base: Record<string, FieldBaseState> = {};
    for (const f of this.tabs().flatMap(t => t.sections).flatMap(s => s.fields)) {
      if (f.blockType || !f.fieldKey) continue;
      base[f.fieldKey] = {
        visible: f.isVisible,
        required: f.isMandatory,
        disabled: f.isReadonly || f.isLocked,
      };
    }
    return base;
  });

  /**
   * Effective per-field state after the rules fire against previewValues.
   * The designer Preview and the Phase-7 runtime composer both derive per-field
   * visible/required/disabled from `applyRules(toEngineRules(rules), values,
   * base)` — this is that path. The server re-enforces the identical result via
   * `enforceRules` on validate/execute, so preview, published render, and
   * server enforcement always agree. Feed live values with `setPreviewValue`.
   */
  readonly effectiveFlags = computed<Record<string, FieldEffectiveState>>(() => {
    const base = this.baseState();
    const state = applyRules(
      toEngineRules(this.rules()),
      this.previewValues(),
      base,
      (expr, v) => evaluateExpression(expr, v),
    );
    // Mandatory beats rule-hide: the server's enforceRules forces every
    // mandatory field visible AFTER folding the rules, so a `hide` rule can't
    // strip a required field out of the submit. Mirror that here so preview
    // matches what the server will require on execute.
    for (const key of Object.keys(base)) {
      if (base[key].required) {
        if (!state[key])
          state[key] = { visible: true, required: true, disabled: false };
        state[key].visible = true;
      }
    }
    return state;
  });

  // ── One-deep snapshot for optimistic rollback ─────────────────────────
  private snap: TreeSnapshot | null = null;
  snapshot(): void {
    this.snap = { tabs: structuredClone(this.tabs()) };
  }
  revert(): void {
    if (this.snap) {
      this.tabs.set(this.snap.tabs);
      this.global.showWarn('That change could not be saved and was reverted.');
    }
  }

  // ── Debounced PATCH pumps (Task 9) ────────────────────────────────────
  private tabPatch$ = new Subject<{ id: string; patch: any }>();
  private sectionPatch$ = new Subject<{ id: string; patch: any }>();
  private fieldPatch$ = new Subject<{ id: string; patch: any }>();
  private pumpsReady = false;

  initPatchPumps(): void {
    if (this.pumpsReady) return;
    this.pumpsReady = true;
    this.tabPatch$.pipe(debounceTime(400)).subscribe(({ id, patch }) =>
      this.admin
        .updateTab(this.formId(), this.version(), id, patch)
        .catch(() => this.revert()),
    );
    this.sectionPatch$.pipe(debounceTime(400)).subscribe(({ id, patch }) =>
      this.admin
        .updateSection(this.formId(), this.version(), id, patch)
        .catch(() => this.revert()),
    );
    this.fieldPatch$.pipe(debounceTime(400)).subscribe(({ id, patch }) =>
      this.admin
        .updateField(this.formId(), this.version(), id, patch)
        .catch(() => this.revert()),
    );
  }

  // ── Hydration ─────────────────────────────────────────────────────────
  hydrate(schema: {
    version: number;
    state: VersionState;
    tabs: ResolvedTab[];
  }): void {
    this.version.set(schema.version);
    this.versionState.set(schema.state);
    const tabs = [...schema.tabs].sort((a, b) => a.sequence - b.sequence);
    this.tabs.set(tabs);
    const active = tabs.find(t => t.isActive) ?? tabs[0];
    this.activeTabId.set(active?.id ?? '');
    this.selected.set(null);
  }

  setActiveTab(id: string): void {
    this.activeTabId.set(id);
  }

  // ── Rule state ops (Phase 5) ──────────────────────────────────────────
  async loadRules(): Promise<void> {
    const id = this.formId();
    if (!id) return;
    try {
      const rows = await this.admin.listRules(id, this.version());
      this.rules.set(rows ?? []);
    } catch {
      this.rules.set([]);
    }
  }

  setRules(rows: FbFormRule[]): void {
    this.rules.set(rows ?? []);
  }

  upsertRule(rule: FbFormRule): void {
    this.rules.update(list => {
      const idx = list.findIndex(r => r.id === rule.id);
      if (idx === -1) return [...list, rule];
      const next = [...list];
      next[idx] = rule;
      return next;
    });
  }

  removeRule(ruleId: string): void {
    this.rules.update(list => list.filter(r => r.id !== ruleId));
  }

  setPreviewValue(fieldKey: string, value: unknown): void {
    this.previewValues.update(v => ({ ...v, [fieldKey]: value }));
  }

  // ── Selection (toggle-to-deselect — Task 8) ───────────────────────────
  selectTab(id: string): void {
    this.selected.set(nextSelection(this.selected(), 'tab', id));
  }
  selectSection(id: string): void {
    this.selected.set(nextSelection(this.selected(), 'section', id));
  }
  selectField(id: string): void {
    this.selected.set(nextSelection(this.selected(), 'field', id));
  }

  // ── Tabs / sections add + remove (Task 6) ─────────────────────────────
  addTab(): void {
    this.snapshot();
    const id = this.formId();
    const v = this.version();
    const seq = this.tabs().length;
    this.admin
      .createTab(id, v, { name: `Tab ${seq + 1}`, sequence: seq })
      .then(res => {
        const t = res?.data;
        if (!t) return;
        const tab: ResolvedTab = {
          id: t.id,
          name: t.name,
          icon: t.icon ?? null,
          isActive: t.isActive ?? seq === 0,
          sequence: t.sequence ?? seq,
          localeLabels: t.localeLabels ?? null,
          sections: [],
        };
        this.tabs.update(list => [...list, tab]);
        this.activeTabId.set(tab.id);
      })
      .catch(() => this.revert());
  }

  removeTab(id: string): void {
    if (this.tabs().length <= 1) return; // never remove the last tab
    this.snapshot();
    const wasActive = this.activeTabId() === id;
    this.tabs.update(list => list.filter(t => t.id !== id));
    if (wasActive) this.activeTabId.set(this.tabs()[0]?.id ?? '');
    if (this.selected()?.id === id) this.selected.set(null);
    this.admin
      .deleteTab(this.formId(), this.version(), id)
      .catch(() => this.revert());
  }

  addSection(): void {
    const tabId = this.activeTabId();
    if (!tabId) return;
    this.snapshot();
    const id = this.formId();
    const v = this.version();
    const tab = this.tabs().find(t => t.id === tabId);
    const seq = tab?.sections.length ?? 0;
    this.admin
      .createSection(id, v, {
        tabId,
        name: `Section ${seq + 1}`,
        columns: 1,
        sequence: seq,
      })
      .then(res => {
        const s = res?.data;
        if (!s) return;
        const section: ResolvedSection = {
          id: s.id,
          name: s.name ?? null,
          columns: s.columns ?? 1,
          collapsible: !!s.collapsible,
          collapsedByDefault: !!s.collapsedByDefault,
          sequence: s.sequence ?? seq,
          localeLabels: s.localeLabels ?? null,
          fields: [],
        };
        this.tabs.update(list =>
          list.map(t =>
            t.id === tabId ? { ...t, sections: [...t.sections, section] } : t,
          ),
        );
      })
      .catch(() => this.revert());
  }

  removeSection(id: string): void {
    this.snapshot();
    this.tabs.update(list =>
      list.map(t => ({
        ...t,
        sections: t.sections.filter(s => s.id !== id),
      })),
    );
    if (this.selected()?.id === id) this.selected.set(null);
    this.admin
      .deleteSection(this.formId(), this.version(), id)
      .catch(() => this.revert());
  }

  // ── Reorder + drop handlers (Task 7) ──────────────────────────────────
  reorderTabs(prev: number, cur: number): void {
    if (prev === cur) return;
    this.snapshot();
    const tabs = [...this.tabs()];
    moveItemInArray(tabs, prev, cur);
    this.tabs.set(tabs);
    this.admin
      .reorder(this.formId(), this.version(), {
        target: 'tabs',
        orderedIds: tabs.map(t => t.id),
      })
      .catch(() => this.revert());
  }

  onSectionDrop(event: CdkDragDrop<ResolvedSection[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.snapshot();
    const tabId = this.activeTabId();
    const sections = [...this.sectionsForActiveTab()];
    moveItemInArray(sections, event.previousIndex, event.currentIndex);
    this.tabs.update(list =>
      list.map(t => (t.id === tabId ? { ...t, sections } : t)),
    );
    this.admin
      .reorder(this.formId(), this.version(), {
        target: 'sections',
        parentId: tabId,
        orderedIds: sections.map(s => s.id),
      })
      .catch(() => this.revert());
  }

  onFieldDrop(
    event: CdkDragDrop<ResolvedField[]>,
    targetSection: ResolvedSection,
  ): void {
    const data: any = event.item.data;
    // Case 1: palette → section (a PalettePrompt has no formFieldId/colSpan).
    const isPalette = data && !('formFieldId' in data);
    if (event.previousContainer !== event.container && isPalette) {
      this.createPlacement(targetSection.id, data as PalettePrompt, event.currentIndex);
      return;
    }
    // Case 2: within-section reorder.
    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;
      this.snapshot();
      const fields = [...targetSection.fields];
      moveItemInArray(fields, event.previousIndex, event.currentIndex);
      this.setSectionFields(targetSection.id, fields);
      this.admin
        .reorder(this.formId(), this.version(), {
          target: 'fields',
          parentId: targetSection.id,
          orderedIds: fields.map(f => f.formFieldId),
        })
        .catch(() => this.revert());
      return;
    }
    // Case 3: cross-section move.
    this.snapshot();
    const fromList = [...(event.previousContainer.data as ResolvedField[])];
    const toList = [...targetSection.fields];
    const moved = fromList[event.previousIndex];
    transferArrayItem(fromList, toList, event.previousIndex, event.currentIndex);
    this.setSectionFieldsByData(event.previousContainer.data, fromList);
    this.setSectionFields(targetSection.id, toList);
    this.admin
      .updateField(this.formId(), this.version(), moved.formFieldId, {
        sectionId: targetSection.id,
      })
      .then(() =>
        this.admin.reorder(this.formId(), this.version(), {
          target: 'fields',
          parentId: targetSection.id,
          orderedIds: toList.map(f => f.formFieldId),
        }),
      )
      .catch(() => this.revert());
  }

  createPlacement(
    sectionId: string,
    prompt: PalettePrompt,
    index: number,
  ): void {
    // Dedupe real data prompts (layout blocks may repeat).
    if (prompt.promptId && this.placedIds().has(prompt.promptId)) {
      this.global.showInfo('This prompt is already placed on the form.');
      return;
    }
    this.snapshot();
    const tempId = `tmp_${Date.now()}`;
    const placeholder: ResolvedField = {
      formFieldId: tempId,
      promptId: prompt.promptId,
      blockType: prompt.blockType,
      blockContent: null,
      sequence: index,
      colSpan: 1,
      label: prompt.blockType ? prompt.type : prompt.name,
      help: null,
      placeholder: null,
      type: prompt.type,
      dataType: prompt.dataType,
      isMandatory: false,
      isVisible: true,
      isReadonly: false,
      isLocked: false,
      defaultValue: null,
      allowedOperators: null,
      localeLabels: null,
      localeHelps: null,
      effectiveAccess: 'write',
      prompt: prompt.promptId
        ? {
            id: prompt.promptId,
            name: prompt.name,
            type: prompt.type,
            dataType: prompt.dataType,
          }
        : null,
    };
    this.insertField(sectionId, placeholder, index);
    const body: any = { sectionId, sequence: index };
    if (prompt.promptId) body.promptId = prompt.promptId;
    else body.blockType = prompt.blockType;
    this.admin
      .createField(this.formId(), this.version(), body)
      .then(res => this.reconcileField(sectionId, tempId, res?.data))
      .catch(() => this.revert());
  }

  // ── Property edits (Task 9 — optimistic + debounced PATCH) ────────────
  updateTab(id: string, patch: Partial<ResolvedTab>): void {
    this.snapshot();
    this.tabs.update(list => list.map(t => (t.id === id ? { ...t, ...patch } : t)));
    this.tabPatch$.next({ id, patch: this.toTabBody(patch) });
  }

  updateSection(id: string, patch: Partial<ResolvedSection>): void {
    this.snapshot();
    this.tabs.update(list =>
      list.map(t => ({
        ...t,
        sections: t.sections.map(s => {
          if (s.id !== id) return s;
          const merged = { ...s, ...patch } as ResolvedSection;
          if (patch.columns) {
            const cols = merged.columns;
            merged.fields = merged.fields.map(f =>
              f.colSpan > cols ? { ...f, colSpan: cols } : f,
            );
          }
          return merged;
        }),
      })),
    );
    this.sectionPatch$.next({ id, patch: this.toSectionBody(patch) });
  }

  updatePlacement(id: string, patch: Partial<ResolvedField>): void {
    this.snapshot();
    this.tabs.update(list =>
      list.map(t => ({
        ...t,
        sections: t.sections.map(s => ({
          ...s,
          fields: s.fields.map(f =>
            f.formFieldId === id ? { ...f, ...patch } : f,
          ),
        })),
      })),
    );
    this.fieldPatch$.next({ id, patch: this.toFieldBody(patch) });
  }

  // ── Small tree helpers ────────────────────────────────────────────────
  private insertField(
    sectionId: string,
    field: ResolvedField,
    index: number,
  ): void {
    this.tabs.update(list =>
      list.map(t => ({
        ...t,
        sections: t.sections.map(s => {
          if (s.id !== sectionId) return s;
          const fields = [...s.fields];
          fields.splice(index, 0, field);
          return { ...s, fields };
        }),
      })),
    );
  }

  private reconcileField(
    sectionId: string,
    tempId: string,
    server: any,
  ): void {
    if (!server) {
      this.revert();
      return;
    }
    this.tabs.update(list =>
      list.map(t => ({
        ...t,
        sections: t.sections.map(s => {
          if (s.id !== sectionId) return s;
          return {
            ...s,
            fields: s.fields.map(f =>
              f.formFieldId === tempId
                ? this.mergeServerField(f, server)
                : f,
            ),
          };
        }),
      })),
    );
  }

  private mergeServerField(local: ResolvedField, server: any): ResolvedField {
    return {
      ...local,
      formFieldId: server.id ?? server.formFieldId ?? local.formFieldId,
      sequence: server.sequence ?? local.sequence,
      colSpan: server.colSpan ?? local.colSpan,
      label: server.label ?? local.label,
      blockContent: server.blockContent ?? local.blockContent,
      prompt: server.prompt ?? local.prompt,
    };
  }

  private setSectionFields(sectionId: string, fields: ResolvedField[]): void {
    this.tabs.update(list =>
      list.map(t => ({
        ...t,
        sections: t.sections.map(s =>
          s.id === sectionId ? { ...s, fields } : s,
        ),
      })),
    );
  }

  /** Find the section whose fields-array reference equals `dataRef` (CDK's
   *  previousContainer.data) and replace it — the "find group by identity"
   *  trick. */
  private setSectionFieldsByData(
    dataRef: ResolvedField[],
    fields: ResolvedField[],
  ): void {
    this.tabs.update(list =>
      list.map(t => ({
        ...t,
        sections: t.sections.map(s =>
          s.fields === dataRef ? { ...s, fields } : s,
        ),
      })),
    );
  }

  // ── ResolvedField/Tab/Section → BE body mappers ───────────────────────
  private toTabBody(patch: Partial<ResolvedTab>): any {
    const body: any = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.icon !== undefined) body.icon = patch.icon;
    if (patch.isActive !== undefined) body.isActive = patch.isActive;
    if (patch.localeLabels !== undefined) body.localeLabels = patch.localeLabels;
    return body;
  }

  private toSectionBody(patch: Partial<ResolvedSection>): any {
    const body: any = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.columns !== undefined) body.columns = patch.columns;
    if (patch.collapsible !== undefined) body.collapsible = patch.collapsible;
    if (patch.localeLabels !== undefined) body.localeLabels = patch.localeLabels;
    return body;
  }

  private toFieldBody(patch: Partial<ResolvedField>): any {
    const body: any = {};
    if (patch.label !== undefined) body.labelOverride = patch.label;
    if (patch.help !== undefined) body.helpOverride = patch.help;
    if (patch.placeholder !== undefined)
      body.placeholderOverride = patch.placeholder;
    if (patch.defaultValue !== undefined)
      body.defaultOverride = patch.defaultValue;
    if (patch.blockContent !== undefined) body.blockContent = patch.blockContent;
    if (patch.colSpan !== undefined) body.colSpan = patch.colSpan;
    if (patch.isMandatory !== undefined) body.isMandatory = patch.isMandatory;
    if (patch.isVisible !== undefined) body.isVisible = patch.isVisible;
    if (patch.isReadonly !== undefined) body.isReadonly = patch.isReadonly;
    if (patch.isLocked !== undefined) body.isLocked = patch.isLocked;
    if (patch.allowedOperators !== undefined)
      body.allowedOperators = patch.allowedOperators;
    if (patch.localeLabels !== undefined) body.localeLabels = patch.localeLabels;
    if (patch.localeHelps !== undefined) body.localeHelps = patch.localeHelps;
    return body;
  }
}
