/**
 * Wire types for the Form Builder designer — the resolved version tree the
 * design shell hydrates + the reorder body. Shared by FbAdminService and the
 * FormBuilderStore. Mirrors the API contract (04-api §3, §5).
 */

export type VersionState = 'draft' | 'published' | 'retired';
export type FieldAccess = 'none' | 'read' | 'write';
export type BlockType = 'section_heading' | 'static_text' | 'divider' | 'spacer';

export interface FormVersionSummary {
  version: number;
  state: VersionState;
  publishedAt: string | null;
}

export interface FormSummary {
  id: string;
  name: string;
  description: string | null;
  datasourceId: string;
  baseSchema: string | null;
  baseTable: string | null;
  baseAlias: string | null;
  defaultLimit: number;
  maxLimit: number;
  forceDistinct: boolean;
  publishedVersion: number | null;
  latestDraftVersion: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  versions?: FormVersionSummary[];
}

export interface ResolvedField {
  formFieldId: string;
  /** Stable placement key — the rule engine's condition/target key (data-model §3.5). */
  fieldKey?: string | null;
  promptId: string | null;
  blockType: BlockType | null;
  blockContent: string | null;
  sequence: number;
  colSpan: 1 | 2 | 3 | 4;
  label: string;
  help: string | null;
  placeholder: string | null;
  type: string;
  dataType: string | null;
  isMandatory: boolean;
  isVisible: boolean;
  isReadonly: boolean;
  isLocked: boolean;
  defaultValue: unknown | null;
  allowedOperators: string[] | null;
  localeLabels: Record<string, string> | null;
  localeHelps: Record<string, string> | null;
  effectiveAccess: FieldAccess;
  prompt?: {
    id: string;
    name: string;
    type: string;
    dataType: string | null;
  } | null;
}

export interface ResolvedSection {
  id: string;
  name: string | null;
  columns: 1 | 2 | 3 | 4;
  collapsible: boolean;
  collapsedByDefault: boolean;
  sequence: number;
  localeLabels: Record<string, string> | null;
  fields: ResolvedField[];
}

export interface ResolvedTab {
  id: string;
  name: string;
  icon: string | null;
  isActive: boolean;
  sequence: number;
  localeLabels: Record<string, string> | null;
  sections: ResolvedSection[];
}

export interface FormSchemaData {
  form: {
    id: string;
    name: string;
    datasourceId: string;
    baseSchema: string | null;
    baseTable: string | null;
    baseAlias: string | null;
    defaultLimit: number;
    maxLimit: number;
    forceDistinct: boolean;
  };
  version: number;
  state: VersionState;
  editable: boolean;
  asRole: string | null;
  tabs: ResolvedTab[];
  rules: unknown[];
  logicalOperators: { code: 'AND' | 'OR'; label: string }[];
}

export type ReorderTarget = 'tabs' | 'sections' | 'fields';
export interface ReorderBody {
  target: ReorderTarget;
  parentId?: string;
  orderedIds: string[];
}

// ── Rules (Phase 5) ──────────────────────────────────────────────────────────
// The persisted trigger AST is the extended-op shape (`PersistedAst` in
// logic/ruleAst.adapter); the runtime lowers it to the engine Condition. The
// nine rule actions come from `RULE_ACTIONS` in shared/validators/formRules.
import type { PersistedAst } from '../logic/ruleAst.adapter';
import type { RuleActionValue } from 'src/app/shared/validators/formRules';

export type RuleTriggerAst = PersistedAst;
export type RuleAction = RuleActionValue;

/** A persisted form_rule row as returned by the rule CRUD endpoints. */
export interface FbFormRule {
  id: string;
  formVersionId: string;
  name: string;
  trigger: RuleTriggerAst;
  action: RuleAction;
  targetFieldKeys: string[];
  setValueExpr: string | null;
  message: string | null;
  messageI18n: Record<string, string> | null;
  ruleOrder: number;
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Create/update payload — the mirrored Zod (createRuleSchema) validates it. */
export interface CreateRuleBody {
  name: string;
  trigger: RuleTriggerAst;
  action: RuleAction;
  targetFieldKeys: string[];
  setValueExpr?: string;
  message?: string;
  messageI18n?: Record<string, string>;
  ruleOrder?: number;
  isEnabled?: boolean;
}

/** The `POST …/rules/validate` report (API §3.10 ValidateRulesData). */
export interface RuleEffect {
  fieldKey: string;
  visible: boolean;
  enabled: boolean;
  required: boolean;
  value?: unknown;
}
export interface RuleError {
  fieldKey: string;
  code: 'REQUIRED' | 'RULE_VALIDATION';
  message: string;
}
export interface ValidateRulesData {
  ok: boolean;
  effects: RuleEffect[];
  errors: RuleError[];
}
