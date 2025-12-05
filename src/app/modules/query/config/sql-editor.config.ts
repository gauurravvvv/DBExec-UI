/**
 * SQL Editor Configuration
 * Contains Monaco Editor settings, SQL keywords, functions, and snippets
 */

/**
 * Monaco Editor configuration options
 */
export const MONACO_EDITOR_OPTIONS = {
  language: 'sql',
  automaticLayout: true,

  // IntelliSense & Autocomplete
  quickSuggestions: {
    other: true,
    comments: true,
    strings: true
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on' as const,
  acceptSuggestionOnCommitCharacter: true,
  wordBasedSuggestions: true,
  tabCompletion: 'on' as const,
  suggest: {
    showKeywords: true,
    showSnippets: true,
    showFunctions: true,
    showWords: true,
    insertMode: 'insert' as const,
    filterGraceful: true,
    snippetsPreventQuickSuggestions: false
  },
  quickSuggestionsDelay: 100,

  // UI Features
  minimap: { enabled: true },
  folding: true,
  lineNumbers: 'on' as const,
  renderLineHighlight: 'all' as const,
  scrollBeyondLastLine: false,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
  smoothScrolling: true,
  mouseWheelZoom: true,
  fontSize: 14,
  fontFamily: "'Fira Code', 'Courier New', monospace",
  fontLigatures: true,

  // Bracket Features
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true
  },

  // Editing Features
  formatOnPaste: true,
  formatOnType: true,
  autoClosingBrackets: 'always' as const,
  autoClosingQuotes: 'always' as const,
  autoIndent: 'full' as const,
  multiCursorModifier: 'alt' as const,

  // Scrollbar
  scrollbar: {
    vertical: 'visible' as const,
    horizontal: 'visible' as const,
    useShadows: true,
    verticalHasArrows: false,
    horizontalHasArrows: false,
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10
  }
};

/**
 * SQL Keywords for autocomplete
 */
export const SQL_KEYWORDS = [
  // Core SQL Commands
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP',
  'TRUNCATE', 'REPLACE', 'MERGE', 'UPSERT',
  
  // Joins
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
  'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
  
  // Clauses
  'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'DISTINCT', 'ALL',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'MINUS',
  
  // Conditions
  'AND', 'OR', 'NOT', 'IN', 'NOT IN', 'BETWEEN', 'LIKE', 'ILIKE', 'EXISTS', 'NOT EXISTS',
  'IS NULL', 'IS NOT NULL', 'ANY', 'SOME', 'ALL',
  
  // Database Objects
  'TABLE', 'VIEW', 'INDEX', 'SCHEMA', 'DATABASE', 'SEQUENCE', 'TRIGGER', 'PROCEDURE',
  'FUNCTION', 'CONSTRAINT', 'PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK', 'DEFAULT',
  
  // Data Types
  'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'NUMERIC', 'FLOAT',
  'DOUBLE', 'REAL', 'VARCHAR', 'CHAR', 'TEXT', 'DATE', 'TIME', 'TIMESTAMP', 'DATETIME',
  'BOOLEAN', 'BOOL', 'BLOB', 'CLOB', 'JSON', 'JSONB', 'XML', 'UUID', 'ARRAY',
  
  // Modifiers
  'AS', 'ON', 'USING', 'WITH', 'RECURSIVE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'IF', 'ELSEIF', 'ENDIF', 'WHILE', 'LOOP', 'REPEAT', 'UNTIL',
  
  // Transaction Control
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'TRANSACTION', 'START TRANSACTION',
  
  // Set Operations
  'SET', 'INTO', 'VALUES',
  
  // Window Functions
  'OVER', 'PARTITION BY', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE',
  'ROWS BETWEEN', 'RANGE BETWEEN', 'UNBOUNDED PRECEDING', 'CURRENT ROW', 'UNBOUNDED FOLLOWING',
  
  // CTEs
  'WITH RECURSIVE', 'CTE',
  
  // Performance
  'EXPLAIN', 'ANALYZE', 'VACUUM', 'OPTIMIZE',
  
  // Access Control
  'GRANT', 'REVOKE', 'DENY', 'PRIVILEGES', 'PERMISSIONS'
];

