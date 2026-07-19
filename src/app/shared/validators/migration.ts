/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/migration.ts
 *   FE: src/app/shared/validators/migration.ts
 *
 * Single source of truth for the seamless asset-migration bundle contract.
 * The BE serializers produce a `DbExecMigrationBundle`; the BE import
 * controller validates the uploaded body against `migrationBundleSchema`
 * (via zodValidate); the FE reads a picked file, JSON.parses it, and
 * validates it against the SAME schema before POSTing. One contract, so
 * the client and server can never drift.
 *
 * LOCKED invariants encoded here:
 *   • Auto-include dependencies (Tableau .twbx / Power-BI .pbix model) — the
 *     exporter walks each picked asset's dependency chain and includes the
 *     dataset (and, for a dashboard, the source analysis + its dataset) in the
 *     SAME bundle, de-duped by source id. Assets reference their in-bundle
 *     dependencies by bundle-local `handle` (`datasetHandle` /
 *     `sourceAnalysisHandle`), never a real UUID.
 *   • Secretless — a datasource descriptor has NO password field AT ALL,
 *     no source UUID, no organisationId. Child DTOs use LOCAL string keys.
 *   • Bulk-first — a bundle holds N assets (any mix of the three types) + all
 *     their (de-duped) dependencies, each referencing a de-duped datasource by
 *     `datasourceHandle`.
 *
 * Zod 4 note: `z.record` takes TWO args — `z.record(z.string(), z.any())`.
 * Messages are i18n keys (`validation.migration.*`) resolved by the locale
 * layer, exactly like the other mirrored validators.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Shared enums / limits ────────────────────────────────────────────

/** The three asset families that can be exported / imported. */
export const MIGRATION_ASSET_TYPES = [
  'dataset',
  'analysis',
  'dashboard',
] as const;
export type MigrationAssetType = (typeof MIGRATION_ASSET_TYPES)[number];

/** Export file formats. YAML is reserved (JSON only in v1). */
export const MIGRATION_FORMATS = ['json', 'yaml'] as const;
export type MigrationFormat = (typeof MIGRATION_FORMATS)[number];

/** Drivers DBExec ships with. Keep in sync with config.DB_TYPES on BE. */
export const MIGRATION_DB_TYPE_VALUES = [
  'postgres',
  'mysql',
  'mariadb',
  'mssql',
  'oracle',
  'snowflake',
] as const;

export const MIGRATION_LIMITS = {
  /** Hard cap on assets in one bundle — DoS guard. */
  ASSETS_MAX: 200,
  /** Hard cap on distinct datasources in one bundle. */
  DATASOURCES_MAX: 100,
  /** Hard cap on export request items. */
  EXPORT_ITEMS_MAX: 200,
  /** The one schema version this build understands. */
  SCHEMA_VERSION: 1,
} as const;

// ── Generic scalar helpers (permissive round-trip) ───────────────────
//
// Child DTOs faithfully round-trip entity columns, most of which are
// free-form (chart config JSON, formula text, etc). We validate the
// SECURITY-critical shape (no password, discriminated type, handle wiring)
// strictly and let the free-form bodies pass through as-is.

/** Any JSON value (scalars, arrays, objects). */
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

/** A free-form JSONB config blob. */
const jsonObject = z.record(z.string(), z.any());

/** A local handle / key — a non-empty opaque string (source id reused). */
const localKey = z
  .string({ message: 'validation.migration.localKey.required' })
  .min(1, { message: 'validation.migration.localKey.required' });

const nullableString = z.string().nullable().optional();

// ── Datasource descriptor (the rebind key — NO PASSWORD) ─────────────

/**
 * One entry per distinct datasource referenced in the bundle, de-duped by
 * natural key and referenced by `handle`. Carries ONLY the natural-key
 * columns + display name. There is deliberately NO password / secret / UUID
 * / organisationId field — a strict object rejects any that sneak in.
 */
