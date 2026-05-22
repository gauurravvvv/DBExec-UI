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
export interface DatabaseTypeOption {
  value: 'postgres' | 'mysql' | 'mariadb' | 'mssql' | 'oracle';
  label: string;
  iconClass: string;
  defaultPort: number;
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
];