/**
 * SQL Built-in Functions for autocomplete
 */
export const SQL_FUNCTIONS = [
  // Aggregate Functions
  { name: 'COUNT', params: 'column', description: 'Returns the number of rows' },
  { name: 'SUM', params: 'column', description: 'Returns the sum of values' },
  { name: 'AVG', params: 'column', description: 'Returns the average of values' },
  { name: 'MIN', params: 'column', description: 'Returns the minimum value' },
  { name: 'MAX', params: 'column', description: 'Returns the maximum value' },
  { name: 'GROUP_CONCAT', params: 'column', description: 'Concatenates values from multiple rows' },
  { name: 'STRING_AGG', params: 'column, delimiter', description: 'Concatenates strings with delimiter' },
  
  // String Functions
  { name: 'CONCAT', params: 'str1, str2, ...', description: 'Concatenates strings' },
  { name: 'SUBSTRING', params: 'str, start, length', description: 'Extracts substring' },
  { name: 'UPPER', params: 'str', description: 'Converts to uppercase' },
  { name: 'LOWER', params: 'str', description: 'Converts to lowercase' },
  { name: 'TRIM', params: 'str', description: 'Removes leading/trailing spaces' },
  { name: 'LTRIM', params: 'str', description: 'Removes leading spaces' },
  { name: 'RTRIM', params: 'str', description: 'Removes trailing spaces' },
  { name: 'LENGTH', params: 'str', description: 'Returns string length' },
  { name: 'REPLACE', params: 'str, find, replace', description: 'Replaces substring' },
  { name: 'REVERSE', params: 'str', description: 'Reverses a string' },
  { name: 'LEFT', params: 'str, length', description: 'Returns leftmost characters' },
  { name: 'RIGHT', params: 'str, length', description: 'Returns rightmost characters' },
  
  // Date/Time Functions
  { name: 'NOW', params: '', description: 'Returns current date and time' },
  { name: 'CURRENT_DATE', params: '', description: 'Returns current date' },
  { name: 'CURRENT_TIME', params: '', description: 'Returns current time' },
  { name: 'CURRENT_TIMESTAMP', params: '', description: 'Returns current timestamp' },
  { name: 'DATE', params: 'datetime', description: 'Extracts date part' },
  { name: 'TIME', params: 'datetime', description: 'Extracts time part' },
  { name: 'YEAR', params: 'date', description: 'Extracts year' },
  { name: 'MONTH', params: 'date', description: 'Extracts month' },
  { name: 'DAY', params: 'date', description: 'Extracts day' },
  { name: 'HOUR', params: 'time', description: 'Extracts hour' },
  { name: 'MINUTE', params: 'time', description: 'Extracts minute' },
  { name: 'SECOND', params: 'time', description: 'Extracts second' },
  { name: 'DATE_ADD', params: 'date, interval', description: 'Adds interval to date' },
  { name: 'DATE_SUB', params: 'date, interval', description: 'Subtracts interval from date' },
  { name: 'DATEDIFF', params: 'date1, date2', description: 'Returns difference between dates' },
  { name: 'DATE_FORMAT', params: 'date, format', description: 'Formats date' },
  
  // Mathematical Functions
  { name: 'ABS', params: 'number', description: 'Returns absolute value' },
  { name: 'ROUND', params: 'number, decimals', description: 'Rounds number' },
  { name: 'CEIL', params: 'number', description: 'Rounds up' },
  { name: 'FLOOR', params: 'number', description: 'Rounds down' },
  { name: 'POWER', params: 'base, exponent', description: 'Returns power' },
  { name: 'SQRT', params: 'number', description: 'Returns square root' },
  { name: 'MOD', params: 'dividend, divisor', description: 'Returns modulo' },
  { name: 'RANDOM', params: '', description: 'Returns random number' },
  
  // Conditional Functions
  { name: 'COALESCE', params: 'value1, value2, ...', description: 'Returns first non-null value' },
  { name: 'NULLIF', params: 'value1, value2', description: 'Returns null if values are equal' },
  { name: 'IFNULL', params: 'value, default', description: 'Returns default if value is null' },
  { name: 'IF', params: 'condition, true_value, false_value', description: 'Conditional expression' },
  
  // Conversion Functions
  { name: 'CAST', params: 'value AS type', description: 'Converts data type' },
  { name: 'CONVERT', params: 'value, type', description: 'Converts data type' },
  { name: 'TO_CHAR', params: 'value, format', description: 'Converts to string' },
  { name: 'TO_DATE', params: 'str, format', description: 'Converts to date' },
  { name: 'TO_NUMBER', params: 'str', description: 'Converts to number' }
];

