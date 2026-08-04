/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/promptAppearance.ts
 *   FE: src/app/shared/validators/promptAppearance.ts
 *
 * Prompt appearance is a discriminated union on Prompt.type. Each variant is a
 * whitelisted, validated passthrough to a shared component's @Input surface,
 * plus admin-semantic options that are resolved to component inputs at render
 * time (allowFutureDate -> maxDate, decimals -> maxFractionDigits, ...).
 *
 * The server re-enforces every constraint on execute — these are business
 * rules, not UX, and a user can always POST past the widget.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Base ──────────────────────────────────────────────────────────────

const baseAppearance = z.object({
  label: z.string().max(120).optional(),
  placeholder: z.string().max(160).optional(),
  hint: z.string().max(240).optional(),
  tooltip: z.string().max(240).optional(),
  icon: z.string().max(48).optional(),
  styleClass: z.string().max(120).optional(),
  floatingLabel: z.boolean().default(false),
  readonly: z.boolean().default(false),
  disabled: z.boolean().default(false),
  colSpan: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .default(1),
  showError: z.boolean().default(true),
  errorMessage: z.string().max(240).optional(),

  allowedOperators: z.array(z.string().max(48)).default([]),
  defaultOperator: z.string().max(48).optional(),
  lockOperator: z.boolean().default(false),
  hideOperator: z.boolean().default(false),
});

// ── Relative date bounds ──────────────────────────────────────────────

export const dateBound = z.union([
  z.object({ mode: z.literal('none') }),
  z.object({ mode: z.literal('absolute'), value: z.string() }),
  z.object({
    mode: z.literal('relative'),
    offset: z.number().int().min(-3650).max(3650),
    unit: z.enum(['day', 'week', 'month', 'quarter', 'year']),
    anchor: z
      .enum([
        'today',
        'startOfWeek',
        'startOfMonth',
        'startOfQuarter',
        'startOfYear',
        'endOfMonth',
        'endOfYear',
      ])
      .default('today'),
  }),
]);
export type DateBound = z.infer<typeof dateBound>;

const dateBehaviour = z.object({
  allowFutureDate: z.boolean().default(true),
  allowPastDate: z.boolean().default(true),
  allowToday: z.boolean().default(true),
  minDate: dateBound.default({ mode: 'none' }),
  maxDate: dateBound.default({ mode: 'none' }),
  disabledDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  disabledDates: z.array(z.string()).max(200).default([]),
  timezone: z.string().max(64).optional(),
});
export type DateBehaviour = z.infer<typeof dateBehaviour>;

// ── Per-type variants ─────────────────────────────────────────────────

const textAppearance = baseAppearance.extend({
  type: z.literal('text'),
  inputMode: z.enum(['input', 'textarea']).default('input'),
  rows: z.number().int().min(1).max(20).default(3),
  autoResize: z.boolean().default(false),
  minLength: z.number().int().min(0).max(4000).nullable().default(null),
  maxLength: z.number().int().min(1).max(4000).nullable().default(null),
  pattern: z.string().max(200).optional(),
  autocomplete: z.string().max(48).optional(),
  defaultValue: z.string().max(4000).optional(),
  trim: z.boolean().default(true),
  caseSensitive: z.boolean().default(false),
});

const numberAppearance = baseAppearance.extend({
  type: z.literal('number'),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  step: z.number().positive().default(1),
  showButtons: z.boolean().default(false),
  buttonLayout: z
    .enum(['stacked', 'horizontal', 'vertical'])
    .default('horizontal'),
  prefix: z.string().max(8).optional(),
  suffix: z.string().max(8).optional(),
  useGrouping: z.boolean().default(false),
  decimals: z.number().int().min(0).max(10).default(0),
  defaultValue: z.number().nullable().default(null),
});

const dropdownAppearance = baseAppearance.extend({
  type: z.literal('dropdown'),
  filter: z.boolean().default(true),
  filterMatchMode: z
    .enum([
      'contains',
      'startsWith',
      'endsWith',
      'equals',
      'notEquals',
      'in',
      'lt',
      'lte',
      'gt',
      'gte',
    ])
    .default('contains'),
  filterPlaceholder: z.string().max(80).optional(),
  resetFilterOnHide: z.boolean().default(false),
  showClear: z.boolean().default(true),
  editable: z.boolean().default(false),
  autoDisplayFirst: z.boolean().default(false),
  scrollHeight: z.string().max(12).default('200px'),
  virtualScroll: z.boolean().default(false),
  virtualScrollItemSize: z.number().int().min(16).max(80).default(38),
  emptyMessage: z.string().max(120).optional(),
  sortValues: z.enum(['none', 'asc', 'desc']).default('asc'),
  defaultValue: z.string().max(400).nullable().default(null),
  serverMode: z.boolean().default(false),
  pageSize: z.number().int().min(10).max(200).default(50),
  searchDebounceMs: z.number().int().min(0).max(2000).default(300),
  cascadeFrom: z.array(z.string().uuid()).max(5).default([]),
});

const multiselectAppearance = dropdownAppearance
  .omit({ type: true, editable: true, autoDisplayFirst: true })
  .extend({
    type: z.literal('multiselect'),
    display: z.enum(['chip', 'comma']).default('chip'),
    showToggleAll: z.boolean().default(true),
    showHeader: z.boolean().default(true),
    maxSelectedLabels: z.number().int().min(1).max(20).default(3),
    selectedItemsLabel: z.string().max(60).default('{0} items selected'),
    selectionLimit: z.number().int().min(1).max(5000).nullable().default(null),
    minSelections: z.number().int().min(0).max(5000).default(0),
    defaultValues: z.array(z.string().max(400)).max(200).default([]),
    selectAllByDefault: z.boolean().default(false),
  });

