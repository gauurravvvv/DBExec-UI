/**
 * Dialect-neutral SQL snippets. Plain SQL-92 / SQL-99 constructs that
 * read the same across all six supported engines. Per-engine extras
 * (Snowflake LATERAL FLATTEN, Postgres COPY FROM, MySQL ON DUPLICATE
 * KEY UPDATE) can be added later under DialectSpec.snippets if the
 * need arises — keeping them off the common list avoids polluting
 * the completion widget with engine-specific syntax that won't run
 * against the user's actual datasource.
 */
export interface SqlSnippet {
  label: string;
  insertText: string;
  documentation: string;
}

export const COMMON_SQL_SNIPPETS: SqlSnippet[] = [
  {
    label: 'select',
    insertText: 'SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition};',
    documentation: 'Basic SELECT statement',
  },
  {
    label: 'select-join',
    insertText:
      'SELECT ${1:t1.column}, ${2:t2.column}\nFROM ${3:table1} t1\nINNER JOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:id}\nWHERE ${7:condition};',
    documentation: 'SELECT with JOIN',
  },
  {
    label: 'select-group',
    insertText:
      'SELECT ${1:column}, COUNT(*) as count\nFROM ${2:table}\nGROUP BY ${1:column}\nHAVING COUNT(*) > ${3:1}\nORDER BY count DESC;',
    documentation: 'SELECT with GROUP BY',
  },
  {
    label: 'insert',
    insertText: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});',
    documentation: 'INSERT statement',
  },
  {
    label: 'update',
    insertText:
      'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};',
    documentation: 'UPDATE statement',
  },
  {
    label: 'delete',
    insertText: 'DELETE FROM ${1:table}\nWHERE ${2:condition};',
    documentation: 'DELETE statement',
  },
  {
    label: 'create-table',
    insertText:
      'CREATE TABLE ${1:table_name} (\n  ${2:id} INT PRIMARY KEY,\n  ${3:column} VARCHAR(255),\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
    documentation: 'CREATE TABLE statement',
  },
  {
    label: 'cte',
    insertText:
      'WITH ${1:cte_name} AS (\n  SELECT ${2:columns}\n  FROM ${3:table}\n  WHERE ${4:condition}\n)\nSELECT *\nFROM ${1:cte_name};',
    documentation: 'Common Table Expression (CTE)',
  },
  {
    label: 'case',
    insertText:
      'CASE\n  WHEN ${1:condition} THEN ${2:result}\n  WHEN ${3:condition} THEN ${4:result}\n  ELSE ${5:default}\nEND',
    documentation: 'CASE expression',
  },
  {
    label: 'window',
    insertText:
      'SELECT\n  ${1:column},\n  ROW_NUMBER() OVER (PARTITION BY ${2:partition_column} ORDER BY ${3:order_column}) as row_num\nFROM ${4:table};',
    documentation: 'Window function with ROW_NUMBER',
  },
];