export const datasourceDescriptorSchema = z
  .object({
    handle: z
      .string({ message: 'validation.migration.datasource.handle.required' })
      .min(1, {
        message: 'validation.migration.datasource.handle.required',
      }),
    name: z
      .string({ message: 'validation.migration.datasource.name.required' })
      .min(1, { message: 'validation.migration.datasource.name.required' }),
    dbType: z.enum(MIGRATION_DB_TYPE_VALUES, {
      message: 'validation.migration.datasource.dbType.invalid',
    }),
    host: z.string().nullable().optional(),
    port: z.number().int().nullable().optional(),
    dbName: z
      .string({ message: 'validation.migration.datasource.dbName.required' })
      .min(1, { message: 'validation.migration.datasource.dbName.required' }),
    username: z
      .string({
        message: 'validation.migration.datasource.username.required',
      })
      .min(1, {
        message: 'validation.migration.datasource.username.required',
      }),
    // Snowflake-only natural-key parts. Optional; NULL for other engines.
    account: nullableString,
    warehouse: nullableString,
    role: nullableString,
    schemaName: nullableString,
  })
  .strict();
export type DatasourceDescriptor = z.infer<typeof datasourceDescriptorSchema>;

// ── Child DTOs (local keys; free-form bodies) ────────────────────────

/** A dataset / analysis-scoped field row (mirrors DatasetField). */
export const datasetFieldDtoSchema = z.object({
  localId: localKey,
  columnToUse: z.string(),
  columnToView: z.string(),
  customLogic: nullableString,
  isCfUsed: z.number().int().optional(),
  type: z.number().int().optional(),
  dataType: nullableString,
  sequence: z.number().int().optional(),
  // Rich display-only metadata (all nullable/additive on the entity).
  description: nullableString,
  role: nullableString,
  defaultAggregation: nullableString,
  formatHint: jsonObject.nullable().optional(),
  isVisible: z.boolean().nullable().optional(),
  typeOverride: nullableString,
  continuousDiscrete: nullableString,
  semanticType: nullableString,
  doNotAggregate: z.boolean().nullable().optional(),
});
export type DatasetFieldDto = z.infer<typeof datasetFieldDtoSchema>;

/** A field-relation edge, remapped through the field local-key map. */
export const fieldRelationDtoSchema = z.object({
  fieldLocalId: localKey,
  referencedFieldLocalId: localKey,
});
export type FieldRelationDto = z.infer<typeof fieldRelationDtoSchema>;

/** An analysis tab (mirrors AnalysisTab). */
export const tabDtoSchema = z.object({
  localId: localKey,
  name: z.string(),
  sequence: z.number().int().optional(),
  icon: nullableString,
  color: nullableString,
});
export type TabDto = z.infer<typeof tabDtoSchema>;

/** A visual placement (mirrors Visual / DashboardVisual). */
export const visualDtoSchema = z.object({
  localId: localKey,
  title: z.string(),
  widthRatio: z.string().optional(),
  heightRatio: z.string().optional(),
  xRatio: z.string().optional(),
  yRatio: z.string().optional(),
  tabLocalId: localKey.nullable().optional(),
  sequence: z.number().int().optional(),
});
export type VisualDto = z.infer<typeof visualDtoSchema>;

/** A visual config paired 1:1 with a visual (mirrors VisualConfig). */
export const visualConfigDtoSchema = z.object({
  localId: localKey,
  visualLocalId: localKey,
  chartType: z.string(),
  xAxisColumn: nullableString,
  yAxisColumn: nullableString,
  config: jsonValue.optional(),
  dimensionColumn: nullableString,
  measureColumn: nullableString,
  aggregate: nullableString,
});
export type VisualConfigDto = z.infer<typeof visualConfigDtoSchema>;

/** A filter (mirrors AnalysisFilter / DashboardFilter). */
export const filterDtoSchema = z.object({
  localId: localKey,
  name: z.string(),
  filterType: z.string(),
  columnName: z.string(),
  controlType: z.string(),
  config: jsonValue.optional(),
  nullOption: z.string().optional(),
  isEnabled: z.boolean().optional(),
  isMandatory: z.boolean().optional(),
  sequence: z.number().int().optional(),
  scope: z.string().optional(),
  targetTabLocalId: localKey.nullable().optional(),
  targetVisualLocalIds: z.array(z.string()).nullable().optional(),
});
export type FilterDto = z.infer<typeof filterDtoSchema>;

