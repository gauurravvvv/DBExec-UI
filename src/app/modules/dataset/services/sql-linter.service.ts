/**
 * SqlLinterService — dialect-aware in-browser SQL syntax check.
 *
 * Walks the active dialect's Lezer parse tree, collects nodes flagged as
 * errors by lang-sql's grammar, and projects them into Monaco
 * IMarkerData[] for the editor's setModelMarkers() decoration channel.
 *
 * Dialects whose DialectSpec.parser is null (Snowflake — no upstream
 * Lezer grammar) get a zero-marker result. The editor then shows no
 * lint decorations for those datasources; runtime errors from the
 * actual DB engine are still the ground truth.
 *
 * Gated behind ENABLE_DIALECT_LINT in sql-editor.config.ts so the rest
 * of the dialect rework can ship while we shake out false positives
 * (lang-sql is permissive on standard SQL but rejects some MySQL /
 * MSSQL extensions the engines themselves accept).
 */
import { Injectable } from '@angular/core';
import type { LRParser } from '@lezer/lr';
import type { Tree } from '@lezer/common';
import { DatabaseTypeValue } from '../../datasource/constants/database-types.constant';
import { getDialectSpec } from '../config/sql-dialects';

declare const monaco: any;

/**
 * Subset of Monaco's IMarkerData shape that we actually produce. Typed
 * inline (rather than imported from monaco-editor) because Monaco's
 * type globals aren't always picked up at compile time in this project
 * — `declare const monaco: any` is the project's existing escape hatch.
 */
export interface SqlLintMarker {
  severity: number; // monaco.MarkerSeverity.Error etc.
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** Hard cap so a degenerate file doesn't flood the markers panel. */
const MAX_MARKERS = 50;

@Injectable({ providedIn: 'root' })
export class SqlLinterService {
  /**
   * Parse `text` with the active dialect's grammar and return Monaco
   * markers for syntax errors. Returns an empty array when the dialect
   * has no parser (Snowflake), when the text is empty, or when parsing
   * fails outright — caller should treat a zero-marker result the same
   * as "no errors found".
   */
  lint(
    text: string,
    dbType: DatabaseTypeValue | string | null,
  ): SqlLintMarker[] {
    if (!text || !text.trim()) return [];

    const dialect = getDialectSpec(dbType);
    const parser: LRParser | null = dialect.parser;
    if (!parser) return [];

    let tree: Tree;
    try {
      tree = parser.parse(text);
    } catch {
      // A grammar exception isn't actionable as a marker; bail silently.
      return [];
    }

    const markers: SqlLintMarker[] = [];
    // Precompute newline offsets so we can convert byte positions to
    // (line, column) in O(log n) via binary search inside positionToLineCol.
    const lineStarts = computeLineStarts(text);

    tree.iterate({
      enter: node => {
        if (markers.length >= MAX_MARKERS) return false;
        if (!node.type.isError) return;
        // Lezer error nodes can be zero-width when the parser missed a
        // closing token. Widen by one character so Monaco's decoration
        // actually highlights something the user can click.
        const from = node.from;
        const to = node.to > node.from ? node.to : node.from + 1;
        const start = positionToLineCol(from, lineStarts);
        const end = positionToLineCol(to, lineStarts);
        markers.push({
          severity:
            (typeof monaco !== 'undefined' && monaco?.MarkerSeverity?.Error) ??
            8,
          message: 'SQL syntax error',
          startLineNumber: start.line,
          startColumn: start.column,
          endLineNumber: end.line,
          endColumn: end.column,
        });
        return undefined;
      },
    });

    return markers;
  }
}

/**
 * Build a sorted array of byte offsets pointing to the first character
 * of each line. `lineStarts[0]` is always 0; `lineStarts[k]` is the
 * offset of the first character after the (k-1)th newline.
 */
function computeLineStarts(text: string): number[] {
  const out: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) out.push(i + 1);
  }
  return out;
}

/**
 * Convert a flat byte offset into Monaco's 1-based (lineNumber, column).
 * Binary search over the precomputed lineStarts array.
 */
function positionToLineCol(
  offset: number,
  lineStarts: number[],
): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return {
    line: lo + 1,
    column: offset - lineStarts[lo] + 1,
  };
}
