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