/**
 * SQL Code Snippets for autocomplete
 */
export const SQL_SNIPPETS = [
  {
    label: 'select',
    insertText: 'SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition};',
    documentation: 'Basic SELECT statement'
  },
  {
    label: 'select-join',
    insertText: 'SELECT ${1:t1.column}, ${2:t2.column}\nFROM ${3:table1} t1\nINNER JOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:id}\nWHERE ${7:condition};',
    documentation: 'SELECT with JOIN'
  },
  {
    label: 'select-group',
    insertText: 'SELECT ${1:column}, COUNT(*) as count\nFROM ${2:table}\nGROUP BY ${1:column}\nHAVING COUNT(*) > ${3:1}\nORDER BY count DESC;',
    documentation: 'SELECT with GROUP BY'
  },
  {
    label: 'insert',
    insertText: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});',
    documentation: 'INSERT statement'
  },
  {
    label: 'update',
    insertText: 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};',
    documentation: 'UPDATE statement'
  },
  {
    label: 'delete',
    insertText: 'DELETE FROM ${1:table}\nWHERE ${2:condition};',
    documentation: 'DELETE statement'
  },
  {
    label: 'create-table',
    insertText: 'CREATE TABLE ${1:table_name} (\n  ${2:id} INT PRIMARY KEY,\n  ${3:column} VARCHAR(255),\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
    documentation: 'CREATE TABLE statement'
  },
  {
    label: 'cte',
    insertText: 'WITH ${1:cte_name} AS (\n  SELECT ${2:columns}\n  FROM ${3:table}\n  WHERE ${4:condition}\n)\nSELECT *\nFROM ${1:cte_name};',
    documentation: 'Common Table Expression (CTE)'
  },
  {
    label: 'case',
    insertText: 'CASE\n  WHEN ${1:condition} THEN ${2:result}\n  WHEN ${3:condition} THEN ${4:result}\n  ELSE ${5:default}\nEND',
    documentation: 'CASE expression'
  },
  {
    label: 'window',
    insertText: 'SELECT\n  ${1:column},\n  ROW_NUMBER() OVER (PARTITION BY ${2:partition_column} ORDER BY ${3:order_column}) as row_num\nFROM ${4:table};',
    documentation: 'Window function with ROW_NUMBER'
  }
];

/**
 * Context analysis patterns for intelligent autocomplete
 */
export const CONTEXT_PATTERNS = {
  expectingTableName: /(FROM|JOIN|INTO|UPDATE|TABLE)\s+$/i,
  expectingColumnName: /(SELECT|WHERE|SET|ON|GROUP BY|ORDER BY)\s+$/i,
  afterDot: /\.\s*$/,
  inSelectClause: /SELECT[\s\S]*?(?:FROM|$)/i,
  inWhereClause: /WHERE[\s\S]*?(?:GROUP BY|ORDER BY|LIMIT|$)/i,
  inJoinClause: /JOIN[\s\S]*?(?:WHERE|GROUP BY|ORDER BY|$)/i
};

/**
 * Monaco Editor theme names
 */
export const MONACO_THEMES = {
  LIGHT: 'vs',
  DARK: 'vs-dark',
  HIGH_CONTRAST: 'hc-black'
} as const;

/**
 * Editor loading configuration
 */
export const EDITOR_LOADING_CONFIG = {
  MAX_ATTEMPTS: 200,
  CHECK_INTERVAL_MS: 50,
  TIMEOUT_MS: 20000
};
