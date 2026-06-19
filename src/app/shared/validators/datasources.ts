/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/datasources.ts
 *   FE: src/app/shared/validators/datasources.ts
 *
 * See organisation.ts for the convention overview.
 *
 * Field rules for the Datasource add / update / validate (test
 * connection) endpoints. Snowflake datasources use a different
 * required-set (account + warehouse instead of host + port) so the
 * composite schemas branch with z.discriminatedUnion on `type`.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Standard patterns ──────────────────────────────────────────────

/**
 * Display name: starts with alphanumeric, then alphanumeric / space /
 * dot / underscore / hyphen. Same shape used across user-typed names
 * in the app (org, group, dataset, ...). Keeps SQL-injection-y
 * characters out of names that surface in audit logs and exports.
 */
export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;

/**
 * Database hostname: alphanumerics, dot, hyphen — covers IPv4 +
 * RFC 1123 hostnames. IPv6 is intentionally not supported because
 * none of the underlying drivers accept bracketed v6 literals in
 * the same `host` config field anyway.
 */
export const DB_HOST_PATTERN = /^[A-Za-z0-9.-]+$/;

/**
 * Logical database name on the server. Identifiers across PG / MySQL /
 * MSSQL / Snowflake all accept letters, digits, underscore, hyphen.
 * Spaces are rejected to avoid the quoting / case-folding minefield.
 */
export const DB_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

// ── Length bounds ──────────────────────────────────────────────────

export const DB_LIMITS = {
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 64,
  HOST_MAX: 255,
  NAME_MAX: 128,
  USERNAME_MAX: 128,
  PASSWORD_MAX: 256,
  DESCRIPTION_MAX: 500,
  JUSTIFICATION_MAX: 500,
  ACCOUNT_MAX: 128, // Snowflake account locator
  WAREHOUSE_MAX: 128, // Snowflake warehouse name
  ROLE_MAX: 128, // Snowflake role
  SCHEMA_MAX: 128, // Snowflake default schema
  PORT_MIN: 1,
  PORT_MAX: 65535,
} as const;

/** Drivers DBExec ships with. Keep in sync with config.DB_TYPES on BE. */
export const DB_TYPE_VALUES = [
  'postgres',
  'mysql',
  'mariadb',
  'mssql',
  'oracle',
  'snowflake',
] as const;
export type DbType = (typeof DB_TYPE_VALUES)[number];

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length === 0 ? undefined : t;
  }
  return v;
};

/** Empty string / null → undefined; otherwise pass through. */
const blankToUndefined = (v: unknown): unknown =>
  v === '' || v === null ? undefined : v;

/**
 * Port preprocess — the FE sends a number (input type=number) but
 * a stale form draft can land an empty string. Coerce numeric
 * strings, treat blank/null as undefined so .min/.max apply
 * deterministically.
 */
const portPreprocess = (v: unknown): unknown => {
  if (v === '' || v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isNaN(n) ? v : n;
  }
  return v;
};

// ── Field schemas ──────────────────────────────────────────────────

/** User-facing datasource label shown in lists, exports, audit logs. */
export const dbDisplayNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasources.name.required' })
    .min(DB_LIMITS.DISPLAY_NAME_MIN, {
      message: 'validation.datasources.name.tooShort',
    })
    .max(DB_LIMITS.DISPLAY_NAME_MAX, {
      message: 'validation.datasources.name.tooLong',
    })
    .regex(DISPLAY_NAME_PATTERN, {
      message: 'validation.datasources.name.invalid',
    }),
);

/** Optional free-text description. */
export const descriptionSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(DB_LIMITS.DESCRIPTION_MAX, {
      message: 'validation.datasources.description.tooLong',
    })
    .optional(),
);

/** Driver / engine selection. */
export const dbTypeSchema = z.preprocess(
  trimOrUndefined,
  z.enum(DB_TYPE_VALUES, {
    message: 'validation.datasources.type.invalid',
  }),
);

export const dbHostSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasources.host.required' })
    .max(DB_LIMITS.HOST_MAX, {
      message: 'validation.datasources.host.tooLong',
    })
    .regex(DB_HOST_PATTERN, {
      message: 'validation.datasources.host.invalid',
    }),
);

export const dbPortSchema = z.preprocess(
  portPreprocess,
  z
    .number({ message: 'validation.datasources.port.required' })
    .int({ message: 'validation.datasources.port.invalid' })
    .min(DB_LIMITS.PORT_MIN, {
      message: 'validation.datasources.port.invalid',
    })
    .max(DB_LIMITS.PORT_MAX, {
      message: 'validation.datasources.port.invalid',
    }),
);

export const dbNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasources.database.required' })
    .min(1, { message: 'validation.datasources.database.required' })
    .max(DB_LIMITS.NAME_MAX, {
      message: 'validation.datasources.database.tooLong',
    })
    .regex(DB_NAME_PATTERN, {
      message: 'validation.datasources.database.invalid',
    }),
);

export const dbUsernameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasources.username.required' })
    .min(1, { message: 'validation.datasources.username.required' })
    .max(DB_LIMITS.USERNAME_MAX, {
      message: 'validation.datasources.username.tooLong',
    }),
);

export const dbPasswordSchema = z.preprocess(
  blankToUndefined,
  z
    .string({ message: 'validation.datasources.password.required' })
    .min(1, { message: 'validation.datasources.password.required' })
    .max(DB_LIMITS.PASSWORD_MAX, {
      message: 'validation.datasources.password.tooLong',
    }),
);

/** Snowflake-only — account locator (e.g. xy12345.us-east-1). */
export const snowflakeAccountSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasources.account.required' })
    .min(1, { message: 'validation.datasources.account.required' })
    .max(DB_LIMITS.ACCOUNT_MAX, {
      message: 'validation.datasources.account.tooLong',
    }),
);

