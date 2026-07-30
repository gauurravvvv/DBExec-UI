/**
 * qb-appearance-fields — the field descriptors that drive qb-appearance-form.
 *
 * The appearance config is a discriminated union on Prompt.type (spec §6.3).
 * Rather than hand-write ten near-identical templates, we describe each type's
 * editable fields as data and let one template render them with the shared
 * app-custom-* kit. Adding a field to a variant is a one-line descriptor edit,
 * not new markup.
 *
 * Every descriptor's `key` matches a property in promptAppearanceSchema, so the
 * form round-trips straight through the mirrored Zod validator on save.
 */

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'toggle'
  | 'select'
  | 'multiselect-codes'
  | 'chips';

export interface FieldOption {
  label: string;
  value: string;
}

export interface AppearanceField {
  key: string;
  /** i18n key for the field label. */
  label: string;
  kind: FieldKind;
  /** For 'select'. */
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  /** Nullable numeric (renders a clear affordance). */
  nullable?: boolean;
  /** i18n key for a helper hint under the field. */
  hint?: string;
}

export interface AppearanceSection {
  /** i18n key for the accordion section title. */
  title: string;
  fields: AppearanceField[];
}

// ── Shared field groups ─────────────────────────────────────────────────

const BASE_SECTION: AppearanceSection = {
  title: 'QUERY_BUILDER.APPEARANCE.SECTION_GENERAL',
  fields: [
    { key: 'label', label: 'QUERY_BUILDER.APPEARANCE.LABEL', kind: 'text' },
    {
      key: 'placeholder',
      label: 'QUERY_BUILDER.APPEARANCE.PLACEHOLDER',
      kind: 'text',
    },
    { key: 'hint', label: 'QUERY_BUILDER.APPEARANCE.HINT', kind: 'text' },
    { key: 'tooltip', label: 'QUERY_BUILDER.APPEARANCE.TOOLTIP', kind: 'text' },
    { key: 'icon', label: 'QUERY_BUILDER.APPEARANCE.ICON', kind: 'text' },
    {
      key: 'colSpan',
      label: 'QUERY_BUILDER.APPEARANCE.COL_SPAN',
      kind: 'select',
      options: [
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: '4', value: '4' },
      ],
    },
    {
      key: 'floatingLabel',
      label: 'QUERY_BUILDER.APPEARANCE.FLOATING_LABEL',
      kind: 'toggle',
    },
    {
      key: 'readonly',
      label: 'QUERY_BUILDER.APPEARANCE.READONLY',
      kind: 'toggle',
    },
    {
      key: 'disabled',
      label: 'QUERY_BUILDER.APPEARANCE.DISABLED',
      kind: 'toggle',
    },
    {
      key: 'showError',
      label: 'QUERY_BUILDER.APPEARANCE.SHOW_ERROR',
      kind: 'toggle',
    },
  ],
};

const OPERATOR_SECTION: AppearanceSection = {
  title: 'QUERY_BUILDER.APPEARANCE.SECTION_OPERATOR',
  fields: [
    {
      key: 'allowedOperators',
      label: 'QUERY_BUILDER.APPEARANCE.ALLOWED_OPERATORS',
      kind: 'multiselect-codes',
      hint: 'QUERY_BUILDER.APPEARANCE.ALLOWED_OPERATORS_HINT',
    },
    {
      key: 'defaultOperator',
      label: 'QUERY_BUILDER.APPEARANCE.DEFAULT_OPERATOR',
      kind: 'text',
    },
    {
      key: 'lockOperator',
      label: 'QUERY_BUILDER.APPEARANCE.LOCK_OPERATOR',
      kind: 'toggle',
    },
    {
      key: 'hideOperator',
      label: 'QUERY_BUILDER.APPEARANCE.HIDE_OPERATOR',
      kind: 'toggle',
    },
  ],
};

const DATE_BEHAVIOUR_SECTION: AppearanceSection = {
  title: 'QUERY_BUILDER.APPEARANCE.SECTION_DATE_RULES',
  fields: [
    {
      key: 'allowFutureDate',
      label: 'QUERY_BUILDER.APPEARANCE.ALLOW_FUTURE',
      kind: 'toggle',
    },
    {
      key: 'allowPastDate',
      label: 'QUERY_BUILDER.APPEARANCE.ALLOW_PAST',
      kind: 'toggle',
    },
    {
      key: 'allowToday',
      label: 'QUERY_BUILDER.APPEARANCE.ALLOW_TODAY',
      kind: 'toggle',
    },
  ],
};

