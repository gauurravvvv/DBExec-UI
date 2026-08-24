/**
 * Prompt control types, grouped for the Add screen's grouped dropdown.
 *
 * A prompt carries TWO dimensions:
 *  - `type`     — the runtime WIDGET (dropdown / text / calendar …). These 9.
 *  - `dataType` — the LOGICAL data type driving operator applicability. Chosen
 *                 at Add (defaulted from the widget) and re-inferred in config
 *                 from the source column. Free-form (see PROMPT_DATA_TYPES).
 *
 * `group` sorts the widgets into Choice / Input / Date sections so the set
 * reads as complete. `icon` is a PrimeIcon; `labelKey`/`hintKey` are i18n keys.
 * `defaultDataType` seeds the dataType field when the widget is picked (before
 * a source column exists to infer from).
 */
export interface PromptTypeOption {
  value: string;
  labelKey: string;
  hintKey: string;
  icon: string;
  group: 'choice' | 'input' | 'date';
  defaultDataType: string;
}

export const PROMPT_TYPE_GROUP_LABELS: Record<string, string> = {
  choice: 'PROMPT_MODULE.TYPE_GROUP.CHOICE',
  input: 'PROMPT_MODULE.TYPE_GROUP.INPUT',
  date: 'PROMPT_MODULE.TYPE_GROUP.DATE',
};

export const PROMPT_TYPE_OPTIONS: PromptTypeOption[] = [
  // ── Choice ──────────────────────────────────────────────────────────
  {
    value: 'dropdown',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.DROPDOWN',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.DROPDOWN',
    icon: 'pi pi-list',
    group: 'choice',
    defaultDataType: 'enum',
  },
  {
    value: 'multiselect',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.MULTISELECT',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.MULTISELECT',
    icon: 'pi pi-th-large',
    group: 'choice',
    defaultDataType: 'enum',
  },
  {
    value: 'radio',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.RADIO',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.RADIO',
    icon: 'pi pi-circle',
    group: 'choice',
    defaultDataType: 'enum',
  },
  {
    value: 'checkbox',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.CHECKBOX',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.CHECKBOX',
    icon: 'pi pi-check-square',
    group: 'choice',
    defaultDataType: 'bool',
  },
  // ── Input ───────────────────────────────────────────────────────────
  {
    value: 'text',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.TEXT',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.TEXT',
    icon: 'pi pi-align-left',
    group: 'input',
    defaultDataType: 'text',
  },
  {
    value: 'number',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.NUMBER',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.NUMBER',
    icon: 'pi pi-hashtag',
    group: 'input',
    defaultDataType: 'number',
  },
  {
    value: 'rangeslider',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.RANGESLIDER',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.RANGESLIDER',
    icon: 'pi pi-sliders-h',
    group: 'input',
    defaultDataType: 'number',
  },
  // ── Date ────────────────────────────────────────────────────────────
  {
    value: 'calendar',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.CALENDAR',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.CALENDAR',
    icon: 'pi pi-calendar',
    group: 'date',
    defaultDataType: 'date',
  },
  {
    value: 'daterange',
    labelKey: 'PROMPT_MODULE.TYPE_OPT.DATERANGE',
    hintKey: 'PROMPT_MODULE.TYPE_HINT.DATERANGE',
    icon: 'pi pi-calendar-plus',
    group: 'date',
    defaultDataType: 'datetime',
  },
];

/** Widget → default dataType (used before a source column exists to infer from). */
export const DEFAULT_DATATYPE_BY_TYPE: Record<string, string> =
  PROMPT_TYPE_OPTIONS.reduce(
    (acc, o) => {
      acc[o.value] = o.defaultDataType;
      return acc;
    },
    {} as Record<string, string>,
  );

/** The canonical logical data types (suggested options; dataType is free-form). */
export const PROMPT_DATA_TYPE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'text', labelKey: 'PROMPT_MODULE.DATATYPE.TEXT' },
  { value: 'number', labelKey: 'PROMPT_MODULE.DATATYPE.NUMBER' },
  { value: 'date', labelKey: 'PROMPT_MODULE.DATATYPE.DATE' },
  { value: 'datetime', labelKey: 'PROMPT_MODULE.DATATYPE.DATETIME' },
  { value: 'bool', labelKey: 'PROMPT_MODULE.DATATYPE.BOOL' },
  { value: 'enum', labelKey: 'PROMPT_MODULE.DATATYPE.ENUM' },
  { value: 'uuid', labelKey: 'PROMPT_MODULE.DATATYPE.UUID' },
];

/** Which widget types are CHOICE (show a Values list) vs free INPUT (show constraints). */
export const CHOICE_TYPES = new Set(['dropdown', 'multiselect', 'radio', 'checkbox']);
export const isChoiceType = (type: string | null | undefined): boolean =>
  !!type && CHOICE_TYPES.has(type);

/**
 * Infer the logical dataType from a datasource column's DB type string.
 * Broad, forgiving mapping; anything unrecognised falls back to `text` (which
 * yields the widest applicable operator set). Used in config when a source
 * column is picked (unless the admin has overridden dataType).
 */
export function inferDataTypeFromDbType(dbType: string | null | undefined): string {
  const t = (dbType ?? '').toLowerCase();
  if (!t) return 'text';
  if (/(^|[^a-z])(bool|boolean|bit)([^a-z]|$)/.test(t)) return 'bool';
  if (/uuid|uniqueidentifier/.test(t)) return 'uuid';
  if (/timestamp|datetime|datetimeoffset/.test(t)) return 'datetime';
  if (/date|time/.test(t)) return 'date';
  if (
    /int|serial|numeric|decimal|real|double|float|money|number|bigint|smallint/.test(t)
  ) {
    return 'number';
  }
  if (/enum/.test(t)) return 'enum';
  return 'text';
}

/**
 * @deprecated Legacy flat list kept for any lingering importer. New code uses
 * PROMPT_TYPE_OPTIONS (grouped, i18n, icons). Values match the widget codes.
 */
export const PROMPT_TYPES = PROMPT_TYPE_OPTIONS.map(o => ({
  label: o.value,
  value: o.value,
}));
