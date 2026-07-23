import { TranslateService } from '@ngx-translate/core';

/**
 * Structured "intent" a mutation is about to perform. This is the SAME
 * shape the FE POSTs to the backend (change-set statements + role ops) —
 * NO SQL is ever constructed or displayed on the FE. describeChange()
 * turns one intent into a single plain-language line the user confirms.
 *
 * The backend still builds + executes the real SQL and keeps it in the
 * audit log; the UI only ever shows these human summaries.
 */
export interface ChangeIntent {
  kind:
    | 'createRole'
    | 'alterRole'
    | 'deleteRole'
    | 'renameRole'
    | 'deactivate'
    | 'grantMembership'
    | 'revokeMembership'
    | 'grant'
    | 'revoke'
    | 'revokePublic'
    | 'defaultPriv';
  // role / user ops
  name?: string;
  newName?: string;
  attributes?: any;
  reassignTo?: string;
  dropOwned?: boolean;
  // membership
  role?: string | string[];
  toRole?: string;
  adminOption?: boolean;
  // grant / revoke (privilege statements)
  privileges?: string[];
  objectType?:
    'table' | 'column' | 'schema' | 'sequence' | 'function' | 'database';
  schema?: string;
  tables?: string[];
  columns?: string[];
  grantee?: string;
  withGrantOption?: boolean;
  cascade?: boolean;
}

function list(arr?: string[] | string): string {
  if (!arr) return '';
  const a = Array.isArray(arr) ? arr : [arr];
  return a.join(', ');
}

/**
 * Render a single intent as a plain-language sentence via i18n keys.
 * Keys live under DB_ACCESS.SUMMARY.* in en.json. Falls back to a terse
 * generic description if a specific key is missing.
 */
export function describeChange(
  intent: ChangeIntent,
  t: TranslateService,
): string {
  switch (intent.kind) {
    case 'createRole': {
      const isLogin = intent.attributes?.login;
      const parts: string[] = [];
      if (intent.attributes?.validUntil) {
        parts.push(
          t.instant('DB_ACCESS.SUMMARY.EXPIRING', {
            date: new Date(intent.attributes.validUntil).toLocaleDateString(),
          }),
        );
      }
      const suffix = parts.length ? ' ' + parts.join('; ') : '';
      return (
        t.instant(
          isLogin
            ? 'DB_ACCESS.SUMMARY.CREATE_USER'
            : 'DB_ACCESS.SUMMARY.CREATE_ROLE',
          {
            name: intent.name,
          },
        ) + suffix
      );
    }
    case 'alterRole':
      return t.instant('DB_ACCESS.SUMMARY.ALTER_ROLE', { name: intent.name });
    case 'deactivate':
      return t.instant('DB_ACCESS.SUMMARY.DEACTIVATE', { name: intent.name });
    case 'renameRole':
      return t.instant('DB_ACCESS.SUMMARY.RENAME', {
        name: intent.name,
        newName: intent.newName,
      });
    case 'deleteRole':
      if (intent.dropOwned)
        return t.instant('DB_ACCESS.SUMMARY.DELETE_DROP', {
          name: intent.name,
        });
      if (intent.reassignTo)
        return t.instant('DB_ACCESS.SUMMARY.DELETE_REASSIGN', {
          name: intent.name,
          target: intent.reassignTo,
        });
      return t.instant('DB_ACCESS.SUMMARY.DELETE_SIMPLE', {
        name: intent.name,
      });
    case 'grantMembership':
      return t.instant('DB_ACCESS.SUMMARY.GRANT_MEMBERSHIP', {
        role: list(intent.role),
        toRole: intent.toRole,
      });
    case 'revokeMembership':
      return t.instant('DB_ACCESS.SUMMARY.REVOKE_MEMBERSHIP', {
        role: list(intent.role),
        toRole: intent.toRole,
      });
    case 'grant': {
      const scope = describeScope(intent, t);
      return (
        t.instant('DB_ACCESS.SUMMARY.GRANT', {
          privileges: list(intent.privileges),
          scope,
          grantee: intent.grantee,
        }) +
        (intent.withGrantOption
          ? ' ' + t.instant('DB_ACCESS.SUMMARY.WITH_GRANT')
          : '')
      );
    }
    case 'revoke': {
      const scope = describeScope(intent, t);
      return t.instant('DB_ACCESS.SUMMARY.REVOKE', {
        privileges: list(intent.privileges),
        scope,
        grantee: intent.grantee,
      });
    }
    case 'revokePublic': {
      const scope = describeScope(intent, t);
      return t.instant('DB_ACCESS.SUMMARY.REVOKE_PUBLIC', { scope });
    }
    case 'defaultPriv': {
      const scope = describeScope(intent, t);
      return t.instant('DB_ACCESS.SUMMARY.DEFAULT_PRIV', {
        privileges: list(intent.privileges),
        scope,
        grantee: intent.grantee,
      });
    }
    default:
      return t.instant('DB_ACCESS.SUMMARY.GENERIC');
  }
}

/**
 * Human phrase for the object scope of a privilege statement, e.g.
 * "3 tables in schema 'sales'", "columns (id, name) of sales.orders",
 * "schema 'sales'".
 */
function describeScope(intent: ChangeIntent, t: TranslateService): string {
  switch (intent.objectType) {
    case 'schema':
      return t.instant('DB_ACCESS.SUMMARY.SCOPE_SCHEMA', {
        schema: intent.schema,
      });
    case 'column':
      return t.instant('DB_ACCESS.SUMMARY.SCOPE_COLUMNS', {
        columns: list(intent.columns),
        schema: intent.schema,
        table: (intent.tables && intent.tables[0]) || '',
      });
    case 'sequence':
      return t.instant('DB_ACCESS.SUMMARY.SCOPE_SEQUENCES', {
        schema: intent.schema,
      });
    case 'function':
      return t.instant('DB_ACCESS.SUMMARY.SCOPE_FUNCTIONS', {
        schema: intent.schema,
      });
    case 'database':
      return t.instant('DB_ACCESS.SUMMARY.SCOPE_DATABASE');
    case 'table':
    default: {
      const count = intent.tables?.length ?? 0;
      if (count === 0)
        return t.instant('DB_ACCESS.SUMMARY.SCOPE_ALL_TABLES', {
          schema: intent.schema,
        });
      return t.instant('DB_ACCESS.SUMMARY.SCOPE_TABLES', {
        count,
        schema: intent.schema,
      });
    }
  }
}