/** Snowflake-only — warehouse to run queries on. */
export const snowflakeWarehouseSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.datasources.warehouse.required' })
    .min(1, { message: 'validation.datasources.warehouse.required' })
    .max(DB_LIMITS.WAREHOUSE_MAX, {
      message: 'validation.datasources.warehouse.tooLong',
    }),
);

/** Snowflake-only — session role. Optional. */
export const snowflakeRoleSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(DB_LIMITS.ROLE_MAX, {
      message: 'validation.datasources.role.tooLong',
    })
    .optional(),
);

/** Snowflake-only — default schema. Optional. */
export const snowflakeSchemaSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .max(DB_LIMITS.SCHEMA_MAX, {
      message: 'validation.datasources.schemaName.tooLong',
    })
    .optional(),
);

// ── Composite schemas ──────────────────────────────────────────────

/**
 * Common required fields shared by Add and Validate (test-connection)
 * regardless of driver. Driver-specific connection fields are added
 * by the discriminated branches below.
 */
const baseConnectionShape = {
  type: dbTypeSchema,
  database: dbNameSchema,
  username: dbUsernameSchema,
  password: dbPasswordSchema,
};

/**
 * TypeORM-driver datasources (postgres / mysql / mariadb / mssql /
 * oracle) need host + port + db name. Account/warehouse/role/schema
 * are accepted but ignored at the controller layer.
 */
const typeOrmAddBranch = z.object({
  ...baseConnectionShape,
  type: z.enum(['postgres', 'mysql', 'mariadb', 'mssql', 'oracle'], {
    message: 'validation.datasources.type.invalid',
  }),
  host: dbHostSchema,
  port: dbPortSchema,
  account: z.preprocess(blankToUndefined, z.string().optional()),
  warehouse: z.preprocess(blankToUndefined, z.string().optional()),
  role: snowflakeRoleSchema,
  schemaName: snowflakeSchemaSchema,
});

const snowflakeAddBranch = z.object({
  ...baseConnectionShape,
  type: z.literal('snowflake'),
  host: z.preprocess(blankToUndefined, z.string().optional()),
  port: z.preprocess(blankToUndefined, z.union([z.string(), z.number()]).optional()),
  account: snowflakeAccountSchema,
  warehouse: snowflakeWarehouseSchema,
  role: snowflakeRoleSchema,
  schemaName: snowflakeSchemaSchema,
});

/** Body of POST /datasource/validate — test a credential set. */
export const validateDatasourceSchema = z.discriminatedUnion('type', [
  typeOrmAddBranch,
  snowflakeAddBranch,
]);

/** Body of POST /datasource/add — create a new datasource. */
export const addDatasourceSchema = z.discriminatedUnion('type', [
  typeOrmAddBranch.extend({
    name: dbDisplayNameSchema,
    description: descriptionSchema,
  }),
  snowflakeAddBranch.extend({
    name: dbDisplayNameSchema,
    description: descriptionSchema,
  }),
]);

/**
 * Body of PUT /datasource/update.
 *
 * `type` is intentionally OMITTED from the payload — engine swap is
 * not a supported operation; the controller silently preserves the
 * existing config.dbType. `password` is optional ("keep existing").
 * Host/port/Snowflake fields are optional because we don't know the
 * stored engine until the controller loads the row.
 */
export const updateDatasourceSchema = z.object({
  id: z.preprocess(
    trimOrUndefined,
    z
      .string({ message: 'validation.datasources.id.required' })
      .min(1, { message: 'validation.datasources.id.required' }),
  ),
  name: dbDisplayNameSchema,
  description: descriptionSchema,
  database: dbNameSchema,
  username: dbUsernameSchema,
  // Optional — empty means "leave the stored password alone".
  password: z.preprocess(
    blankToUndefined,
    z
      .string()
      .max(DB_LIMITS.PASSWORD_MAX, {
        message: 'validation.datasources.password.tooLong',
      })
      .optional(),
  ),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
  justification: z.preprocess(
    blankToUndefined,
    z
      .string()
      .max(DB_LIMITS.JUSTIFICATION_MAX, {
        message: 'validation.datasources.justification.tooLong',
      })
      .optional(),
  ),
  host: z.preprocess(
    blankToUndefined,
    z
      .string()
      .max(DB_LIMITS.HOST_MAX, {
        message: 'validation.datasources.host.tooLong',
      })
      .regex(DB_HOST_PATTERN, {
        message: 'validation.datasources.host.invalid',
      })
      .optional(),
  ),
  port: z.preprocess(
    portPreprocess,
    z
      .number()
      .int({ message: 'validation.datasources.port.invalid' })
      .min(DB_LIMITS.PORT_MIN, {
        message: 'validation.datasources.port.invalid',
      })
      .max(DB_LIMITS.PORT_MAX, {
        message: 'validation.datasources.port.invalid',
      })
      .optional(),
  ),
  account: z.preprocess(
    blankToUndefined,
    z
      .string()
      .max(DB_LIMITS.ACCOUNT_MAX, {
        message: 'validation.datasources.account.tooLong',
      })
      .optional(),
  ),
  warehouse: z.preprocess(
    blankToUndefined,
    z
      .string()
      .max(DB_LIMITS.WAREHOUSE_MAX, {
        message: 'validation.datasources.warehouse.tooLong',
      })
      .optional(),
  ),
  role: snowflakeRoleSchema,
  schemaName: snowflakeSchemaSchema,
});
export type UpdateDatasourceInput = z.infer<typeof updateDatasourceSchema>;
