/**
 * Monaco signature-help provider for SQL function calls.
 */

import { COMMON_SQL_SNIPPETS, getDialectSpec } from '../../config/sql-dialects';
import {
  DatasourceSchema,
  TableColumn,
  TableSchema,
} from '../../models/dataset-schema.model';
import { CursorScope, findScopeAt } from '../sql-scope-tracker';
import {
  RESERVED_WORDS,
  TableRef,
  buildAliasMap,
  extractBalancedParens,
  generateAlias,
  getContext,
  isCursorInStringOrComment,
  parseCTEReferences,
  parseTableReferences,
  quoteIdentifier,
  stripStringsAndComments,
} from '../sql-text-analysis';
import { IntelliSenseContext } from './intellisense-context';



/** Monaco is loaded at runtime by MonacoLoaderService, not bundled. */
declare const monaco: any;


/**
 * Register signature help provider to show function parameter info.
 * Shows signature when typing inside function parentheses: COUNT(|), SUBSTRING(str, |)
 * @returns Disposable to unregister the provider
 */
export function registerSignatureHelpProvider(svc: IntelliSenseContext): any {
  return monaco.languages.registerSignatureHelpProvider('sql', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp: (model: any, position: any) => {
      try {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // Walk backwards from cursor to find the enclosing function call
        let parenDepth = 0;
        let commaCount = 0;
        let funcParenPos = -1;

        for (let i = textUntilPosition.length - 1; i >= 0; i--) {
          const ch = textUntilPosition[i];
          if (ch === ')') {
            parenDepth++;
          } else if (ch === '(') {
            if (parenDepth === 0) {
              funcParenPos = i;
              break;
            }
            parenDepth--;
          } else if (ch === ',' && parenDepth === 0) {
            commaCount++;
          }
        }

        if (funcParenPos < 0) return null;

        // Extract function name (word before the opening paren)
        const beforeParen = textUntilPosition
          .substring(0, funcParenPos)
          .replace(/\s+$/, '');
        const funcNameMatch = beforeParen.match(/(\w+)$/);
        if (!funcNameMatch) return null;

        const funcName = funcNameMatch[1].toUpperCase();

        // Look up the function definition in the dialect catalog
        const funcDef = getDialectSpec(svc.activeDbType).functions.find(
          f => f.name.toUpperCase() === funcName,
        );
        if (!funcDef) return null;

        // Build parameter list
        const params = funcDef.params
          ? funcDef.params
              .split(',')
              .map(p => p.replace(/\s+/g, ' ').trim())
              .filter(p => p)
          : [];

        if (params.length === 0) return null;

        return {
          value: {
            signatures: [
              {
                label: `${funcDef.name}(${funcDef.params})`,
                documentation: funcDef.description,
                parameters: params.map(p => ({
                  label: p,
                  documentation: '',
                })),
              },
            ],
            activeSignature: 0,
            activeParameter: Math.min(commaCount, params.length - 1),
          },
          dispose: () => {},
        };
      } catch {
        return null;
      }
    },
  });
}

// ─── KEYBOARD SHORTCUTS ────────────────────────────────────