/** A parameter (mirrors AnalysisParameter / DashboardParameter). */
export const parameterDtoSchema = z.object({
  localId: localKey,
  name: z.string(),
  key: z.string(),
  dataType: z.string().optional(),
  defaultValue: jsonValue.nullable().optional(),
  allowedValues: z.array(jsonValue).optional(),
  bindColumn: nullableString,
  isRequired: z.boolean().optional(),
  sequence: z.number().int().optional(),
});
export type ParameterDto = z.infer<typeof parameterDtoSchema>;

/** A widget (mirrors AnalysisWidget / DashboardWidget). */
export const widgetDtoSchema = z.object({
  localId: localKey,
  tabLocalId: localKey.nullable().optional(),
  widgetType: z.string(),
  config: jsonValue.nullable().optional(),
  widthRatio: z.string().optional(),
  heightRatio: z.string().optional(),
  xRatio: z.string().optional(),
  yRatio: z.string().optional(),
  sequence: z.number().int().optional(),
});
export type WidgetDto = z.infer<typeof widgetDtoSchema>;

// ── Asset entries (discriminated on `type`) ──────────────────────────
//
// Auto-include-dependencies model (Tableau .twbx / Power-BI .pbix precedent):
// the exporter walks each picked asset's dependency chain and includes the
// dataset (and, for a dashboard, the source analysis + its dataset) in the
// SAME bundle, de-duped by source id. Assets reference their in-bundle
// dependencies by bundle-local `handle` — never a real UUID. Every asset
// therefore carries its own `handle` so other assets can point at it.

const assetBase = {
  // Bundle-local opaque handle (e.g. "dataset:d1", "analysis:a1"). Other
  // assets reference this asset by this handle; NEVER a real UUID.
  handle: z
    .string({ message: 'validation.migration.asset.handle.required' })
    .min(1, { message: 'validation.migration.asset.handle.required' }),
  name: z
    .string({ message: 'validation.migration.asset.name.required' })
    .min(1, { message: 'validation.migration.asset.name.required' }),
  description: nullableString,
  datasourceHandle: z
    .string({ message: 'validation.migration.asset.datasourceHandle.required' })
    .min(1, {
      message: 'validation.migration.asset.datasourceHandle.required',
    }),
};

/** A dataset asset — the dataset row + its dataset-scoped fields (leaf). */
export const datasetAssetSchema = z.object({
  type: z.literal('dataset'),
  ...assetBase,
  sql: z.string({ message: 'validation.migration.dataset.sql.required' }),
  datasetType: z.number().int().optional(),
  queryBuilderId: nullableString,
  promptConfig: nullableString,
  fields: z.array(datasetFieldDtoSchema),
  fieldRelations: z.array(fieldRelationDtoSchema).optional(),
});
export type DatasetAsset = z.infer<typeof datasetAssetSchema>;

/**
 * An analysis asset — the analysis row + its OWN children. `datasetHandle`
 * points at the dataset asset the exporter auto-included; the importer binds
 * the real imported dataset id through it.
 */
export const analysisAssetSchema = z.object({
  type: z.literal('analysis'),
  ...assetBase,
  // In-bundle key into the dataset asset this analysis depends on.
  datasetHandle: z
    .string({ message: 'validation.migration.asset.datasetHandle.required' })
    .min(1, { message: 'validation.migration.asset.datasetHandle.required' }),
  // Human-readable label only; binding is via datasetHandle.
  datasetName: nullableString,
  tabs: z.array(tabDtoSchema),
  visuals: z.array(visualDtoSchema),
  visualConfigs: z.array(visualConfigDtoSchema),
  filters: z.array(filterDtoSchema),
  parameters: z.array(parameterDtoSchema),
  widgets: z.array(widgetDtoSchema).optional(),
  // Analysis-scoped calc fields (DatasetField where analysisId = analysis.id).
  calcFields: z.array(datasetFieldDtoSchema),
});
export type AnalysisAsset = z.infer<typeof analysisAssetSchema>;

/**
 * A dashboard asset — the snapshot + handles to the auto-included source
 * analysis (`sourceAnalysisHandle`) and dataset (`datasetHandle`). The importer
 * binds the real imported ids through those handles.
 */
