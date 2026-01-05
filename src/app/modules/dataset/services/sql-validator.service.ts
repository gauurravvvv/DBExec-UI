import { Injectable } from '@angular/core';

declare const monaco: any;

/**
 * SQL Validation Error
 */
interface SqlError {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * SQL Validator Service
 * Provides real-time SQL syntax validation with Monaco markers
 */
@Injectable({
  providedIn: 'root',
})
export class SqlValidatorService {
  private validationTimeout: any = null;
  private readonly DEBOUNCE_MS = 300;
  private readonly MARKER_OWNER = 'sql-validator';

  constructor() {}

  /**
   * Validate SQL and set Monaco markers
   * @param model - Monaco editor model
   */
  validate(model: any): void {
    if (!model) return;

    const sql = model.getValue();
    const errors = this.validateSql(sql);

    const markers = errors.map(error => ({
      startLineNumber: error.line,
      startColumn: error.column,
      endLineNumber: error.endLine,
      endColumn: error.endColumn,
      message: error.message,
      severity: this.getSeverity(error.severity),
    }));

    monaco.editor.setModelMarkers(model, this.MARKER_OWNER, markers);
  }

  /**
   * Validate SQL with debouncing (for real-time validation)
   * @param model - Monaco editor model
   */
  validateDebounced(model: any): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
    }