const SORT_OPTIONS: FieldOption[] = [
  { label: 'QUERY_BUILDER.APPEARANCE.SORT_NONE', value: 'none' },
  { label: 'QUERY_BUILDER.APPEARANCE.SORT_ASC', value: 'asc' },
  { label: 'QUERY_BUILDER.APPEARANCE.SORT_DESC', value: 'desc' },
];

// ── Per-type variant sections ───────────────────────────────────────────

const VARIANT_SECTIONS: Record<string, AppearanceSection[]> = {
  text: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_TEXT',
      fields: [
        {
          key: 'inputMode',
          label: 'QUERY_BUILDER.APPEARANCE.INPUT_MODE',
          kind: 'select',
          options: [
            { label: 'QUERY_BUILDER.APPEARANCE.INPUT_SINGLE', value: 'input' },
            {
              label: 'QUERY_BUILDER.APPEARANCE.INPUT_TEXTAREA',
              value: 'textarea',
            },
          ],
        },
        {
          key: 'rows',
          label: 'QUERY_BUILDER.APPEARANCE.ROWS',
          kind: 'number',
          min: 1,
          max: 20,
        },
        {
          key: 'autoResize',
          label: 'QUERY_BUILDER.APPEARANCE.AUTO_RESIZE',
          kind: 'toggle',
        },
        {
          key: 'minLength',
          label: 'QUERY_BUILDER.APPEARANCE.MIN_LENGTH',
          kind: 'number',
          min: 0,
          max: 4000,
          nullable: true,
        },
        {
          key: 'maxLength',
          label: 'QUERY_BUILDER.APPEARANCE.MAX_LENGTH',
          kind: 'number',
          min: 1,
          max: 4000,
          nullable: true,
        },
        {
          key: 'pattern',
          label: 'QUERY_BUILDER.APPEARANCE.PATTERN',
          kind: 'text',
        },
        {
          key: 'caseSensitive',
          label: 'QUERY_BUILDER.APPEARANCE.CASE_SENSITIVE',
          kind: 'toggle',
          hint: 'QUERY_BUILDER.APPEARANCE.CASE_SENSITIVE_HINT',
        },
        {
          key: 'trim',
          label: 'QUERY_BUILDER.APPEARANCE.TRIM',
          kind: 'toggle',
        },
      ],
    },
  ],
  number: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_NUMBER',
      fields: [
        {
          key: 'min',
          label: 'QUERY_BUILDER.APPEARANCE.MIN',
          kind: 'number',
          nullable: true,
        },
        {
          key: 'max',
          label: 'QUERY_BUILDER.APPEARANCE.MAX',
          kind: 'number',
          nullable: true,
        },
        {
          key: 'step',
          label: 'QUERY_BUILDER.APPEARANCE.STEP',
          kind: 'number',
          min: 0,
        },
        {
          key: 'decimals',
          label: 'QUERY_BUILDER.APPEARANCE.DECIMALS',
          kind: 'number',
          min: 0,
          max: 10,
        },
        {
          key: 'showButtons',
          label: 'QUERY_BUILDER.APPEARANCE.SHOW_BUTTONS',
          kind: 'toggle',
        },
        {
          key: 'useGrouping',
          label: 'QUERY_BUILDER.APPEARANCE.USE_GROUPING',
          kind: 'toggle',
        },
        {
          key: 'prefix',
          label: 'QUERY_BUILDER.APPEARANCE.PREFIX',
          kind: 'text',
        },
        {
          key: 'suffix',
          label: 'QUERY_BUILDER.APPEARANCE.SUFFIX',
          kind: 'text',
        },
      ],
    },
  ],
  dropdown: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_DROPDOWN',
      fields: [
        {
          key: 'filter',
          label: 'QUERY_BUILDER.APPEARANCE.FILTER',
          kind: 'toggle',
        },
        {
          key: 'showClear',
          label: 'QUERY_BUILDER.APPEARANCE.SHOW_CLEAR',
          kind: 'toggle',
        },
        {
          key: 'editable',
          label: 'QUERY_BUILDER.APPEARANCE.EDITABLE',
          kind: 'toggle',
        },
        {
          key: 'sortValues',
          label: 'QUERY_BUILDER.APPEARANCE.SORT_VALUES',
          kind: 'select',
          options: SORT_OPTIONS,
        },
        {
          key: 'virtualScroll',
          label: 'QUERY_BUILDER.APPEARANCE.VIRTUAL_SCROLL',
          kind: 'toggle',
        },
        {
          key: 'pageSize',
          label: 'QUERY_BUILDER.APPEARANCE.PAGE_SIZE',
          kind: 'number',
          min: 10,
          max: 200,
        },
      ],
    },
  ],
  multiselect: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_MULTISELECT',
      fields: [
        {
          key: 'display',
          label: 'QUERY_BUILDER.APPEARANCE.DISPLAY',
          kind: 'select',
          options: [
            { label: 'QUERY_BUILDER.APPEARANCE.DISPLAY_CHIP', value: 'chip' },
            { label: 'QUERY_BUILDER.APPEARANCE.DISPLAY_COMMA', value: 'comma' },
          ],
        },
        {
          key: 'sortValues',
          label: 'QUERY_BUILDER.APPEARANCE.SORT_VALUES',
          kind: 'select',
          options: SORT_OPTIONS,
        },
        {
          key: 'showToggleAll',
          label: 'QUERY_BUILDER.APPEARANCE.SHOW_TOGGLE_ALL',
          kind: 'toggle',
        },
        {
          key: 'maxSelectedLabels',
          label: 'QUERY_BUILDER.APPEARANCE.MAX_SELECTED_LABELS',
          kind: 'number',
          min: 1,
          max: 20,
        },
        {
          key: 'selectionLimit',
          label: 'QUERY_BUILDER.APPEARANCE.SELECTION_LIMIT',
          kind: 'number',
          min: 1,
          max: 5000,
          nullable: true,
        },
        {
          key: 'minSelections',
          label: 'QUERY_BUILDER.APPEARANCE.MIN_SELECTIONS',
          kind: 'number',
          min: 0,
          max: 5000,
        },
        {
          key: 'selectAllByDefault',
          label: 'QUERY_BUILDER.APPEARANCE.SELECT_ALL_DEFAULT',
          kind: 'toggle',
        },
      ],
    },
  ],
  date: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_DATE',
      fields: [
        {
          key: 'dateFormat',
          label: 'QUERY_BUILDER.APPEARANCE.DATE_FORMAT',
          kind: 'text',
        },
        {
          key: 'view',
          label: 'QUERY_BUILDER.APPEARANCE.VIEW',
          kind: 'select',
          options: [
            { label: 'QUERY_BUILDER.APPEARANCE.VIEW_DATE', value: 'date' },
            { label: 'QUERY_BUILDER.APPEARANCE.VIEW_MONTH', value: 'month' },
            { label: 'QUERY_BUILDER.APPEARANCE.VIEW_YEAR', value: 'year' },
          ],
        },
        {
          key: 'showIcon',
          label: 'QUERY_BUILDER.APPEARANCE.SHOW_ICON',
          kind: 'toggle',
        },
        {
          key: 'showButtonBar',
          label: 'QUERY_BUILDER.APPEARANCE.SHOW_BUTTON_BAR',
          kind: 'toggle',
        },
        {
          key: 'numberOfMonths',
          label: 'QUERY_BUILDER.APPEARANCE.NUMBER_OF_MONTHS',
          kind: 'number',
          min: 1,
          max: 3,
        },
        {
          key: 'yearRange',
          label: 'QUERY_BUILDER.APPEARANCE.YEAR_RANGE',
          kind: 'text',
        },
      ],
    },
  ],
  calendar: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_CALENDAR',
      fields: [
        {
          key: 'dateFormat',
          label: 'QUERY_BUILDER.APPEARANCE.DATE_FORMAT',
          kind: 'text',
        },
        {
          key: 'showTime',
          label: 'QUERY_BUILDER.APPEARANCE.SHOW_TIME',
          kind: 'toggle',
        },
        {
          key: 'timeOnly',
          label: 'QUERY_BUILDER.APPEARANCE.TIME_ONLY',
          kind: 'toggle',
        },
        {
          key: 'hourFormat',
          label: 'QUERY_BUILDER.APPEARANCE.HOUR_FORMAT',
          kind: 'select',
          options: [
            { label: '12', value: '12' },
            { label: '24', value: '24' },
          ],
        },
        {
          key: 'showSeconds',
          label: 'QUERY_BUILDER.APPEARANCE.SHOW_SECONDS',
          kind: 'toggle',
        },
      ],
    },
  ],
  daterange: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_DATERANGE',
      fields: [
        {
          key: 'dateFormat',
          label: 'QUERY_BUILDER.APPEARANCE.DATE_FORMAT',
          kind: 'text',
        },
        {
          key: 'numberOfMonths',
          label: 'QUERY_BUILDER.APPEARANCE.NUMBER_OF_MONTHS',
          kind: 'number',
          min: 1,
          max: 3,
        },
        {
          key: 'minRangeDays',
          label: 'QUERY_BUILDER.APPEARANCE.MIN_RANGE_DAYS',
          kind: 'number',
          min: 0,
          max: 3650,
        },
        {
          key: 'maxRangeDays',
          label: 'QUERY_BUILDER.APPEARANCE.MAX_RANGE_DAYS',
          kind: 'number',
          min: 1,
          max: 3650,
          nullable: true,
        },
        {
          key: 'requireBothEnds',
          label: 'QUERY_BUILDER.APPEARANCE.REQUIRE_BOTH_ENDS',
          kind: 'toggle',
        },
        {
          key: 'allowSameDay',
          label: 'QUERY_BUILDER.APPEARANCE.ALLOW_SAME_DAY',
          kind: 'toggle',
        },
      ],
    },
  ],
  checkbox: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_CHECKBOX',
      fields: [
        {
          key: 'layout',
          label: 'QUERY_BUILDER.APPEARANCE.LAYOUT',
          kind: 'select',
          options: [
            {
              label: 'QUERY_BUILDER.APPEARANCE.LAYOUT_HORIZONTAL',
              value: 'horizontal',
            },
            {
              label: 'QUERY_BUILDER.APPEARANCE.LAYOUT_VERTICAL',
              value: 'vertical',
            },
          ],
        },
        {
          key: 'columns',
          label: 'QUERY_BUILDER.APPEARANCE.COLUMNS',
          kind: 'number',
          min: 0,
          max: 6,
        },
        {
          key: 'minSelections',
          label: 'QUERY_BUILDER.APPEARANCE.MIN_SELECTIONS',
          kind: 'number',
          min: 0,
          max: 500,
        },
        {
          key: 'maxSelections',
          label: 'QUERY_BUILDER.APPEARANCE.MAX_SELECTIONS',
          kind: 'number',
          min: 1,
          max: 500,
          nullable: true,
        },
        {
          key: 'sortValues',
          label: 'QUERY_BUILDER.APPEARANCE.SORT_VALUES',
          kind: 'select',
          options: SORT_OPTIONS,
        },
      ],
    },
  ],
  radio: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_RADIO',
      fields: [
        {
          key: 'layout',
          label: 'QUERY_BUILDER.APPEARANCE.LAYOUT',
          kind: 'select',
          options: [
            {
              label: 'QUERY_BUILDER.APPEARANCE.LAYOUT_HORIZONTAL',
              value: 'horizontal',
            },
            {
              label: 'QUERY_BUILDER.APPEARANCE.LAYOUT_VERTICAL',
              value: 'vertical',
            },
          ],
        },
        {
          key: 'columns',
          label: 'QUERY_BUILDER.APPEARANCE.COLUMNS',
          kind: 'number',
          min: 0,
          max: 6,
        },
        {
          key: 'sortValues',
          label: 'QUERY_BUILDER.APPEARANCE.SORT_VALUES',
          kind: 'select',
          options: SORT_OPTIONS,
        },
      ],
    },
  ],
  rangeslider: [
    {
      title: 'QUERY_BUILDER.APPEARANCE.SECTION_RANGESLIDER',
      fields: [
        {
          key: 'min',
          label: 'QUERY_BUILDER.APPEARANCE.MIN',
          kind: 'number',
        },
        {
          key: 'max',
          label: 'QUERY_BUILDER.APPEARANCE.MAX',
          kind: 'number',
        },
        {
          key: 'step',
          label: 'QUERY_BUILDER.APPEARANCE.STEP',
          kind: 'number',
          min: 0,
        },
        {
          key: 'orientation',
          label: 'QUERY_BUILDER.APPEARANCE.ORIENTATION',
          kind: 'select',
          options: [
            {
              label: 'QUERY_BUILDER.APPEARANCE.LAYOUT_HORIZONTAL',
              value: 'horizontal',
            },
            {
              label: 'QUERY_BUILDER.APPEARANCE.LAYOUT_VERTICAL',
              value: 'vertical',
            },
          ],
        },
        {
          key: 'showValueLabels',
          label: 'QUERY_BUILDER.APPEARANCE.SHOW_VALUE_LABELS',
          kind: 'toggle',
        },
        {
          key: 'unit',
          label: 'QUERY_BUILDER.APPEARANCE.UNIT',
          kind: 'text',
        },
      ],
    },
  ],
};

const DATE_TYPES = new Set(['date', 'calendar', 'daterange']);

/**
 * Ordered accordion sections for a prompt type: General, the type-specific
 * variant, the date-rules block for date types, and Operator behaviour.
 */
export function sectionsForType(type: string): AppearanceSection[] {
  const variant = VARIANT_SECTIONS[type] ?? [];
  const sections = [BASE_SECTION, ...variant];
  if (DATE_TYPES.has(type)) sections.push(DATE_BEHAVIOUR_SECTION);
  sections.push(OPERATOR_SECTION);
  return sections;
}
