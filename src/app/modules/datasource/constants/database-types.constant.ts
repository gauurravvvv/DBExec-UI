/**
 * Database engines exposed to the user in the Add / Edit Datasource form.
 *
 * `value` is the wire key sent to the BE — must match
 * DatasourceConfigS.dbType / DatabaseConfig.dbType on the API side (the
 * TypeORM `DatabaseType` strings). `defaultPort` pre-fills the port field
 * when the user picks a type. `iconClass` is the .ci-db-* class declared
 * in _custom-icons.scss; logos live as local SVGs under src/assets/icons
 * so there's no remote dependency at render time.
 */
export type DatabaseTypeValue =
  | 'postgres'
  | 'mysql'
  | 'mariadb'
  | 'mssql'
  | 'oracle'
  | 'snowflake';

export interface DatabaseTypeOption {
  value: DatabaseTypeValue;
  label: string;
  iconClass: string;
  // `defaultPort` doesn't apply to Snowflake — it's a cloud URL, not
  // a host+port pair. nullable to signal "skip the port field" at
  // the call site.
  defaultPort: number | null;
  // When true, the Add/Edit form shows Snowflake-specific fields
  // (account/warehouse/role/schema) and hides host+port. Cleaner than
  // re-checking the value string everywhere.
  isSnowflake?: boolean;
}

export const DATABASE_TYPES: DatabaseTypeOption[] = [
  {
    value: 'postgres',
    label: 'PostgreSQL',
    iconClass: 'ci-db ci-db-postgres',
    defaultPort: 5432,
  },
  {
    value: 'mysql',
    label: 'MySQL',
    iconClass: 'ci-db ci-db-mysql',
    defaultPort: 3306,
  },
  {
    value: 'mariadb',
    label: 'MariaDB',
    iconClass: 'ci-db ci-db-mariadb',
    defaultPort: 3306,
  },
  {
    value: 'mssql',
    label: 'SQL Server',
    iconClass: 'ci-db ci-db-mssql',
    defaultPort: 1433,
  },
  {
    value: 'oracle',
    label: 'Oracle',
    iconClass: 'ci-db ci-db-oracle',
    defaultPort: 1521,
  },
  {
    value: 'snowflake',
    label: 'Snowflake',
    iconClass: 'ci-db ci-db-snowflake',
    defaultPort: null,
    isSnowflake: true,
  },
];

/**
 * Helper used by the form to decide which fields to render. Centralised
 * here so the Add and Edit components don't drift on the comparison.
 */
export const isSnowflakeType = (value: string | null | undefined): boolean =>
  value === 'snowflake';