export const dashboardAssetSchema = z.object({
  type: z.literal('dashboard'),
  ...assetBase,
  // In-bundle key into the source analysis asset this dashboard was built from.
  // Nullable: a legacy dashboard whose sourceAnalysisId is null / points at a
  // deleted analysis carries null here (its snapshot children render standalone).
  sourceAnalysisHandle: z.string().min(1).nullable(),
  // In-bundle key into the dataset asset this dashboard runs against.
  datasetHandle: z
    .string({ message: 'validation.migration.asset.datasetHandle.required' })
    .min(1, { message: 'validation.migration.asset.datasetHandle.required' }),
  tabs: z.array(tabDtoSchema),
  visuals: z.array(visualDtoSchema),
  visualConfigs: z.array(visualConfigDtoSchema),
  filters: z.array(filterDtoSchema),
  parameters: z.array(parameterDtoSchema),
  fields: z.array(datasetFieldDtoSchema),
  fieldRelations: z.array(fieldRelationDtoSchema).optional(),
  widgets: z.array(widgetDtoSchema).optional(),
});
export type DashboardAsset = z.infer<typeof dashboardAssetSchema>;

/** Any migratable asset — discriminated union on `type`. */
export const migrationAssetSchema = z.discriminatedUnion('type', [
  datasetAssetSchema,
  analysisAssetSchema,
  dashboardAssetSchema,
]);
export type MigrationAsset = z.infer<typeof migrationAssetSchema>;

// ── Top-level bundle ─────────────────────────────────────────────────

/**
 * The portable migration file. `schemaVersion` is pinned to the one version
 * this build understands. `datasources` are de-duped by natural key and
 * referenced by handle; `assets` are the picked rows PLUS their auto-included
 * dependencies (dataset / source-analysis), de-duped by source id and wired to
 * each other by bundle-local handle. Org identity is NEVER carried — it is
 * re-stamped from the importer's JWT.
 */
export const migrationBundleSchema = z.object({
  schemaVersion: z.literal(MIGRATION_LIMITS.SCHEMA_VERSION, {
    message: 'validation.migration.schemaVersion.unsupported',
  }),
  sourceEnv: z.string().nullable().optional(),
  exportedAt: z.string().optional(),
  datasources: z
    .array(datasourceDescriptorSchema, {
      message: 'validation.migration.datasources.required',
    })
    .min(1, { message: 'validation.migration.datasources.required' })
    .max(MIGRATION_LIMITS.DATASOURCES_MAX, {
      message: 'validation.migration.datasources.tooMany',
    }),
  assets: z
    .array(migrationAssetSchema, {
      message: 'validation.migration.assets.required',
    })
    .min(1, { message: 'validation.migration.assets.required' })
    .max(MIGRATION_LIMITS.ASSETS_MAX, {
      message: 'validation.migration.assets.tooMany',
    }),
  checksum: z.string().optional(),
});
export type DbExecMigrationBundle = z.infer<typeof migrationBundleSchema>;

// ── Export request body ──────────────────────────────────────────────

/** One thing to export. */
export const exportItemSchema = z.object({
  assetType: z.enum(MIGRATION_ASSET_TYPES, {
    message: 'validation.migration.export.assetType.invalid',
  }),
  assetId: z
    .string({ message: 'validation.migration.export.assetId.required' })
    .min(1, { message: 'validation.migration.export.assetId.required' }),
});
export type ExportItem = z.infer<typeof exportItemSchema>;

/** Body of POST /migration/export. */
export const exportRequestSchema = z.object({
  items: z
    .array(exportItemSchema, {
      message: 'validation.migration.export.items.required',
    })
    .min(1, { message: 'validation.migration.export.items.required' })
    .max(MIGRATION_LIMITS.EXPORT_ITEMS_MAX, {
      message: 'validation.migration.export.items.tooMany',
    }),
  format: z
    .enum(MIGRATION_FORMATS, {
      message: 'validation.migration.export.format.invalid',
    })
    .optional(),
});
export type ExportRequest = z.infer<typeof exportRequestSchema>;