    this.validationTimeout = setTimeout(() => {
      this.validate(model);
    }, this.DEBOUNCE_MS);
  }

  /**
   * Clear all validation markers
   * @param model - Monaco editor model
   */
  clearMarkers(model: any): void {
    if (model) {
      monaco.editor.setModelMarkers(model, this.MARKER_OWNER, []);
    }
  }

  /**
   * Core SQL validation logic
   * @param sql - SQL string to validate
   * @returns Array of validation errors
   */
  private validateSql(sql: string): SqlError[] {
    const errors: SqlError[] = [];
    const lines = sql.split('\n');

    // Check for unclosed parentheses
    const parenError = this.checkUnclosedParentheses(sql, lines);
    if (parenError) errors.push(parenError);

    // Check for unclosed strings
    const stringErrors = this.checkUnclosedStrings(sql, lines);
    errors.push(...stringErrors);

    // Check for missing FROM in SELECT
    const fromError = this.checkMissingFrom(sql, lines);
    if (fromError) errors.push(fromError);

    // Check for dangling operators
    const operatorErrors = this.checkDanglingOperators(lines);
    errors.push(...operatorErrors);

    // Check for empty IN clause
    const inErrors = this.checkEmptyInClause(sql, lines);
    errors.push(...inErrors);

    // Check for invalid clause order
    const orderErrors = this.checkClauseOrder(sql, lines);
    errors.push(...orderErrors);

    // Check for missing semicolon at end (warning only)
    const semicolonError = this.checkMissingSemicolon(sql, lines);
    if (semicolonError) errors.push(semicolonError);

    return errors;
  }

  /**
   * Check for unclosed parentheses
   */
  private checkUnclosedParentheses(
    sql: string,
    lines: string[]
  ): SqlError | null {
    let openCount = 0;
    let closeCount = 0;
    let lastOpenLine = 1;
    let lastOpenColumn = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '(') {
          openCount++;
          lastOpenLine = i + 1;
          lastOpenColumn = j + 1;
        } else if (line[j] === ')') {
          closeCount++;
        }
      }
    }

    if (openCount > closeCount) {
      return {
        line: lastOpenLine,
        column: lastOpenColumn,
        endLine: lastOpenLine,
        endColumn: lastOpenColumn + 1,
        message: `Unclosed parenthesis (${openCount - closeCount} unclosed)`,
        severity: 'error',
      };
    } else if (closeCount > openCount) {
      // Find the extra closing paren
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
          if (line[j] === '(') count++;
          else if (line[j] === ')') {
            count--;
            if (count < 0) {
              return {
                line: i + 1,
                column: j + 1,
                endLine: i + 1,
                endColumn: j + 2,
                message: 'Unexpected closing parenthesis',
                severity: 'error',
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Check for unclosed string literals
   */
  private checkUnclosedStrings(sql: string, lines: string[]): SqlError[] {
    const errors: SqlError[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let inString = false;
      let stringStart = 0;

      for (let j = 0; j < line.length; j++) {
        if (line[j] === "'") {
          // Check for escaped quote
          if (j + 1 < line.length && line[j + 1] === "'") {
            j++; // Skip escaped quote
            continue;
          }

          if (!inString) {
            inString = true;
            stringStart = j + 1;
          } else {
            inString = false;
          }
        }
      }

      if (inString) {
        errors.push({
          line: i + 1,
          column: stringStart,
          endLine: i + 1,
          endColumn: line.length + 1,
          message: 'Unclosed string literal',
          severity: 'error',
        });
      }
    }

    return errors;
  }

  /**
   * Check for SELECT without FROM (except COUNT(*) and similar)
   */
  private checkMissingFrom(sql: string, lines: string[]): SqlError | null {
    const upperSql = sql.toUpperCase();

    // Skip if it's a function-only SELECT (like SELECT NOW(), SELECT 1+1)
    if (/SELECT\s+(?:NOW\s*\(|CURRENT_|1\s*[\+\-\*/]|\d+\s*;)/i.test(sql)) {
      return null;
    }

    // Check if SELECT exists but FROM doesn't
    const selectMatch = upperSql.match(/\bSELECT\b/);
    const fromMatch = upperSql.match(/\bFROM\b/);

    if (selectMatch && !fromMatch) {
      // Find the line where SELECT is
      let selectLine = 1;
      let selectColumn = 1;

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].toUpperCase().match(/\bSELECT\b/);
        if (match) {
          selectLine = i + 1;
          selectColumn = lines[i].toUpperCase().indexOf('SELECT') + 1;
          break;
        }
      }

      // Only warn if SQL looks like a table SELECT
      if (/SELECT\s+[\w\*,\s\.]+\s*$/i.test(sql.trim())) {
        return {
          line: selectLine,
          column: selectColumn,
          endLine: selectLine,
          endColumn: selectColumn + 6,
          message: 'SELECT statement may be missing FROM clause',
          severity: 'warning',
        };
      }
    }

    return null;
  }

  /**
   * Check for dangling AND/OR operators
   */
  private checkDanglingOperators(lines: string[]): SqlError[] {
    const errors: SqlError[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if line ends with AND/OR (and there's a next line or it's the last)
      if (/\b(AND|OR)\s*$/i.test(line)) {
        const nextLine = lines[i + 1]?.trim() || '';

        // Only error if next line is empty or doesn't continue the clause
        if (!nextLine || /^(GROUP|ORDER|LIMIT|HAVING|;|\)|$)/i.test(nextLine)) {
          const match = line.match(/\b(AND|OR)\s*$/i);
          if (match) {
            const column = lines[i].lastIndexOf(match[1]) + 1;
            errors.push({
              line: i + 1,
              column: column,
              endLine: i + 1,
              endColumn: column + match[1].length,
              message: `Dangling ${match[1].toUpperCase()} operator`,
              severity: 'error',
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Check for empty IN clause
   */
  private checkEmptyInClause(sql: string, lines: string[]): SqlError[] {
    const errors: SqlError[] = [];
    const regex = /\bIN\s*\(\s*\)/gi;
    let match;

    while ((match = regex.exec(sql)) !== null) {
      const pos = this.getLineAndColumn(sql, match.index);
      errors.push({
        line: pos.line,
        column: pos.column,
        endLine: pos.line,
        endColumn: pos.column + match[0].length,
        message: 'Empty IN clause',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Check for invalid clause order (WHERE before FROM, etc.)
   */
  private checkClauseOrder(sql: string, lines: string[]): SqlError[] {
    const errors: SqlError[] = [];
    const upperSql = sql.toUpperCase();

    // Check WHERE before FROM
    const whereIndex = upperSql.indexOf('WHERE');
    const fromIndex = upperSql.indexOf('FROM');

    if (whereIndex !== -1 && fromIndex !== -1 && whereIndex < fromIndex) {
      const pos = this.getLineAndColumn(sql, whereIndex);
      errors.push({
        line: pos.line,
        column: pos.column,
        endLine: pos.line,
        endColumn: pos.column + 5,
        message: 'WHERE clause must come after FROM clause',
        severity: 'error',
      });
    }

    // Check GROUP BY before FROM
    const groupByIndex = upperSql.indexOf('GROUP BY');
    if (groupByIndex !== -1 && fromIndex !== -1 && groupByIndex < fromIndex) {
      const pos = this.getLineAndColumn(sql, groupByIndex);
      errors.push({
        line: pos.line,
        column: pos.column,
        endLine: pos.line,
        endColumn: pos.column + 8,
        message: 'GROUP BY clause must come after FROM clause',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Check for missing semicolon at end (warning)
   */
  private checkMissingSemicolon(sql: string, lines: string[]): SqlError | null {
    const trimmed = sql.trim();

    // Only check non-empty SQL that looks like a complete statement
    if (
      trimmed &&
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(trimmed) &&
      !trimmed.endsWith(';')
    ) {
      const lastLine = lines.length;
      const lastColumn = lines[lastLine - 1].length + 1;

      return {
        line: lastLine,
        column: lastColumn,
        endLine: lastLine,
        endColumn: lastColumn,
        message: 'Statement should end with semicolon',
        severity: 'info',
      };
    }

    return null;
  }

  /**
   * Convert string index to line and column
   */
  private getLineAndColumn(
    sql: string,
    index: number
  ): { line: number; column: number } {
    const lines = sql.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  /**
   * Map severity string to Monaco MarkerSeverity
   */
  private getSeverity(severity: 'error' | 'warning' | 'info'): any {
    switch (severity) {
      case 'error':
        return monaco.MarkerSeverity.Error;
      case 'warning':
        return monaco.MarkerSeverity.Warning;
      case 'info':
        return monaco.MarkerSeverity.Info;
      default:
        return monaco.MarkerSeverity.Warning;
    }
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
      this.validationTimeout = null;
    }
  }
}
