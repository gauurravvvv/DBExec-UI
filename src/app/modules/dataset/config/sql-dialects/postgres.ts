/**
 * PostgreSQL dialect — keywords/types lifted from @codemirror/lang-sql's
 * bundled PostgreSQL spec (which already encodes the union of standard
 * SQL keywords + Postgres-specific extensions). Function catalog is
 * hand-curated to give the editor's hover and signature-help providers
 * real param signatures + descriptions that lang-sql does not ship.
 *
 * Coverage target: every commonly-used builtin across aggregate, window,
 * string, datetime, math, JSON/JSONB, array, range, regexp, full-text,
 * geometric, network, UUID, system-info, sequence, conditional and
 * conversion families. The catalog is intentionally exhaustive — the
 * editor should never autocomplete the column name where it could
 * autocomplete a relevant builtin instead. Postgres function reference:
 * https://www.postgresql.org/docs/current/functions.html
 */
import { PostgreSQL } from '@codemirror/lang-sql';
import { DialectSpec, SqlFunction } from './index';
import { splitDialectWords } from './_util';

const POSTGRES_FUNCTIONS: SqlFunction[] = [
  // ─── AGGREGATE FUNCTIONS ──────────────────────────────────
  {
    name: 'COUNT',
    params: 'column | *',
    description: 'Number of rows / non-null values',
  },
  { name: 'SUM', params: 'expression', description: 'Sum of input values' },
  {
    name: 'AVG',
    params: 'expression',
    description: 'Arithmetic mean of input values',
  },
  { name: 'MIN', params: 'expression', description: 'Minimum input value' },
  { name: 'MAX', params: 'expression', description: 'Maximum input value' },
  {
    name: 'BOOL_AND',
    params: 'expression',
    description: 'True if all inputs are true',
  },
  {
    name: 'BOOL_OR',
    params: 'expression',
    description: 'True if any input is true',
  },
  { name: 'EVERY', params: 'expression', description: 'Alias of BOOL_AND' },
  {
    name: 'BIT_AND',
    params: 'expression',
    description: 'Bitwise AND of all non-null inputs',
  },
  {
    name: 'BIT_OR',
    params: 'expression',
    description: 'Bitwise OR of all non-null inputs',
  },
  {
    name: 'BIT_XOR',
    params: 'expression',
    description: 'Bitwise XOR of all non-null inputs',
  },
  {
    name: 'STRING_AGG',
    params: 'expression, delimiter',
    description: 'Concatenates non-null values with delimiter',
  },
  {
    name: 'ARRAY_AGG',
    params: 'expression',
    description: 'Aggregates values into an array',
  },
  {
    name: 'JSON_AGG',
    params: 'expression',
    description: 'Aggregates values into a JSON array',
  },
  {
    name: 'JSON_OBJECT_AGG',
    params: 'key, value',
    description: 'Aggregates pairs into a JSON object',
  },
  {
    name: 'JSONB_AGG',
    params: 'expression',
    description: 'Aggregates values into a JSONB array',
  },
  {
    name: 'JSONB_OBJECT_AGG',
    params: 'key, value',
    description: 'Aggregates pairs into a JSONB object',
  },
  { name: 'XMLAGG', params: 'xml', description: 'Concatenates XML values' },
  { name: 'CORR', params: 'Y, X', description: 'Correlation coefficient' },
  { name: 'COVAR_POP', params: 'Y, X', description: 'Population covariance' },
  { name: 'COVAR_SAMP', params: 'Y, X', description: 'Sample covariance' },
  {
    name: 'REGR_AVGX',
    params: 'Y, X',
    description: 'Mean of X in non-null pairs',
  },
  {
    name: 'REGR_AVGY',
    params: 'Y, X',
    description: 'Mean of Y in non-null pairs',
  },
  {
    name: 'REGR_COUNT',
    params: 'Y, X',
    description: 'Number of non-null pairs',
  },
  {
    name: 'REGR_INTERCEPT',
    params: 'Y, X',
    description: 'Y-intercept of regression line',
  },
  {
    name: 'REGR_R2',
    params: 'Y, X',
    description: 'Coefficient of determination',
  },
  {
    name: 'REGR_SLOPE',
    params: 'Y, X',
    description: 'Slope of regression line',
  },
  {
    name: 'STDDEV',
    params: 'expression',
    description: 'Sample standard deviation (historical alias)',
  },
  {
    name: 'STDDEV_POP',
    params: 'expression',
    description: 'Population standard deviation',
  },
  {
    name: 'STDDEV_SAMP',
    params: 'expression',
    description: 'Sample standard deviation',
  },
  { name: 'VAR_POP', params: 'expression', description: 'Population variance' },
  { name: 'VAR_SAMP', params: 'expression', description: 'Sample variance' },
  {
    name: 'VARIANCE',
    params: 'expression',
    description: 'Sample variance (historical alias)',
  },
  {
    name: 'PERCENTILE_CONT',
    params: 'fraction WITHIN GROUP (ORDER BY column)',
    description: 'Continuous percentile (interpolating)',
  },
  {
    name: 'PERCENTILE_DISC',
    params: 'fraction WITHIN GROUP (ORDER BY column)',
    description: 'Discrete percentile',
  },
  {
    name: 'MODE',
    params: 'WITHIN GROUP (ORDER BY column)',
    description: 'Most frequent value',
  },
  {
    name: 'RANK',
    params: 'args WITHIN GROUP (ORDER BY ...)',
    description: 'Hypothetical-set rank',
  },
  {
    name: 'DENSE_RANK',
    params: 'args WITHIN GROUP (ORDER BY ...)',
    description: 'Hypothetical-set dense rank',
  },
  {
    name: 'CUME_DIST',
    params: 'args WITHIN GROUP (ORDER BY ...)',
    description: 'Hypothetical-set cumulative distribution',
  },
  {
    name: 'PERCENT_RANK',
    params: 'args WITHIN GROUP (ORDER BY ...)',
    description: 'Hypothetical-set percent rank',
  },
  {
    name: 'GROUPING',
    params: 'expression, ...',
    description: 'Indicates grouping in GROUPING SETS / ROLLUP / CUBE',
  },

  // ─── WINDOW FUNCTIONS ─────────────────────────────────────
  {
    name: 'ROW_NUMBER',
    params: '',
    description: 'Sequential row number within partition',
  },
  {
    name: 'NTILE',
    params: 'buckets',
    description: 'Distributes rows into N buckets',
  },
  {
    name: 'LAG',
    params: 'value, [offset], [default]',
    description: 'Previous-row value',
  },
  {
    name: 'LEAD',
    params: 'value, [offset], [default]',
    description: 'Next-row value',
  },
  {
    name: 'FIRST_VALUE',
    params: 'value',
    description: 'First value of window frame',
  },
  {
    name: 'LAST_VALUE',
    params: 'value',
    description: 'Last value of window frame',
  },
  {
    name: 'NTH_VALUE',
    params: 'value, n',
    description: 'Nth value of window frame',
  },

  // ─── STRING / TEXT ────────────────────────────────────────
  {
    name: 'CONCAT',
    params: 'str1, str2, ...',
    description: 'Concatenates non-null strings',
  },
  {
    name: 'CONCAT_WS',
    params: 'separator, str1, str2, ...',
    description: 'Concatenates with separator (NULLs skipped)',
  },
  {
    name: 'SUBSTRING',
    params: 'str FROM start FOR length',
    description: 'Extracts a substring',
  },
  {
    name: 'SUBSTR',
    params: 'str, start, [length]',
    description: 'Alias of SUBSTRING',
  },
  { name: 'UPPER', params: 'str', description: 'Uppercase a string' },
  { name: 'LOWER', params: 'str', description: 'Lowercase a string' },
  { name: 'INITCAP', params: 'str', description: 'Title-case each word' },
  {
    name: 'TRIM',
    params: '[BOTH | LEADING | TRAILING] chars FROM str',
    description: 'Strip leading/trailing characters',
  },
  {
    name: 'LTRIM',
    params: 'str, [chars]',
    description: 'Strip leading characters',
  },
  {
    name: 'RTRIM',
    params: 'str, [chars]',
    description: 'Strip trailing characters',
  },
  {
    name: 'BTRIM',
    params: 'str, [chars]',
    description: 'Strip leading and trailing characters',
  },
  { name: 'LENGTH', params: 'str', description: 'Number of characters' },
  { name: 'CHAR_LENGTH', params: 'str', description: 'Number of characters' },
  {
    name: 'CHARACTER_LENGTH',
    params: 'str',
    description: 'Number of characters',
  },
  { name: 'OCTET_LENGTH', params: 'str', description: 'Number of bytes' },
  { name: 'BIT_LENGTH', params: 'str', description: 'Number of bits' },
  {
    name: 'REPLACE',
    params: 'str, find, replace',
    description: 'Replace all occurrences of a substring',
  },
  {
    name: 'OVERLAY',
    params: 'str PLACING substr FROM start FOR length',
    description: 'Replace a substring slice',
  },
  {
    name: 'REGEXP_REPLACE',
    params: 'source, pattern, replacement, [flags]',
    description: 'Regexp-based replace',
  },
  {
    name: 'REGEXP_MATCH',
    params: 'string, pattern, [flags]',
    description: 'First match groups (returns text[])',
  },
  {
    name: 'REGEXP_MATCHES',
    params: 'string, pattern, [flags]',
    description: 'All match groups as set',
  },
  {
    name: 'REGEXP_SPLIT_TO_ARRAY',
    params: 'string, pattern, [flags]',
    description: 'Split string into array by regexp',
  },
  {
    name: 'REGEXP_SPLIT_TO_TABLE',
    params: 'string, pattern, [flags]',
    description: 'Split string into rows by regexp',
  },
  {
    name: 'REGEXP_LIKE',
    params: 'string, pattern, [flags]',
    description: 'Tests pattern match (Postgres 15+)',
  },
  {
    name: 'REGEXP_COUNT',
    params: 'string, pattern, [start, [flags]]',
    description: 'Counts regexp matches (Postgres 15+)',
  },
  {
    name: 'REGEXP_INSTR',
    params: 'string, pattern, [start, [N, [endoption, [flags, [subexpr]]]]]',
    description: 'Position of regexp match (Postgres 15+)',
  },
  {
    name: 'REGEXP_SUBSTR',
    params: 'string, pattern, [start, [N, [flags, [subexpr]]]]',
    description: 'Extract regexp match (Postgres 15+)',
  },
  {
    name: 'SIMILAR_TO_ESCAPE',
    params: 'pattern, [escape]',
    description: 'Convert SIMILAR-TO pattern to regexp',
  },
  {
    name: 'SPLIT_PART',
    params: 'str, delimiter, n',
    description: 'Returns the nth field of a delimited string',
  },
  {
    name: 'POSITION',
    params: 'substring IN string',
    description: 'Position of substring',
  },
  {
    name: 'STRPOS',
    params: 'string, substring',
    description: 'Position of first occurrence of substring',
  },
  { name: 'LEFT', params: 'str, n', description: 'Leftmost n characters' },
  { name: 'RIGHT', params: 'str, n', description: 'Rightmost n characters' },
  {
    name: 'LPAD',
    params: 'str, length, [fill]',
    description: 'Left-pad to target length',
  },
  {
    name: 'RPAD',
    params: 'str, length, [fill]',
    description: 'Right-pad to target length',
  },
  {
    name: 'REPEAT',
    params: 'str, count',
    description: 'Repeat string N times',
  },
  { name: 'REVERSE', params: 'str', description: 'Reverse a string' },
  {
    name: 'STRING_TO_ARRAY',
    params: 'str, delimiter, [null_string]',
    description: 'Split string into array',
  },
  {
    name: 'STRING_TO_TABLE',
    params: 'str, delimiter, [null_string]',
    description: 'Split string into rows',
  },
  {
    name: 'TRANSLATE',
    params: 'str, from, to',
    description: 'Character-by-character substitution',
  },
  {
    name: 'ASCII',
    params: 'str',
    description: 'ASCII code of first character',
  },
  {
    name: 'CHR',
    params: 'codepoint',
    description: 'Character with given codepoint',
  },
  {
    name: 'STARTS_WITH',
    params: 'string, prefix',
    description: 'Tests prefix',
  },
  {
    name: 'TO_HEX',
    params: 'integer',
    description: 'Hex representation of integer',
  },
  {
    name: 'TO_ASCII',
    params: 'str, [encoding]',
    description: 'Transliterate to ASCII',
  },
  {
    name: 'QUOTE_IDENT',
    params: 'str',
    description: 'Quote string as a SQL identifier',
  },
  {
    name: 'QUOTE_LITERAL',
    params: 'value',
    description: 'Quote value as a SQL string literal',
  },
  {
    name: 'QUOTE_NULLABLE',
    params: 'value',
    description: 'Quote value, returns NULL literal for NULL',
  },
  {
    name: 'FORMAT',
    params: 'format_string, [args...]',
    description: 'sprintf-style formatting',
  },
  { name: 'MD5', params: 'str', description: 'MD5 hash as hex string' },
  { name: 'SHA224', params: 'bytea', description: 'SHA-224 hash' },
  { name: 'SHA256', params: 'bytea', description: 'SHA-256 hash' },
  { name: 'SHA384', params: 'bytea', description: 'SHA-384 hash' },
  { name: 'SHA512', params: 'bytea', description: 'SHA-512 hash' },
  {
    name: 'ENCODE',
    params: 'bytea, format',
    description: 'Encode binary as base64/hex/escape',
  },
  {
    name: 'DECODE',
    params: 'str, format',
    description: 'Decode base64/hex/escape string to binary',
  },
  {
    name: 'CONVERT',
    params: 'bytea, src_encoding, dest_encoding',
    description: 'Convert bytea between encodings',
  },
  {
    name: 'CONVERT_FROM',
    params: 'bytea, src_encoding',
    description: 'Convert bytea to text using encoding',
  },
  {
    name: 'CONVERT_TO',
    params: 'text, dest_encoding',
    description: 'Convert text to bytea using encoding',
  },
  {
    name: 'GEN_RANDOM_BYTES',
    params: 'count',
    description: 'Random bytes (pgcrypto)',
  },
  {
    name: 'PG_CLIENT_ENCODING',
    params: '',
    description: 'Current client encoding',
  },

  // ─── DATE / TIME ──────────────────────────────────────────
  {
    name: 'NOW',
    params: '',
    description: 'Current timestamp with time zone (transaction start)',
  },
  { name: 'CURRENT_DATE', params: '', description: 'Current date' },
  {
    name: 'CURRENT_TIME',
    params: '[precision]',
    description: 'Current time with TZ',
  },
  {
    name: 'CURRENT_TIMESTAMP',
    params: '[precision]',
    description: 'Current timestamp with TZ',
  },
  {
    name: 'LOCALTIME',
    params: '[precision]',
    description: 'Current time without TZ',
  },
  {
    name: 'LOCALTIMESTAMP',
    params: '[precision]',
    description: 'Current timestamp without TZ',
  },
  {
    name: 'STATEMENT_TIMESTAMP',
    params: '',
    description: 'Timestamp of current statement start',
  },
  { name: 'TRANSACTION_TIMESTAMP', params: '', description: 'Alias of NOW()' },
  {
    name: 'CLOCK_TIMESTAMP',
    params: '',
    description: 'Current wall-clock timestamp',
  },
  {
    name: 'TIMEOFDAY',
    params: '',
    description: 'Current wall-clock time as text',
  },
  {
    name: 'AGE',
    params: 'timestamp1, [timestamp2]',
    description: 'Interval between two timestamps',
  },
  {
    name: 'DATE_TRUNC',
    params: "'unit', source, [timezone]",
    description: 'Truncate timestamp to a given unit',
  },
  {
    name: 'DATE_PART',
    params: "'field', source",
    description: 'Extract a date field as double',
  },
  {
    name: 'DATE_BIN',
    params: 'stride, source, origin',
    description: 'Bin timestamps into stride-wide buckets',
  },
  {
    name: 'EXTRACT',
    params: 'field FROM source',
    description: 'Extract a date field',
  },
  {
    name: 'JUSTIFY_DAYS',
    params: 'interval',
    description: 'Convert 30-day periods to months',
  },
  {
    name: 'JUSTIFY_HOURS',
    params: 'interval',
    description: 'Convert 24-hour periods to days',
  },
  {
    name: 'JUSTIFY_INTERVAL',
    params: 'interval',
    description: 'Justify both days and hours',
  },
  {
    name: 'TO_CHAR',
    params: 'value, format',
    description: 'Format value as string',
  },
  {
    name: 'TO_DATE',
    params: 'str, format',
    description: 'Parse string into a date',
  },
  {
    name: 'TO_TIMESTAMP',
    params: 'str, format | epoch',
    description: 'Parse to timestamp or convert epoch',
  },
  {
    name: 'TO_NUMBER',
    params: 'str, format',
    description: 'Parse string into a numeric',
  },
  {
    name: 'MAKE_DATE',
    params: 'year, month, day',
    description: 'Construct a date',
  },
  {
    name: 'MAKE_TIME',
    params: 'hour, minute, sec',
    description: 'Construct a time',
  },
  {
    name: 'MAKE_TIMESTAMP',
    params: 'year, month, day, hour, minute, sec',
    description: 'Construct a timestamp without TZ',
  },
  {
    name: 'MAKE_TIMESTAMPTZ',
    params: 'year, month, day, hour, minute, sec, [tz]',
    description: 'Construct a timestamptz',
  },
  {
    name: 'MAKE_INTERVAL',
    params:
      'years=>0, months=>0, weeks=>0, days=>0, hours=>0, mins=>0, secs=>0',
    description: 'Construct an interval',
  },
  {
    name: 'PG_SLEEP',
    params: 'seconds',
    description: 'Pause execution for N seconds',
  },
  {
    name: 'PG_SLEEP_FOR',
    params: "'interval'",
    description: 'Pause for an interval',
  },
  {
    name: 'PG_SLEEP_UNTIL',
    params: 'timestamp',
    description: 'Pause until timestamp',
  },
  {
    name: 'ISFINITE',
    params: 'date | timestamp | interval',
    description: 'True if value is finite',
  },
  {
    name: 'TIMEZONE',
    params: 'zone, timestamp',
    description: 'Convert timestamp to/from zone',
  },
  {
    name: 'AT TIME ZONE',
    params: 'expr AT TIME ZONE zone',
    description: 'Convert timestamp to/from zone (operator form)',
  },

  // ─── MATH ─────────────────────────────────────────────────
  { name: 'ABS', params: 'number', description: 'Absolute value' },
  {
    name: 'CEIL',
    params: 'number',
    description: 'Smallest integer ≥ argument',
  },
  { name: 'CEILING', params: 'number', description: 'Alias of CEIL' },
  {
    name: 'FLOOR',
    params: 'number',
    description: 'Largest integer ≤ argument',
  },
  {
    name: 'ROUND',
    params: 'number, [decimals]',
    description: 'Round to N decimal places',
  },
  {
    name: 'TRUNC',
    params: 'number, [decimals]',
    description: 'Truncate toward zero',
  },
  {
    name: 'SIGN',
    params: 'number',
    description: 'Sign of argument (-1, 0, 1)',
  },
  { name: 'MOD', params: 'dividend, divisor', description: 'Modulo' },
  { name: 'POWER', params: 'base, exponent', description: 'Exponentiation' },
  { name: 'POW', params: 'base, exponent', description: 'Alias of POWER' },
  { name: 'SQRT', params: 'number', description: 'Square root' },
  { name: 'CBRT', params: 'number', description: 'Cube root' },
  { name: 'EXP', params: 'number', description: 'e raised to argument' },
  { name: 'LN', params: 'number', description: 'Natural log' },
  {
    name: 'LOG',
    params: '[base, ] number',
    description: 'Logarithm (base 10 by default)',
  },
  { name: 'LOG10', params: 'number', description: 'Base-10 logarithm' },
  { name: 'LOG2', params: 'number', description: 'Base-2 logarithm' },
  { name: 'PI', params: '', description: 'π constant' },
  { name: 'RADIANS', params: 'degrees', description: 'Degrees to radians' },
  { name: 'DEGREES', params: 'radians', description: 'Radians to degrees' },
  { name: 'SIN', params: 'radians', description: 'Sine' },
  {
    name: 'SIND',
    params: 'degrees',
    description: 'Sine of argument in degrees',
  },
  { name: 'COS', params: 'radians', description: 'Cosine' },
  {
    name: 'COSD',
    params: 'degrees',
    description: 'Cosine of argument in degrees',
  },
  { name: 'TAN', params: 'radians', description: 'Tangent' },
  {
    name: 'TAND',
    params: 'degrees',
    description: 'Tangent of argument in degrees',
  },
  { name: 'COT', params: 'radians', description: 'Cotangent' },
  {
    name: 'COTD',
    params: 'degrees',
    description: 'Cotangent of argument in degrees',
  },
  { name: 'ASIN', params: 'number', description: 'Arc sine (radians)' },
  { name: 'ACOS', params: 'number', description: 'Arc cosine (radians)' },
  { name: 'ATAN', params: 'number', description: 'Arc tangent (radians)' },
  { name: 'ATAN2', params: 'y, x', description: 'Arc tangent of y/x' },
  { name: 'SINH', params: 'number', description: 'Hyperbolic sine' },
  { name: 'COSH', params: 'number', description: 'Hyperbolic cosine' },
  { name: 'TANH', params: 'number', description: 'Hyperbolic tangent' },
  { name: 'ASINH', params: 'number', description: 'Inverse hyperbolic sine' },
  { name: 'ACOSH', params: 'number', description: 'Inverse hyperbolic cosine' },
  {
    name: 'ATANH',
    params: 'number',
    description: 'Inverse hyperbolic tangent',
  },
  { name: 'RANDOM', params: '', description: 'Random value in [0,1)' },
  {
    name: 'RANDOM_NORMAL',
    params: '[mean], [stddev]',
    description: 'Random value from normal distribution (Postgres 16+)',
  },
  { name: 'SETSEED', params: 'value', description: 'Set RANDOM() seed' },
  { name: 'GCD', params: 'a, b', description: 'Greatest common divisor' },
  { name: 'LCM', params: 'a, b', description: 'Least common multiple' },
  {
    name: 'WIDTH_BUCKET',
    params: 'operand, low, high, count',
    description: 'Assign value to a histogram bucket',
  },
  {
    name: 'NUMNONNULLS',
    params: 'a, b, c, ...',
    description: 'Count non-null arguments',
  },
  {
    name: 'NUMNULLS',
    params: 'a, b, c, ...',
    description: 'Count null arguments',
  },

  // ─── CONDITIONAL / COMPARISON ─────────────────────────────
  {
    name: 'COALESCE',
    params: 'value1, value2, ...',
    description: 'First non-null value',
  },
  {
    name: 'NULLIF',
    params: 'value1, value2',
    description: 'NULL if values are equal',
  },
  {
    name: 'GREATEST',
    params: 'value1, value2, ...',
    description: 'Largest value (NULL skipped)',
  },
  {
    name: 'LEAST',
    params: 'value1, value2, ...',
    description: 'Smallest value (NULL skipped)',
  },

  // ─── CONVERSION ───────────────────────────────────────────
  { name: 'CAST', params: 'value AS type', description: 'Type conversion' },
  {
    name: 'TO_TIMESTAMP',
    params: 'epoch_seconds',
    description: 'Epoch seconds to timestamptz',
  },

  // ─── JSON / JSONB ─────────────────────────────────────────
  {
    name: 'JSON_OBJECT',
    params: '[ {key: value, ...} ] | (key, value, ...)',
    description: 'Construct a JSON object',
  },
  {
    name: 'JSON_BUILD_OBJECT',
    params: 'key1, value1, ...',
    description: 'JSON object from variadic args',
  },
  {
    name: 'JSON_BUILD_ARRAY',
    params: 'value1, value2, ...',
    description: 'JSON array from variadic args',
  },
  {
    name: 'JSON_ARRAY',
    params: 'value1, value2, ...',
    description: 'JSON array (SQL/JSON syntax)',
  },
  {
    name: 'JSON_ARRAY_LENGTH',
    params: 'json',
    description: 'Length of a JSON array',
  },
  {
    name: 'JSON_ARRAY_ELEMENTS',
    params: 'json',
    description: 'Expand JSON array to set of values',
  },
  {
    name: 'JSON_ARRAY_ELEMENTS_TEXT',
    params: 'json',
    description: 'Expand JSON array to set of text',
  },
  {
    name: 'JSON_EACH',
    params: 'json',
    description: 'Expand JSON object into key/value rows',
  },
  {
    name: 'JSON_EACH_TEXT',
    params: 'json',
    description: 'Expand JSON object into key/text rows',
  },
  {
    name: 'JSON_OBJECT_KEYS',
    params: 'json',
    description: 'Keys of a JSON object as set',
  },
  {
    name: 'JSON_EXTRACT_PATH',
    params: 'json, path_elems...',
    description: 'Extract sub-value via path',
  },
  {
    name: 'JSON_EXTRACT_PATH_TEXT',
    params: 'json, path_elems...',
    description: 'Extract sub-value as text',
  },
  {
    name: 'JSON_POPULATE_RECORD',
    params: 'base, json',
    description: 'Populate a record from JSON',
  },
  {
    name: 'JSON_POPULATE_RECORDSET',
    params: 'base, json',
    description: 'Populate records from JSON array',
  },
  {
    name: 'JSON_TO_RECORD',
    params: 'json AS (...)',
    description: 'Convert JSON to record on the fly',
  },
  {
    name: 'JSON_TO_RECORDSET',
    params: 'json AS (...)',
    description: 'Convert JSON array to records on the fly',
  },
  {
    name: 'JSON_STRIP_NULLS',
    params: 'json',
    description: 'Remove keys with NULL values',
  },
  {
    name: 'JSON_TYPEOF',
    params: 'json',
    description: 'Top-level JSON type (object, array, etc.)',
  },
  {
    name: 'JSON_VALID',
    params: 'text',
    description: 'True if text is valid JSON (Postgres 16+)',
  },
  {
    name: 'JSON_QUERY',
    params: 'json, path',
    description: 'SQL/JSON: query and return JSON (Postgres 17+)',
  },
  {
    name: 'JSON_VALUE',
    params: 'json, path',
    description: 'SQL/JSON: query and return SQL value (Postgres 17+)',
  },
  {
    name: 'JSON_EXISTS',
    params: 'json, path',
    description: 'SQL/JSON: test if path exists (Postgres 17+)',
  },
  {
    name: 'JSON_TABLE',
    params: 'json, path COLUMNS (...)',
    description: 'SQL/JSON: rows from JSON (Postgres 17+)',
  },
  {
    name: 'JSON_SCALAR',
    params: 'value',
    description: 'Convert SQL value to a JSON scalar',
  },
  {
    name: 'JSON_SERIALIZE',
    params: 'json',
    description: 'Serialize JSON to text/bytea',
  },
  {
    name: 'JSONB_BUILD_OBJECT',
    params: 'key1, value1, ...',
    description: 'JSONB object from variadic args',
  },
  {
    name: 'JSONB_BUILD_ARRAY',
    params: 'value1, value2, ...',
    description: 'JSONB array from variadic args',
  },
  {
    name: 'JSONB_ARRAY_LENGTH',
    params: 'jsonb',
    description: 'Length of JSONB array',
  },
  {
    name: 'JSONB_ARRAY_ELEMENTS',
    params: 'jsonb',
    description: 'Expand JSONB array to set',
  },
  {
    name: 'JSONB_ARRAY_ELEMENTS_TEXT',
    params: 'jsonb',
    description: 'Expand JSONB array to text set',
  },
  {
    name: 'JSONB_EACH',
    params: 'jsonb',
    description: 'Expand JSONB object into key/value rows',
  },
  {
    name: 'JSONB_EACH_TEXT',
    params: 'jsonb',
    description: 'Expand JSONB object into key/text rows',
  },
  {
    name: 'JSONB_OBJECT_KEYS',
    params: 'jsonb',
    description: 'Keys of JSONB object',
  },
  {
    name: 'JSONB_EXTRACT_PATH',
    params: 'jsonb, path_elems...',
    description: 'Extract JSONB sub-value',
  },
  {
    name: 'JSONB_EXTRACT_PATH_TEXT',
    params: 'jsonb, path_elems...',
    description: 'Extract JSONB sub-value as text',
  },
  {
    name: 'JSONB_SET',
    params: 'target, path, new_value, [create_missing]',
    description: 'Set a JSONB sub-value',
  },
  {
    name: 'JSONB_SET_LAX',
    params: 'target, path, new_value, [create_missing, [null_value_treatment]]',
    description: 'JSONB_SET with NULL handling options',
  },
  {
    name: 'JSONB_INSERT',
    params: 'target, path, new_value, [insert_after]',
    description: 'Insert into a JSONB path',
  },
  {
    name: 'JSONB_STRIP_NULLS',
    params: 'jsonb',
    description: 'Remove NULL value keys',
  },
  { name: 'JSONB_PRETTY', params: 'jsonb', description: 'Pretty-print JSONB' },
  {
    name: 'JSONB_TYPEOF',
    params: 'jsonb',
    description: 'Top-level JSONB type',
  },
  {
    name: 'JSONB_PATH_EXISTS',
    params: 'target, path, [vars, [silent]]',
    description: 'JSONPath: test if path exists',
  },
  {
    name: 'JSONB_PATH_MATCH',
    params: 'target, path, [vars, [silent]]',
    description: 'JSONPath: test predicate match',
  },
  {
    name: 'JSONB_PATH_QUERY',
    params: 'target, path, [vars, [silent]]',
    description: 'JSONPath: query items',
  },
  {
    name: 'JSONB_PATH_QUERY_ARRAY',
    params: 'target, path, [vars, [silent]]',
    description: 'JSONPath: query into JSONB array',
  },
  {
    name: 'JSONB_PATH_QUERY_FIRST',
    params: 'target, path, [vars, [silent]]',
    description: 'JSONPath: first matching item',
  },
  {
    name: 'TO_JSON',
    params: 'value',
    description: 'Convert any SQL value to JSON',
  },
  {
    name: 'TO_JSONB',
    params: 'value',
    description: 'Convert any SQL value to JSONB',
  },
  { name: 'ROW_TO_JSON', params: 'record', description: 'Convert row to JSON' },
  {
    name: 'ARRAY_TO_JSON',
    params: 'anyarray, [pretty]',
    description: 'Convert array to JSON',
  },

  // ─── ARRAY ────────────────────────────────────────────────
  {
    name: 'ARRAY_APPEND',
    params: 'array, element',
    description: 'Append element',
  },
  {
    name: 'ARRAY_PREPEND',
    params: 'element, array',
    description: 'Prepend element',
  },
  {
    name: 'ARRAY_CAT',
    params: 'array1, array2',
    description: 'Concatenate arrays',
  },
  {
    name: 'ARRAY_LENGTH',
    params: 'array, dimension',
    description: 'Length along dimension',
  },
  { name: 'ARRAY_NDIMS', params: 'array', description: 'Number of dimensions' },
  { name: 'ARRAY_DIMS', params: 'array', description: 'Dimensions as text' },
  {
    name: 'ARRAY_LOWER',
    params: 'array, dimension',
    description: 'Lower bound along dimension',
  },
  {
    name: 'ARRAY_UPPER',
    params: 'array, dimension',
    description: 'Upper bound along dimension',
  },
  {
    name: 'ARRAY_POSITION',
    params: 'array, element, [start]',
    description: 'First subscript of matching element',
  },
  {
    name: 'ARRAY_POSITIONS',
    params: 'array, element',
    description: 'All subscripts of matching element',
  },
  {
    name: 'ARRAY_REMOVE',
    params: 'array, element',
    description: 'Remove all matching elements',
  },
  {
    name: 'ARRAY_REPLACE',
    params: 'array, find, replace',
    description: 'Replace elements',
  },
  {
    name: 'ARRAY_FILL',
    params: 'value, dimensions, [lower_bounds]',
    description: 'Array filled with value',
  },
  {
    name: 'ARRAY_TO_STRING',
    params: 'array, delimiter, [null_string]',
    description: 'Join array into string',
  },
  {
    name: 'ARRAY_SHUFFLE',
    params: 'array',
    description: 'Random shuffle (Postgres 16+)',
  },
  {
    name: 'ARRAY_SAMPLE',
    params: 'array, n',
    description: 'Random subset (Postgres 16+)',
  },
  {
    name: 'CARDINALITY',
    params: 'array',
    description: 'Total number of elements',
  },
  {
    name: 'UNNEST',
    params: 'array, [array, ...]',
    description: 'Expand arrays to a set of rows',
  },
  {
    name: 'TRIM_ARRAY',
    params: 'array, n',
    description: 'Remove last N elements',
  },

  // ─── RANGE / MULTIRANGE ───────────────────────────────────
  { name: 'LOWER', params: 'range', description: 'Lower bound of range' },
  { name: 'UPPER', params: 'range', description: 'Upper bound of range' },
  { name: 'ISEMPTY', params: 'range', description: 'True if range is empty' },
  {
    name: 'LOWER_INC',
    params: 'range',
    description: 'True if lower bound is inclusive',
  },
  {
    name: 'UPPER_INC',
    params: 'range',
    description: 'True if upper bound is inclusive',
  },
  {
    name: 'LOWER_INF',
    params: 'range',
    description: 'True if lower bound is infinite',
  },
  {
    name: 'UPPER_INF',
    params: 'range',
    description: 'True if upper bound is infinite',
  },
  {
    name: 'RANGE_MERGE',
    params: 'range1, range2',
    description: 'Smallest range covering both',
  },
  {
    name: 'INT4RANGE',
    params: 'lower, upper, [bounds]',
    description: 'Construct an int4range',
  },
  {
    name: 'INT8RANGE',
    params: 'lower, upper, [bounds]',
    description: 'Construct an int8range',
  },
  {
    name: 'NUMRANGE',
    params: 'lower, upper, [bounds]',
    description: 'Construct a numrange',
  },
  {
    name: 'TSRANGE',
    params: 'lower, upper, [bounds]',
    description: 'Construct a tsrange',
  },
  {
    name: 'TSTZRANGE',
    params: 'lower, upper, [bounds]',
    description: 'Construct a tstzrange',
  },
  {
    name: 'DATERANGE',
    params: 'lower, upper, [bounds]',
    description: 'Construct a daterange',
  },
  {
    name: 'MULTIRANGE',
    params: 'range1, range2, ...',
    description: 'Construct a multirange',
  },
  {
    name: 'UNNEST_MULTIRANGE',
    params: 'multirange',
    description: 'Expand multirange to its sub-ranges',
  },

  // ─── GEOMETRIC ────────────────────────────────────────────
  { name: 'AREA', params: 'shape', description: 'Area of a geometric shape' },
  { name: 'CENTER', params: 'shape', description: 'Center point of a shape' },
  { name: 'DIAMETER', params: 'circle', description: 'Diameter of a circle' },
  { name: 'HEIGHT', params: 'box', description: 'Vertical size of a box' },
  { name: 'WIDTH', params: 'box', description: 'Horizontal size of a box' },
  { name: 'POINT', params: 'x, y', description: 'Construct a point' },
  { name: 'BOX', params: 'point1, point2', description: 'Construct a box' },
  {
    name: 'CIRCLE',
    params: 'center, radius',
    description: 'Construct a circle',
  },
  { name: 'LINE', params: 'point1, point2', description: 'Construct a line' },
  {
    name: 'LSEG',
    params: 'point1, point2',
    description: 'Construct a line segment',
  },
  { name: 'PATH', params: 'string', description: 'Construct a path' },
  { name: 'POLYGON', params: 'string', description: 'Construct a polygon' },
  { name: 'RADIUS', params: 'circle', description: 'Radius of a circle' },

  // ─── NETWORK (INET / CIDR / MACADDR) ──────────────────────
  {
    name: 'ABBREV',
    params: 'inet | cidr',
    description: 'Abbreviated text representation',
  },
  {
    name: 'BROADCAST',
    params: 'inet | cidr',
    description: 'Broadcast address',
  },
  {
    name: 'FAMILY',
    params: 'inet | cidr',
    description: 'Address family (4 or 6)',
  },
  { name: 'HOST', params: 'inet | cidr', description: 'IP address as text' },
  { name: 'HOSTMASK', params: 'inet | cidr', description: 'Host mask' },
  {
    name: 'INET_MERGE',
    params: 'inet1, inet2',
    description: 'Smallest network covering both',
  },
  {
    name: 'INET_SAME_FAMILY',
    params: 'inet1, inet2',
    description: 'True if same address family',
  },
  {
    name: 'MASKLEN',
    params: 'inet | cidr',
    description: 'Netmask length in bits',
  },
  { name: 'NETMASK', params: 'inet | cidr', description: 'Netmask' },
  {
    name: 'NETWORK',
    params: 'inet | cidr',
    description: 'Network part of address',
  },
  {
    name: 'SET_MASKLEN',
    params: 'inet | cidr, integer',
    description: 'Set netmask length',
  },
  { name: 'TEXT', params: 'inet', description: 'Extract address as text' },
  {
    name: 'TRUNC',
    params: 'macaddr',
    description: 'Set last 3 bytes to zero (manufacturer prefix)',
  },

  // ─── FULL-TEXT SEARCH ─────────────────────────────────────
  {
    name: 'TO_TSVECTOR',
    params: '[config], text',
    description: 'Reduce document text to tsvector',
  },
  {
    name: 'TO_TSQUERY',
    params: '[config], text',
    description: 'Normalize words and convert to tsquery',
  },
  {
    name: 'PLAINTO_TSQUERY',
    params: '[config], text',
    description: 'Convert plain text to AND-of-terms tsquery',
  },
  {
    name: 'PHRASETO_TSQUERY',
    params: '[config], text',
    description: 'Convert plain text to phrase tsquery',
  },
  {
    name: 'WEBSEARCH_TO_TSQUERY',
    params: '[config], text',
    description: 'Convert websearch syntax to tsquery',
  },
  {
    name: 'TSVECTOR_TO_ARRAY',
    params: 'tsvector',
    description: 'Extract lexemes as array',
  },
  {
    name: 'TSVECTOR_UPDATE_TRIGGER',
    params: 'tsvector_col, config_name, text_col, ...',
    description: 'Trigger function for tsvector indexing',
  },
  {
    name: 'TS_HEADLINE',
    params: '[config], document, query, [options]',
    description: 'Highlight matches in document',
  },
  {
    name: 'TS_RANK',
    params: '[weights], tsvector, tsquery, [normalization]',
    description: 'Rank document against query',
  },
  {
    name: 'TS_RANK_CD',
    params: '[weights], tsvector, tsquery, [normalization]',
    description: 'Cover-density ranking',
  },
  {
    name: 'TS_LEXIZE',
    params: 'dict, token',
    description: 'Stem token using dictionary',
  },
  {
    name: 'SETWEIGHT',
    params: 'tsvector, weight, [labels]',
    description: 'Assign weight to lexemes',
  },
  {
    name: 'TS_REWRITE',
    params: 'query, target, substitute',
    description: 'Replace subqueries in tsquery',
  },
  {
    name: 'TSQUERY_PHRASE',
    params: 'tsquery1, tsquery2, [distance]',
    description: 'Adjacent tsquery match',
  },
  {
    name: 'NUMNODE',
    params: 'tsquery',
    description: 'Number of lexemes plus operators',
  },
  {
    name: 'STRIP',
    params: 'tsvector',
    description: 'Strip positions and weights',
  },

  // ─── UUID ─────────────────────────────────────────────────
  { name: 'GEN_RANDOM_UUID', params: '', description: 'Generate a v4 UUID' },
  { name: 'UUID_GENERATE_V1', params: '', description: 'UUID v1 (uuid-ossp)' },
  {
    name: 'UUID_GENERATE_V3',
    params: 'namespace, name',
    description: 'UUID v3 (uuid-ossp)',
  },
  { name: 'UUID_GENERATE_V4', params: '', description: 'UUID v4 (uuid-ossp)' },
  {
    name: 'UUID_GENERATE_V5',
    params: 'namespace, name',
    description: 'UUID v5 (uuid-ossp)',
  },
  {
    name: 'UUIDV7',
    params: '',
    description: 'Generate a v7 UUID (Postgres 18+)',
  },

  // ─── SYSTEM INFO / SESSION ────────────────────────────────
  {
    name: 'CURRENT_DATABASE',
    params: '',
    description: 'Current database name',
  },
  { name: 'CURRENT_SCHEMA', params: '', description: 'Current schema name' },
  {
    name: 'CURRENT_SCHEMAS',
    params: 'include_implicit',
    description: 'Names in search path',
  },
  {
    name: 'CURRENT_USER',
    params: '',
    description: 'Current execution user name',
  },
  { name: 'SESSION_USER', params: '', description: 'Session user name' },
  { name: 'USER', params: '', description: 'Alias of CURRENT_USER' },
  { name: 'CURRENT_ROLE', params: '', description: 'Alias of CURRENT_USER' },
  {
    name: 'CURRENT_QUERY',
    params: '',
    description: 'SQL text of current query',
  },
  {
    name: 'CURRENT_CATALOG',
    params: '',
    description: 'Current database name (SQL standard)',
  },
  { name: 'INET_CLIENT_ADDR', params: '', description: 'Client IP address' },
  { name: 'INET_CLIENT_PORT', params: '', description: 'Client TCP port' },
  { name: 'INET_SERVER_ADDR', params: '', description: 'Server IP address' },
  { name: 'INET_SERVER_PORT', params: '', description: 'Server TCP port' },
  { name: 'PG_BACKEND_PID', params: '', description: "Current backend's PID" },
  {
    name: 'PG_CONF_LOAD_TIME',
    params: '',
    description: 'Time at which configuration was loaded',
  },
  {
    name: 'PG_IS_IN_RECOVERY',
    params: '',
    description: 'True if in recovery mode',
  },
  {
    name: 'PG_POSTMASTER_START_TIME',
    params: '',
    description: 'Postmaster start time',
  },
  { name: 'VERSION', params: '', description: 'PostgreSQL version string' },
  {
    name: 'SET_CONFIG',
    params: 'name, value, is_local',
    description: 'Set a configuration parameter',
  },
  {
    name: 'CURRENT_SETTING',
    params: 'name, [missing_ok]',
    description: 'Read a configuration parameter',
  },

  // ─── SEQUENCES ────────────────────────────────────────────
  {
    name: 'NEXTVAL',
    params: 'sequence',
    description: 'Advance sequence and return next value',
  },
  {
    name: 'CURRVAL',
    params: 'sequence',
    description: 'Current session value of sequence',
  },
  {
    name: 'LASTVAL',
    params: '',
    description: 'Last value obtained with NEXTVAL in session',
  },
  {
    name: 'SETVAL',
    params: 'sequence, value, [is_called]',
    description: 'Set sequence value',
  },
  {
    name: 'PG_GET_SERIAL_SEQUENCE',
    params: 'table, column',
    description: 'Sequence backing a serial/identity column',
  },

  // ─── LARGE OBJECT / BYTEA ─────────────────────────────────
  { name: 'LO_CREATE', params: 'oid', description: 'Create a large object' },
  {
    name: 'LO_FROM_BYTEA',
    params: 'oid, data',
    description: 'Create LO from bytea',
  },
  {
    name: 'LO_GET',
    params: 'oid, [offset, length]',
    description: 'Read a large object',
  },
  {
    name: 'LO_PUT',
    params: 'oid, offset, data',
    description: 'Write to a large object',
  },
  { name: 'LO_UNLINK', params: 'oid', description: 'Delete a large object' },
  {
    name: 'GET_BYTE',
    params: 'bytea, offset',
    description: 'Read byte at offset',
  },
  {
    name: 'SET_BYTE',
    params: 'bytea, offset, value',
    description: 'Write byte at offset',
  },
  {
    name: 'GET_BIT',
    params: 'bytea | bit, offset',
    description: 'Read bit at offset',
  },
  {
    name: 'SET_BIT',
    params: 'bytea | bit, offset, value',
    description: 'Write bit at offset',
  },

  // ─── ADMIN / DIAGNOSTIC ───────────────────────────────────
  { name: 'PG_TYPEOF', params: 'any', description: 'Type of an expression' },
  {
    name: 'PG_TABLE_SIZE',
    params: 'regclass',
    description: 'Disk size of table data',
  },
  {
    name: 'PG_INDEXES_SIZE',
    params: 'regclass',
    description: 'Disk size of all indexes on table',
  },
  {
    name: 'PG_RELATION_SIZE',
    params: 'regclass, [fork]',
    description: 'Disk size of a relation',
  },
  {
    name: 'PG_TOTAL_RELATION_SIZE',
    params: 'regclass',
    description: 'Total disk size including indexes + toast',
  },
  {
    name: 'PG_DATABASE_SIZE',
    params: 'name | oid',
    description: 'Disk size of a database',
  },
  {
    name: 'PG_SIZE_PRETTY',
    params: 'bigint | numeric',
    description: 'Pretty-print byte size',
  },
  {
    name: 'PG_COLUMN_SIZE',
    params: 'any',
    description: 'On-disk size of a value',
  },
  {
    name: 'PG_TABLESPACE_SIZE',
    params: 'name | oid',
    description: 'Disk size of a tablespace',
  },
  {
    name: 'PG_ENCODING_TO_CHAR',
    params: 'encoding_id',
    description: 'Encoding name from id',
  },
  {
    name: 'PG_CHAR_TO_ENCODING',
    params: 'name',
    description: 'Encoding id from name',
  },
  {
    name: 'PG_GET_FUNCTIONDEF',
    params: 'func_oid',
    description: 'CREATE FUNCTION definition',
  },
  {
    name: 'PG_GET_VIEWDEF',
    params: 'view_oid, [pretty]',
    description: 'CREATE VIEW SELECT statement',
  },
  {
    name: 'PG_GET_INDEXDEF',
    params: 'index_oid, [col, [pretty]]',
    description: 'CREATE INDEX definition',
  },
  {
    name: 'PG_GET_CONSTRAINTDEF',
    params: 'constraint_oid, [pretty]',
    description: 'Constraint definition',
  },
  {
    name: 'PG_GET_FUNCTION_ARGUMENTS',
    params: 'func_oid',
    description: 'Function arguments as string',
  },
  {
    name: 'PG_GET_FUNCTION_RESULT',
    params: 'func_oid',
    description: 'Function result type as string',
  },
  {
    name: 'PG_GET_USERBYID',
    params: 'role_oid',
    description: 'Role name from oid',
  },
  {
    name: 'HAS_TABLE_PRIVILEGE',
    params: '[user,] table, privilege',
    description: 'Test table privilege',
  },
  {
    name: 'HAS_COLUMN_PRIVILEGE',
    params: '[user,] table, column, privilege',
    description: 'Test column privilege',
  },
  {
    name: 'HAS_SCHEMA_PRIVILEGE',
    params: '[user,] schema, privilege',
    description: 'Test schema privilege',
  },
  {
    name: 'HAS_DATABASE_PRIVILEGE',
    params: '[user,] database, privilege',
    description: 'Test database privilege',
  },
  {
    name: 'PG_LISTENING_CHANNELS',
    params: '',
    description: 'Channels session is listening on',
  },
  {
    name: 'PG_NOTIFY',
    params: 'channel, payload',
    description: 'Send notification on channel',
  },
  {
    name: 'PG_TRIGGER_DEPTH',
    params: '',
    description: 'Nesting level of triggers',
  },

  // ─── TRIGGER HELPERS ──────────────────────────────────────
  {
    name: 'PG_LSN_LARGER',
    params: 'lsn1, lsn2',
    description: 'Larger of two LSNs',
  },
  {
    name: 'PG_CURRENT_WAL_LSN',
    params: '',
    description: 'Current WAL write location',
  },
  {
    name: 'PG_WALFILE_NAME',
    params: 'lsn',
    description: 'WAL file name for LSN',
  },
  {
    name: 'PG_CURRENT_XACT_ID',
    params: '',
    description: 'Current top-level transaction id',
  },
];

export const postgresDialect: DialectSpec = {
  dbType: 'postgres',
  keywords: splitDialectWords(PostgreSQL.spec.keywords),
  types: splitDialectWords(PostgreSQL.spec.types),
  functions: POSTGRES_FUNCTIONS,
  // lang-sql's PostgreSQL spec ships no `builtin` field — function
  // names that double as keywords (AVG, SUM, COALESCE, etc.) are already
  // in `keywords`, the rest live in our hand-curated catalog above.
  extraFunctionNames: [],
  parser: PostgreSQL.language.parser,
};
