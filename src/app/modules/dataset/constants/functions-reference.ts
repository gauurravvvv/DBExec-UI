export interface FunctionDefinition {
  name: string;
  usage: string;
  description: string;
}

export interface FunctionCategory {
  id: string;
  name: string;
  icon: string;
  functions: FunctionDefinition[];
}

export const FUNCTION_CATEGORIES: FunctionCategory[] = [
  {
    id: 'string',
    name: 'String Functions',
    icon: 'pi pi-align-left',
    functions: [
      {
        name: 'concat',
        usage: "concat({firstName}, ' ', {lastName})",
        description:
          'Joins multiple text values together into a single string. You can combine field values with literal text like spaces, commas, or any other characters. Useful for creating full names, addresses, or custom formatted text.',
      },
      {
        name: 'contains',
        usage: "contains({email}, '@')",
        description:
          'Checks if a text field includes a specific substring and returns TRUE or FALSE. Case-sensitive search. Perfect for filtering records that contain certain keywords or validating data patterns.',
      },
      {
        name: 'endsWith',
        usage: "endsWith({email}, '.com')",
        description:
          'Tests whether a text value ends with a specified suffix. Returns TRUE if the string ends with the given characters, FALSE otherwise. Useful for checking file extensions, domain names, or codes.',
      },
      {
        name: 'startsWith',
        usage: "startsWith({name}, 'A')",
        description:
          'Tests whether a text value begins with a specified prefix. Returns TRUE if the string starts with the given characters. Ideal for filtering by initials, prefixes, or category codes.',
      },
      {
        name: 'left',
        usage: 'left({name}, 3)',
        description:
          'Extracts a specified number of characters from the beginning (left side) of a text string. The second parameter specifies how many characters to return. Great for getting prefixes or codes from longer strings.',
      },
      {
        name: 'right',
        usage: 'right({name}, 3)',
        description:
          'Extracts a specified number of characters from the end (right side) of a text string. The second parameter specifies how many characters to return. Perfect for suffixes, extensions, or trailing codes.',
      },
      {
        name: 'substring',
        usage: 'substring({text}, 1, 5)',
        description:
          'Extracts a portion of text starting at a specific position for a given length. First number is the start position (1-indexed), second is the number of characters to extract. Powerful for parsing structured text data.',
      },
      {
        name: 'len',
        usage: 'len({name})',
        description:
          'Counts and returns the total number of characters in a text string, including spaces and special characters. Useful for data validation, ensuring field lengths meet requirements, or sorting by length.',
      },
      {
        name: 'strlen',
        usage: 'strlen({description})',
        description:
          'Alternative function to count text length. Returns the number of characters in a string. Functionally identical to len() - choose whichever name you prefer for readability.',
      },
      {
        name: 'locate',
        usage: "locate({email}, '@')",
        description:
          'Searches for a substring within text and returns its position (1-indexed). Returns 0 if not found. Combine with substring() to extract parts of text based on delimiter positions.',
      },
      {
        name: 'lower',
        usage: 'lower({name})',
        description:
          'Converts all uppercase letters in a text string to lowercase. Non-alphabetic characters remain unchanged. Essential for case-insensitive comparisons and standardizing text data.',
      },
      {
        name: 'upper',
        usage: 'upper({name})',
        description:
          'Converts all lowercase letters in a text string to uppercase. Non-alphabetic characters remain unchanged. Useful for creating header formats, codes, or standardized identifiers.',
      },
      {
        name: 'toLower',
        usage: 'toLower({name})',
        description:
          'Alternative name for the lower() function. Converts text to all lowercase characters. Use whichever function name is more intuitive for your formula.',
      },
      {
        name: 'toUpper',
        usage: 'toUpper({name})',
        description:
          'Alternative name for the upper() function. Converts text to all uppercase characters. Use whichever function name is more intuitive for your formula.',
      },
      {
        name: 'ltrim',
        usage: 'ltrim({text})',
        description:
          'Removes leading whitespace (spaces, tabs) from the beginning of a text string. The rest of the text, including internal and trailing spaces, remains unchanged. Cleans up left-padded data.',
      },
      {
        name: 'rtrim',
        usage: 'rtrim({text})',
        description:
          'Removes trailing whitespace (spaces, tabs) from the end of a text string. The rest of the text, including leading and internal spaces, remains unchanged. Cleans up right-padded data.',
      },
      {
        name: 'trim',
        usage: 'trim({text})',
        description:
          'Removes both leading and trailing whitespace from a text string. Internal spaces between words are preserved. Most common text cleaning function for imported or user-entered data.',
      },
      {
        name: 'replace',
        usage: "replace({text}, 'old', 'new')",
        description:
          'Finds all occurrences of a substring and replaces them with a new value. Case-sensitive. Use for data cleaning, standardization, or transforming codes. Can replace with empty string to remove text.',
      },
      {
        name: 'split',
        usage: "split({email}, '@', 2)",
        description:
          'Divides text by a delimiter and returns the nth part. For email "user@domain.com" split by "@", part 1 is "user", part 2 is "domain.com". Powerful for parsing structured text like paths or codes.',
      },
      {
        name: 'parseDecimal',
        usage: "parseDecimal('$1,234.56')",
        description:
          'Extracts a decimal number from a text string that may contain currency symbols, commas, or other non-numeric characters. Returns the numeric value 1234.56 from "$1,234.56". Essential for imported financial data.',
      },
      {
        name: 'parseInt',
        usage: "parseInt('42 items')",
        description:
          'Extracts a whole number (integer) from text, ignoring non-numeric characters. Returns 42 from "42 items". Use when you need integer values from mixed text/number fields.',
      },
      {
        name: 'parseJson',
        usage: "parseJson({jsonField}, 'user.name')",
        description:
          'Extracts a specific value from a JSON string using dot notation for nested paths. Navigate complex JSON structures like "user.address.city" to get deeply nested values. Returns null if path not found.',
      },
    ],
  },
  {
    id: 'date',
    name: 'Date Functions',
    icon: 'pi pi-calendar',
    functions: [
      {
        name: 'now',
        usage: 'now()',
        description:
          'Returns the current date and time at the moment the calculation runs. Updates each time data refreshes. Use for age calculations, "days since" metrics, or any comparison to the current moment.',
      },
      {
        name: 'date',
        usage: 'date({dateString})',
        description:
          'Converts a text string to a proper date value that can be used in calculations. Recognizes common date formats. Required before performing date arithmetic on text-based date fields.',
      },
      {
        name: 'addDateTime',
        usage: "addDateTime(30, 'DD', {startDate})",
        description:
          'Adds a specified number of time units to a date. Units include: YY (years), MM (months), WK (weeks), DD (days), HH (hours), MI (minutes), SS (seconds). Use negative numbers to subtract.',
      },
      {
        name: 'addWorkDays',
        usage: 'addWorkDays(5, {startDate})',
        description:
          'Adds business days to a date, automatically skipping Saturdays and Sundays. Perfect for calculating due dates, SLA deadlines, or delivery estimates that exclude weekends.',
      },
      {
        name: 'dateDiff',
        usage: "dateDiff({startDate}, {endDate}, 'DD')",
        description:
          'Calculates the difference between two dates in specified units: YY (years), MM (months), WK (weeks), DD (days), HH (hours), MI (minutes), SS (seconds). Returns a positive or negative number.',
      },
      {
        name: 'extract',
        usage: "extract('YYYY', {date})",
        description:
          'Pulls out a specific component from a date. Options: YYYY (4-digit year), MM (month 01-12), DD (day 01-31), HH (hour), MI (minute), WD (weekday 1-7). Returns a number.',
      },
      {
        name: 'truncDate',
        usage: "truncDate('MM', {date})",
        description:
          'Rounds a date down to the start of a time period. Truncating to MM gives the first day of the month, to YYYY gives January 1st. Useful for grouping dates into periods.',
      },
      {
        name: 'formatDate',
        usage: "formatDate({date}, 'YYYY-MM-DD')",
        description:
          'Converts a date to a formatted text string. Combine patterns like YYYY, MM, DD, HH, MI, SS with separators. Output "2024-03-15" or "March 15, 2024" depending on format string.',
      },
      {
        name: 'epochDate',
        usage: 'epochDate(1704067200)',
        description:
          'Converts a Unix timestamp (seconds since January 1, 1970) to a readable date. Many systems store dates as epoch numbers. This function makes them human-readable and usable in date calculations.',
      },
      {
        name: 'isWorkDay',
        usage: 'isWorkDay({date})',
        description:
          'Returns TRUE if the date falls on Monday through Friday, FALSE for Saturday or Sunday. Use in conditional logic to handle business days differently from weekends.',
      },
      {
        name: 'netWorkDays',
        usage: 'netWorkDays({startDate}, {endDate})',
        description:
          'Counts the number of business days (Monday-Friday) between two dates, excluding weekends. Perfect for calculating actual working time for projects, SLAs, or employee schedules.',
      },
      {
        name: 'parseDate',
        usage: "parseDate('2024-01-15')",
        description:
          'Interprets a text string as a date value. Recognizes various date formats automatically. Use when importing data where dates are stored as text rather than proper date values.',
      },
    ],
  },
  {
    id: 'numeric',
    name: 'Numeric/Math Functions',
    icon: 'pi pi-hashtag',
    functions: [
      {
        name: 'abs',
        usage: 'abs({value})',
        description:
          'Returns the absolute (positive) value of a number. Converts -5 to 5, while 5 remains 5. Essential when you need the magnitude without regard to positive/negative sign.',
      },
      {
        name: 'ceil',
        usage: 'ceil({price})',
        description:
          'Rounds a number UP to the nearest whole number. 3.1 becomes 4, 3.9 becomes 4, -3.1 becomes -3. Use for pricing that always rounds up or capacity calculations.',
      },
      {
        name: 'floor',
        usage: 'floor({price})',
        description:
          'Rounds a number DOWN to the nearest whole number. 3.9 becomes 3, 3.1 becomes 3, -3.1 becomes -4. Use when you need to truncate decimals conservatively.',
      },
      {
        name: 'round',
        usage: 'round({value}, 2)',
        description:
          'Rounds a number to a specified number of decimal places using standard rounding (0.5 rounds up). round(3.456, 2) returns 3.46. Second parameter specifies decimal places.',
      },
      {
        name: 'trunc',
        usage: 'trunc({value}, 2)',
        description:
          'Truncates (cuts off) decimal places without rounding. trunc(3.789, 2) returns 3.78, not 3.79. Use when you need to simply remove decimal places rather than round.',
      },
      {
        name: 'sqrt',
        usage: 'sqrt({value})',
        description:
          'Calculates the square root of a number. sqrt(16) returns 4, sqrt(2) returns approximately 1.414. Used in statistical calculations, geometry, and various mathematical formulas.',
      },
      {
        name: 'power',
        usage: 'power({base}, {exponent})',
        description:
          'Raises a number to a power. power(2, 3) returns 8 (2³). Use for compound interest, exponential growth calculations, or any formula requiring exponents.',
      },
      {
        name: 'exp',
        usage: 'exp({value})',
        description:
          "Returns e (Euler's number, approximately 2.718) raised to the specified power. exp(1) returns 2.718. Used in natural logarithm inversions, growth models, and scientific calculations.",
      },
      {
        name: 'ln',
        usage: 'ln({value})',
        description:
          'Calculates the natural logarithm (base e) of a number. ln(2.718) returns approximately 1. Used in growth rate analysis, statistical models, and converting exponential relationships.',
      },
      {
        name: 'log',
        usage: 'log({value})',
        description:
          'Calculates the base-10 logarithm of a number. log(100) returns 2, log(1000) returns 3. Useful for handling numbers spanning many orders of magnitude or pH-type scales.',
      },
      {
        name: 'mod',
        usage: 'mod({dividend}, {divisor})',
        description:
          'Returns the remainder after division. mod(17, 5) returns 2 because 17 ÷ 5 = 3 remainder 2. Useful for alternating row colors, cyclic patterns, or checking divisibility.',
      },
    ],
  },
  {
    id: 'aggregate',
    name: 'Aggregate Functions',
    icon: 'pi pi-chart-bar',
    functions: [
      {
        name: 'sum',
        usage: 'sum({salary})',
        description:
          'Adds up all numeric values in a field across all rows in the current context (respecting any filters or grouping). The most common aggregation for totaling revenue, quantities, or any additive metric.',
      },
      {
        name: 'avg',
        usage: 'avg({salary})',
        description:
          'Calculates the arithmetic mean (average) of all values. Ignores null values in the calculation. Use for average order value, mean response time, or any typical value analysis.',
      },
      {
        name: 'count',
        usage: 'count({id})',
        description:
          'Counts the number of non-null values in a field. Use count({id}) to count records, as IDs are typically never null. Different from countDistinct which counts unique values only.',
      },
      {
        name: 'countDistinct',
        usage: 'countDistinct({category})',
        description:
          'Counts only unique (distinct) values, ignoring duplicates. If a field has values [A, A, B, C, C, C], countDistinct returns 3. Perfect for counting unique customers, products, or categories.',
      },
      {
        name: 'max',
        usage: 'max({price})',
        description:
          'Finds and returns the largest value in a field across all rows. Works with numbers, dates, and text (alphabetically). Use for finding peak values, latest dates, or highest scores.',
      },
      {
        name: 'min',
        usage: 'min({price})',
        description:
          'Finds and returns the smallest value in a field across all rows. Works with numbers, dates, and text (alphabetically). Use for finding lowest prices, earliest dates, or minimum thresholds.',
      },
      {
        name: 'median',
        usage: 'median({scores})',
        description:
          'Returns the middle value when all values are sorted. Less affected by outliers than average. If 50% of students scored above X, X is the median. Better for skewed distributions.',
      },
      {
        name: 'percentile',
        usage: 'percentile({scores}, 75)',
        description:
          'Returns the value at a given percentile rank. percentile({scores}, 75) returns the value where 75% of scores fall below. Use for performance benchmarks, SLA thresholds, or distribution analysis.',
      },
      {
        name: 'percentileDisc',
        usage: 'percentileDisc({values}, 50)',
        description:
          'Discrete percentile returns an actual value from the dataset closest to the percentile. Unlike continuous percentile, it never interpolates between values. Returns a real data point.',
      },
      {
        name: 'percentileCont',
        usage: 'percentileCont({values}, 50)',
        description:
          'Continuous percentile may interpolate between values if the exact percentile falls between data points. More mathematically precise but may return values not in the original dataset.',
      },
      {
        name: 'stdev',
        usage: 'stdev({values})',
        description:
          'Calculates sample standard deviation, measuring how spread out values are from the mean. Higher values indicate more variability. Uses n-1 in denominator (sample correction factor).',
      },
      {
        name: 'stdevp',
        usage: 'stdevp({values})',
        description:
          'Calculates population standard deviation, assuming data represents the entire population, not a sample. Uses n in denominator. Slightly smaller than sample stdev for the same data.',
      },
      {
        name: 'variance',
        usage: 'variance({values})',
        description:
          'Measures data dispersion as the average squared deviation from the mean. Sample variance uses n-1 denominator. Variance is stdev squared - useful in statistical models.',
      },
      {
        name: 'varp',
        usage: 'varp({values})',
        description:
          'Population variance assumes data is the complete population. Uses n denominator instead of n-1. Appropriate when you have all possible data points, not just a sample.',
      },
    ],
  },
  {
    id: 'conditional-aggregate',
    name: 'Conditional Aggregates',
    icon: 'pi pi-filter',
    functions: [
      {
        name: 'avgIf',
        usage: 'avgIf({salary}, {isActive})',
        description:
          'Calculates average only for rows where the condition is TRUE. avgIf({salary}, {isActive}) averages salaries only of active employees. Combines filtering with aggregation in one step.',
      },
      {
        name: 'sumIf',
        usage: 'sumIf({amount}, {isPaid})',
        description:
          'Sums values only where the condition evaluates to TRUE. sumIf({amount}, {isPaid}) totals only paid invoices. More efficient than separate filter and sum operations.',
      },
      {
        name: 'countIf',
        usage: 'countIf({id}, {isActive})',
        description:
          'Counts rows only where the condition is TRUE. countIf({id}, {status} = "Complete") counts completed items. The first parameter is just for counting non-nulls among matching rows.',
      },
      {
        name: 'distinct_countIf',
        usage: 'distinct_countIf({category}, {condition})',
        description:
          'Counts unique values only among rows meeting the condition. Like countDistinct but filtered. distinct_countIf({customerId}, {region} = "West") counts unique customers in West region.',
      },
      {
        name: 'maxIf',
        usage: 'maxIf({price}, {inStock})',
        description:
          'Finds the maximum value only among rows where condition is TRUE. maxIf({price}, {inStock}) finds highest price among in-stock items only. Ignores rows where condition is FALSE.',
      },
      {
        name: 'minIf',
        usage: 'minIf({price}, {inStock})',
        description:
          'Finds the minimum value only among rows where condition is TRUE. minIf({price}, {inStock}) finds lowest price among available items. Great for conditional threshold analysis.',
      },
      {
        name: 'medianIf',
        usage: 'medianIf({scores}, {passed})',
        description:
          'Calculates median only for rows meeting the condition. medianIf({scores}, {passed}) finds the median score among passing students only. Useful for segmented distribution analysis.',
      },
      {
        name: 'stdevIf',
        usage: 'stdevIf({values}, {condition})',
        description:
          'Computes sample standard deviation only for rows where condition is TRUE. Measures variability within a filtered subset. stdevIf({responseTime}, {isError} = FALSE) for successful requests only.',
      },
      {
        name: 'stdevpIf',
        usage: 'stdevpIf({values}, {condition})',
        description:
          'Computes population standard deviation for filtered rows. Use when filtered data represents complete population of that segment, not a sample.',
      },
      {
        name: 'varIf',
        usage: 'varIf({values}, {condition})',
        description:
          'Calculates sample variance only for rows meeting the condition. Variance measures spread as squared deviation from mean. Useful for comparing variability across segments.',
      },
      {
        name: 'varpIf',
        usage: 'varpIf({values}, {condition})',
        description:
          'Calculates population variance for filtered subset. Use when your filtered data is the complete population for that condition, not a sample from a larger group.',
      },
    ],
  },
  {
    id: 'conditional',
    name: 'Conditional Functions',
    icon: 'pi pi-question-circle',
    functions: [
      {
        name: 'ifelse',
        usage: "ifelse({age} > 18, 'Adult', 'Minor')",
        description:
          'The fundamental if-then-else logic. If the condition is TRUE, returns the second parameter; if FALSE, returns the third. Can be nested for multiple conditions: ifelse(A, X, ifelse(B, Y, Z)).',
      },
      {
        name: 'switch',
        usage: "switch({status}, 'A', 'Active', 'I', 'Inactive', 'Unknown')",
        description:
          'Multi-way branching: tests a value against multiple cases. Format: switch(value, match1, result1, match2, result2, ..., default). Cleaner than nested ifelse for multiple specific matches.',
      },
      {
        name: 'isNull',
        usage: 'isNull({value})',
        description:
          'Tests if a value is null (missing/undefined) and returns TRUE or FALSE. Use in conditions like ifelse(isNull({discount}), 0, {discount}) to handle missing data gracefully.',
      },
      {
        name: 'isNotNull',
        usage: 'isNotNull({value})',
        description:
          'Tests if a value exists (is not null) and returns TRUE or FALSE. Opposite of isNull(). Useful for filtering to records with data: isNotNull({email}) finds contacts with email addresses.',
      },
      {
        name: 'coalesce',
        usage: "coalesce({primary}, {fallback}, 'default')",
        description:
          'Returns the first non-null value from a list of values. coalesce({nickName}, {firstName}, "Guest") uses nickname if available, otherwise firstName, otherwise "Guest". Elegant null handling.',
      },
      {
        name: 'nullIf',
        usage: 'nullIf({value}, 0)',
        description:
          'Returns NULL if the value equals the specified value, otherwise returns the original value. nullIf({count}, 0) converts zeros to nulls. Useful to avoid division by zero errors.',
      },
    ],
  },
  {
    id: 'comparison',
    name: 'Comparison Functions',
    icon: 'pi pi-check-square',
    functions: [
      {
        name: 'between',
        usage: 'between({age}, 18, 65)',
        description:
          'Returns TRUE if a value falls within a range (inclusive of both endpoints). between({age}, 18, 65) is TRUE for 18, 40, and 65. Cleaner than combining >= and <= comparisons.',
      },
      {
        name: 'in',
        usage: "in({status}, 'Active', 'Pending')",
        description:
          'Returns TRUE if a value matches any item in the provided list. in({color}, "Red", "Blue", "Green") is TRUE if color is any of those three. More readable than multiple OR conditions.',
      },
      {
        name: 'notIn',
        usage: "notIn({status}, 'Deleted', 'Archived')",
        description:
          'Returns TRUE if a value does NOT match any item in the list. Opposite of in(). notIn({status}, "Deleted", "Archived") filters out deleted and archived records. Cleaner exclusion logic.',
      },
    ],
  },
  {
    id: 'conversion',
    name: 'Type Conversion',
    icon: 'pi pi-sync',
    functions: [
      {
        name: 'toString',
        usage: 'toString({number})',
        description:
          'Converts any value (number, date, boolean) to its text representation. Necessary before concatenating numbers with text or applying string functions to non-text values.',
      },
      {
        name: 'toDecimal',
        usage: 'toDecimal({stringValue})',
        description:
          'Converts a text value to a decimal number. The text must contain a valid number format. Required before performing math on text-based numeric fields from imported data.',
      },
      {
        name: 'toInt',
        usage: 'toInt({stringValue})',
        description:
          'Converts a value to an integer (whole number), truncating any decimal portion. toInt("42.9") returns 42. Use when you need whole numbers from text or decimal sources.',
      },
      {
        name: 'toDate',
        usage: 'toDate({dateString})',
        description:
          'Converts a text string to a date value. The string must be in a recognizable date format. Required before using date functions on text-based date fields from external systems.',
      },
    ],
  },
  {
    id: 'lookup',
    name: 'Lookup Functions',
    icon: 'pi pi-search',
    functions: [
      {
        name: 'lag',
        usage: "lag(data, 'sales', 1)",
        description:
          'Retrieves a value from a previous row in sorted order. lag(data, "sales", 1) gets the sales value from 1 row back. Essential for comparing current values to previous periods.',
      },
      {
        name: 'lead',
        usage: "lead(data, 'sales', 1)",
        description:
          'Retrieves a value from a following row in sorted order. lead(data, "sales", 1) gets sales from the next row. Useful for forecasting comparisons or calculating changes to upcoming periods.',
      },
      {
        name: 'difference',
        usage: "difference(data, 'sales')",
        description:
          'Calculates the absolute change from the previous row. Equivalent to current - lag(current, 1). Positive values indicate increase, negative indicate decrease. Simplifies period-over-period change.',
      },
      {
        name: 'percentDifference',
        usage: "percentDifference(data, 'sales')",
        description:
          'Calculates percentage change from the previous row. Returns (current - previous) / previous * 100. A result of 25 means 25% increase. Crucial for growth metrics and trend analysis.',
      },
    ],
  },
  {
    id: 'window',
    name: 'Window Functions',
    icon: 'pi pi-th-large',
    functions: [
      {
        name: 'firstValue',
        usage: "firstValue(data, 'sales')",
        description:
          'Returns the first value in the current partition or dataset based on sort order. Useful for getting opening values, baseline comparisons, or earliest records in grouped data.',
      },
      {
        name: 'lastValue',
        usage: "lastValue(data, 'sales')",
        description:
          'Returns the last value in the current partition or dataset based on sort order. Get the most recent value, closing price, or final status in time-ordered data.',
      },
      {
        name: 'windowSum',
        usage: "windowSum(data, 'sales', -1, 1)",
        description:
          'Sums values within a sliding window around each row. Parameters define rows before (-1) and after (+1) current row. windowSum with -2, 0 gives a 3-period trailing sum including current.',
      },
      {
        name: 'windowAvg',
        usage: "windowAvg(data, 'sales', -1, 1)",
        description:
          'Calculates average within a sliding window. windowAvg(data, "sales", -2, 0) computes 3-period moving average. Excellent for smoothing volatile data and identifying trends.',
      },
      {
        name: 'windowCount',
        usage: "windowCount(data, 'sales', -1, 1)",
        description:
          'Counts non-null values within a sliding window. Useful for calculating how many data points contributed to window calculations or tracking data density over time.',
      },
      {
        name: 'windowMax',
        usage: "windowMax(data, 'sales', -1, 1)",
        description:
          'Finds maximum value within a sliding window. windowMax with -6, 0 returns the highest value in the last 7 periods. Great for rolling peak analysis or local maxima detection.',
      },
      {
        name: 'windowMin',
        usage: "windowMin(data, 'sales', -1, 1)",
        description:
          'Finds minimum value within a sliding window. Identify rolling troughs, support levels, or minimum thresholds over a specified range of rows around each data point.',
      },
      {
        name: 'percentOfTotal',
        usage: "percentOfTotal(data, 'sales')",
        description:
          "Calculates each row's value as a percentage of the total. If total sales is 1000 and a row is 250, returns 25. Essential for composition analysis and relative contribution metrics.",
      },
    ],
  },
  {
    id: 'running',
    name: 'Running Functions',
    icon: 'pi pi-arrow-right',
    functions: [
      {
        name: 'runningSum',
        usage: "runningSum(data, 'sales')",
        description:
          'Calculates cumulative total up to and including current row. First row shows first value, second row shows sum of first two, etc. Creates year-to-date, quarter-to-date, or any cumulative totals.',
      },
      {
        name: 'runningAvg',
        usage: "runningAvg(data, 'sales')",
        description:
          'Calculates cumulative average from the first row to current row. As more data accumulates, the average stabilizes. Useful for tracking overall average as new data arrives.',
      },
      {
        name: 'runningCount',
        usage: 'runningCount(data)',
        description:
          'Returns a cumulative count of rows from start to current position. Row 1 returns 1, row 5 returns 5. Use for numbering rows or tracking progress through a dataset.',
      },
      {
        name: 'runningMax',
        usage: "runningMax(data, 'sales')",
        description:
          'Tracks the highest value seen so far, from first row to current. Only increases when a new maximum is encountered. Perfect for all-time high tracking or watermark calculations.',
      },
      {
        name: 'runningMin',
        usage: "runningMin(data, 'sales')",
        description:
          'Tracks the lowest value seen so far, from first row to current. Only decreases when a new minimum is encountered. Use for all-time low tracking or floor calculations.',
      },
    ],
  },
  {
    id: 'ranking',
    name: 'Ranking Functions',
    icon: 'pi pi-sort-amount-up',
    functions: [
      {
        name: 'rank',
        usage: "rank(data, 'score')",
        description:
          'Assigns ranks with gaps for ties. If two items tie for rank 1, both get rank 1, and the next item gets rank 3 (skipping 2). Standard competition ranking used in sports and academics.',
      },
      {
        name: 'denseRank',
        usage: "denseRank(data, 'score')",
        description:
          'Assigns ranks without gaps for ties. If two items tie for rank 1, both get rank 1, and the next item gets rank 2. Consecutive ranking useful when you need compact rank ranges.',
      },
      {
        name: 'rowNumber',
        usage: 'rowNumber(data)',
        description:
          'Assigns unique sequential numbers to each row (1, 2, 3, ...) within the partition. No ties possible - each row gets a distinct number. Use for unique row identification or pagination.',
      },
      {
        name: 'percentileRank',
        usage: "percentileRank(data, 'score', value)",
        description:
          'Returns what percentile a specific value falls at within the distribution. If percentileRank returns 90, the value is higher than 90% of all values. Essential for relative performance analysis.',
      },
    ],
  },
];

// Flatten all functions for search
export function getAllFunctions(): FunctionDefinition[] {
  return FUNCTION_CATEGORIES.reduce(
    (acc: FunctionDefinition[], cat: FunctionCategory) =>
      acc.concat(cat.functions),
    []
  );
}

// Search functions by name or description
export function searchFunctions(query: string): FunctionDefinition[] {
  const lowerQuery = query.toLowerCase();
  return getAllFunctions().filter(
    (fn: FunctionDefinition) =>
      fn.name.toLowerCase().includes(lowerQuery) ||
      fn.description.toLowerCase().includes(lowerQuery)
  );
}