const dateAppearance = baseAppearance
  .extend({
    type: z.literal('date'),
    dateFormat: z.string().max(24).default('dd/mm/yy'),
    view: z.enum(['date', 'month', 'year']).default('date'),
    showIcon: z.boolean().default(true),
    showButtonBar: z.boolean().default(true),
    showWeek: z.boolean().default(false),
    numberOfMonths: z.number().int().min(1).max(3).default(1),
    yearRange: z
      .string()
      .regex(/^\d{4}:\d{4}$/)
      .default('2000:2035'),
    firstDayOfWeek: z.number().int().min(0).max(6).default(0),
    readonlyInput: z.boolean().default(false),
    touchUI: z.boolean().default(false),
    inline: z.boolean().default(false),
    defaultValue: dateBound.default({ mode: 'none' }),
  })
  .merge(dateBehaviour);

const calendarAppearance = dateAppearance.omit({ type: true }).extend({
  type: z.literal('calendar'),
  showTime: z.boolean().default(true),
  timeOnly: z.boolean().default(false),
  hourFormat: z.enum(['12', '24']).default('12'),
  showSeconds: z.boolean().default(false),
  stepHour: z.number().int().min(1).max(12).default(1),
  stepMinute: z.number().int().min(1).max(30).default(1),
  stepSecond: z.number().int().min(1).max(30).default(1),
  selectionMode: z.enum(['single', 'multiple']).default('single'),
  minTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  maxTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
});

const daterangeAppearance = dateAppearance
  .omit({ type: true, defaultValue: true })
  .extend({
    type: z.literal('daterange'),
    numberOfMonths: z.number().int().min(1).max(3).default(2),
    readonlyInput: z.boolean().default(true),
    showTime: z.boolean().default(false),
    hourFormat: z.enum(['12', '24']).default('12'),
    minRangeDays: z.number().int().min(0).max(3650).default(0),
    maxRangeDays: z.number().int().min(1).max(3650).nullable().default(null),
    requireBothEnds: z.boolean().default(true),
    allowSameDay: z.boolean().default(true),
    presets: z
      .array(
        z.object({
          code: z.string().max(32),
          label: z.string().max(48),
          from: dateBound,
          to: dateBound,
        }),
      )
      .max(20)
      .default([]),
    defaultPreset: z.string().max(32).optional(),
  });

const checkboxAppearance = baseAppearance.extend({
  type: z.literal('checkbox'),
  layout: z.enum(['horizontal', 'vertical']).default('horizontal'),
  columns: z.number().int().min(0).max(6).default(0),
  gap: z.enum(['small', 'medium', 'large']).default('medium'),
  labelPosition: z.enum(['right', 'left']).default('right'),
  checkboxIcon: z.string().max(48).default('pi pi-check'),
  minSelections: z.number().int().min(0).max(500).default(0),
  maxSelections: z.number().int().min(1).max(500).nullable().default(null),
  defaultValues: z.array(z.string().max(400)).max(200).default([]),
  sortValues: z.enum(['none', 'asc', 'desc']).default('asc'),
});

const radioAppearance = checkboxAppearance
  .omit({
    type: true,
    checkboxIcon: true,
    minSelections: true,
    maxSelections: true,
    defaultValues: true,
  })
  .extend({
    type: z.literal('radio'),
    defaultValue: z.string().max(400).nullable().default(null),
  });

const rangesliderAppearance = baseAppearance
  .extend({
    type: z.literal('rangeslider'),
    min: z.number().default(0),
    max: z.number().default(100),
    step: z.number().positive().default(1),
    orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
    animate: z.boolean().default(false),
    showValueLabels: z.boolean().default(true),
    showBoundLabels: z.boolean().default(true),
    defaultLow: z.number().nullable().default(null),
    defaultHigh: z.number().nullable().default(null),
    boundsFromData: z.boolean().default(false),
    unit: z.string().max(8).optional(),
  })
  .refine(v => v.max > v.min, {
    message: 'validation.promptAppearance.max.gtMin',
  });

export const promptAppearanceSchema = z.discriminatedUnion('type', [
  textAppearance,
  numberAppearance,
  dropdownAppearance,
  multiselectAppearance,
  dateAppearance,
  calendarAppearance,
  daterangeAppearance,
  checkboxAppearance,
  radioAppearance,
  rangesliderAppearance,
]);
export type PromptAppearance = z.infer<typeof promptAppearanceSchema>;

/** The PUT /prompts/:id/appearance body. */
export const putPromptAppearanceSchema = z.object({
  appearance: promptAppearanceSchema,
});

/** True for the date-family types that carry dateBehaviour. */
export function isDateType(type: string): boolean {
  return type === 'date' || type === 'calendar' || type === 'daterange';
}

/** A sensible default appearance for a type when a stored config is missing. */
export function defaultAppearanceFor(type: string): PromptAppearance {
  const parsed = promptAppearanceSchema.safeParse({ type });
  if (parsed.success) return parsed.data;
  // text is the safest fallback control.
  return promptAppearanceSchema.parse({ type: 'text' });
}
