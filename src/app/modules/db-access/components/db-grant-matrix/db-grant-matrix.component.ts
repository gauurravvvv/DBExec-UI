import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/** Privilege sets per object level (PostgreSQL). */
const TABLE_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const COLUMN_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
const SCHEMA_PRIVS = ['USAGE', 'CREATE'];
const SEQUENCE_PRIVS = ['USAGE', 'SELECT', 'UPDATE'];
const FUNCTION_PRIVS = ['EXECUTE'];

/**
 * One composed access rule (a repeater row). Maps to one or more
 * change-set statements when serialised. NO SQL — pure structured intent.
 */
interface AccessRule {
  id: number;
  schema: string;
  allTables: boolean;
  tables: string[];
  columnsByTable: Record<string, string[]>; // table → columns (optional column-level)
  level: 'table' | 'column' | 'schema' | 'sequence' | 'function';
  privileges: string[];
  grantee: string;
  action: 'grant' | 'revoke';
  withGrantOption: boolean;
  // per-rule cascade of loaded tables/columns
  loadedTables?: string[];
}

/**
 * DbGrantMatrixComponent — the privilege authoring surface, built as an
 * "Access Rules" step-repeater (no raw grant form, no SQL). Each rule row
 * cascades Schema → Tables (with "all tables" toggle) → optional Columns →
 * Privileges appropriate to the level, plus a grantee + grant/revoke +
 * grant-option. Rules stack; a running plain-language summary reflects the
 * composition. "Review changes" opens the change-summary confirm gate which
 * POSTs the composed statements[] to /change-set (previewOnly to validate,
 * then confirm to execute). Also: schema-level (USAGE/CREATE),
 * sequence/function grants (via level), a PUBLIC-hardening row, and a
 * default-privileges panel.
 */
@Component({
  selector: 'app-db-grant-matrix',
  templateUrl: './db-grant-matrix.component.html',
  styleUrls: ['./db-grant-matrix.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbGrantMatrixComponent implements OnInit {
  @Input() datasourceId = '';
  @Input() canManage = false;

  private cdr = inject(ChangeDetectorRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;

  schemas: string[] = [];
  roleNames: string[] = [];
  levelOptions: { label: string; value: AccessRule['level'] }[] = [];
  defaultPrivileges: any[] = [];

  rules: AccessRule[] = [];
  private ruleSeq = 0;

  // per-rule table/column caches keyed by "ruleId"
  tableCache: Record<number, string[]> = {};
  columnCache: Record<string, string[]> = {}; // key `${schema}.${table}`

  // ── PUBLIC hardening row ──────────────────────────────────────────────
  publicSchema = '';

  // ── Change-summary confirm gate ──────────────────────────────────────
  showConfirm = false;
  confirmLoading = false;
  summaries: string[] = [];
  confirmDestructive = false;
  private pendingStatements: any[] = [];

  constructor(
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.levelOptions = [
      { label: this.translate.instant('DB_ACCESS.LEVEL_TABLE'), value: 'table' },
      { label: this.translate.instant('DB_ACCESS.LEVEL_COLUMN'), value: 'column' },
      { label: this.translate.instant('DB_ACCESS.LEVEL_SCHEMA'), value: 'schema' },
      { label: this.translate.instant('DB_ACCESS.LEVEL_SEQUENCE'), value: 'sequence' },
      { label: this.translate.instant('DB_ACCESS.LEVEL_FUNCTION'), value: 'function' },
    ];
    this.loadSchemas();
    this.loadRoles();
    this.loadDefaults();
    this.addRule();
  }

  private loadSchemas(): void {
    this.dbAccess.loadSchemas(this.datasourceId).then(() => {
      const raw = this.dbAccess.schemas() ?? [];
      this.schemas = raw.map((s: any) => (typeof s === 'string' ? s : s.name ?? s.schema));
      this.cdr.markForCheck();
    }).catch(() => {});
  }

  private loadRoles(): void {
    this.dbAccess.loadRoles(this.datasourceId).then(() => {
      this.roleNames = (this.dbAccess.roles() ?? []).map(r => r.name);
      this.cdr.markForCheck();
    }).catch(() => {});
  }

  private loadDefaults(): void {
    this.dbAccess.loadDefaultPrivileges(this.datasourceId).then(res => {
      if (res?.status) this.defaultPrivileges = res.data ?? [];
      this.cdr.markForCheck();
    }).catch(() => {});
  }

  // ── Rule repeater ───────────────────────────────────────────────────────

  addRule(): void {
    this.rules = [
      ...this.rules,
      {
        id: ++this.ruleSeq,
        schema: '',
        allTables: true,
        tables: [],
        columnsByTable: {},
        level: 'table',
        privileges: [],
        grantee: '',
        action: 'grant',
        withGrantOption: false,
      },
    ];
  }

  removeRule(rule: AccessRule): void {
    this.rules = this.rules.filter(r => r.id !== rule.id);
  }

  privsFor(level: AccessRule['level']): string[] {
    switch (level) {
      case 'column': return COLUMN_PRIVS;
      case 'schema': return SCHEMA_PRIVS;
      case 'sequence': return SEQUENCE_PRIVS;
      case 'function': return FUNCTION_PRIVS;
      case 'table':
      default: return TABLE_PRIVS;
    }
  }

  onLevelChange(rule: AccessRule): void {
    // Drop privileges that no longer apply to the new level.
    const allowed = this.privsFor(rule.level);
    rule.privileges = rule.privileges.filter(p => allowed.includes(p));
  }

  onSchemaChange(rule: AccessRule): void {
    rule.tables = [];
    rule.columnsByTable = {};
    if (!rule.schema) return;
    if (this.tableCache[rule.id]?.length) {
      rule.loadedTables = this.tableCache[rule.id];
      return;
    }
    this.dbAccess.loadTableGrants(this.datasourceId, rule.schema).then(res => {
      if (res?.status) {
        const tables = (res.data ?? []).map((t: any) => (typeof t === 'string' ? t : t.table ?? t.name));
        this.tableCache[rule.id] = tables;
        rule.loadedTables = tables;
      }
      this.cdr.markForCheck();
    }).catch(() => {});
  }

  tablesFor(rule: AccessRule): string[] {
    return rule.loadedTables ?? this.tableCache[rule.id] ?? [];
  }

  loadColumnsFor(rule: AccessRule, table: string): void {
    const key = `${rule.schema}.${table}`;
    if (this.columnCache[key]) return;
    this.dbAccess.loadColumnGrants(this.datasourceId, rule.schema, table).then(res => {
      if (res?.status) {
        this.columnCache[key] = (res.data ?? []).map((c: any) => (typeof c === 'string' ? c : c.column ?? c.name));
      }
      this.cdr.markForCheck();
    }).catch(() => {});
  }

  columnsFor(rule: AccessRule, table: string): string[] {
    return this.columnCache[`${rule.schema}.${table}`] ?? [];
  }

  togglePriv(rule: AccessRule, priv: string): void {
    rule.privileges = rule.privileges.includes(priv)
      ? rule.privileges.filter(p => p !== priv)
      : [...rule.privileges, priv];
  }

  ruleValid(rule: AccessRule): boolean {
    if (!rule.schema || !rule.grantee || !rule.privileges.length) return false;
    if (rule.level === 'table' && !rule.allTables && !rule.tables.length) return false;
    if (rule.level === 'column' && !rule.tables.length) return false;
    return true;
  }

  get anyValidRule(): boolean {
    return this.rules.some(r => this.ruleValid(r));
  }

  // Live plain-language summary of composed rules (shown in the tray).
  get liveSummaries(): string[] {
    return this.rules.filter(r => this.ruleValid(r)).map(r => describeChange(this.ruleToIntent(r), this.translate));
  }

  private ruleToIntent(rule: AccessRule): ChangeIntent {
    return {
      kind: rule.action,
      privileges: rule.privileges,
      objectType: rule.level,
      schema: rule.schema,
      tables: rule.allTables && rule.level === 'table' ? [] : rule.tables,
      columns:
        rule.level === 'column' && rule.tables.length
          ? rule.columnsByTable[rule.tables[0]] ?? []
          : undefined,
      grantee: rule.grantee,
      withGrantOption: rule.withGrantOption,
    };
  }

  /**
   * Map a composed AccessRule into the EXACT structured intent the
   * backend applyChangeSet expects (which maps 1:1 to pgSqlBuilder):
   *   grant:  { kind, objType, privileges, toRole, object, withGrantOption? }
   *   revoke: { kind, objType, privileges, fromRole, object, behavior? }
   * where object = { parts? | allInSchema? | columns? }.
   *
   * A single column-level rule with multiple tables expands into one
   * statement per table (column grants are per-table in Postgres).
   * Everything else is one statement.
   */
  private ruleToStatements(rule: AccessRule): any[] {
    const objType = rule.level.toUpperCase(); // TABLE | COLUMN→TABLE | SCHEMA | SEQUENCE | FUNCTION
    const roleKey = rule.action === 'grant' ? 'toRole' : 'fromRole';
    const base: any = {
      kind: rule.action,
      privileges: rule.privileges,
      [roleKey]: rule.grantee,
    };
    if (rule.action === 'grant' && rule.withGrantOption) {
      base.withGrantOption = true;
    }
    if (rule.action === 'revoke') {
      base.behavior = 'RESTRICT';
    }

    // Schema-level: object targets the schema itself.
    if (rule.level === 'schema') {
      return [{ ...base, objType: 'SCHEMA', object: { parts: [rule.schema] } }];
    }

    // Column-level: one TABLE statement per table, columns array
    // shaped as pgSqlBuilder's ObjectRef.columns = [{privilege, columns}].
    if (rule.level === 'column') {
      return rule.tables.map(table => ({
        ...base,
        objType: 'TABLE',
        object: {
          parts: [rule.schema, table],
          columns: rule.privileges.map(p => ({
            privilege: p,
            columns: rule.columnsByTable[table] ?? [],
          })),
        },
      }));
    }

    // Table / sequence / function level.
    // "All tables in schema" → object.allInSchema; else one stmt per object.
    if (rule.allTables) {
      return [{ ...base, objType, object: { allInSchema: rule.schema } }];
    }
    return rule.tables.map(name => ({
      ...base,
      objType,
      object: { parts: [rule.schema, name] },
    }));
  }

  // ── Review + apply ────────────────────────────────────────────────────────

  reviewChanges(): void {
    const valid = this.rules.filter(r => this.ruleValid(r));
    if (!valid.length) return;
    this.pendingStatements = valid.flatMap(r => this.ruleToStatements(r));
    this.summaries = valid.map(r => describeChange(this.ruleToIntent(r), this.translate));
    this.confirmDestructive = valid.some(r => r.action === 'revoke');
    this.openConfirm();
  }

  // ── PUBLIC hardening ──────────────────────────────────────────────────────

  revokePublic(): void {
    if (!this.publicSchema) return;
    // BE revokePublic intent: { kind, objType, privileges, object }.
    // Hardening recipe = revoke USAGE + CREATE on the schema from PUBLIC.
    const stmt = {
      kind: 'revokePublic',
      objType: 'SCHEMA',
      privileges: ['USAGE', 'CREATE'],
      object: { parts: [this.publicSchema] },
    };
    this.pendingStatements = [stmt];
    const intent: ChangeIntent = { kind: 'revokePublic', objectType: 'schema', schema: this.publicSchema };
    this.summaries = [describeChange(intent, this.translate)];
    this.confirmDestructive = true;
    this.openConfirm();
  }

  private openConfirm(): void {
    this.showConfirm = true;
    this.confirmLoading = true;
    this.cdr.markForCheck();
    // Dry-run validate on the BE (previewOnly) — surface success only, no SQL.
    this.dbAccess
      .applyChangeSet(this.datasourceId, { statements: this.pendingStatements, previewOnly: true })
      .then(res => {
        if (!res?.status) {
          this.globalService.handleSuccessService(res);
          this.showConfirm = false;
        }
      })
      .catch(() => {
        this.showConfirm = false;
      })
      .finally(() => {
        this.confirmLoading = false;
        this.cdr.markForCheck();
      });
  }

  confirmApply(): void {
    this.dbAccess
      .applyChangeSet(this.datasourceId, {
        statements: this.pendingStatements,
        confirm: true,
      })
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showConfirm = false;
          // Clear the tray + reset a single fresh rule.
          this.rules = [];
          this.ruleSeq = 0;
          this.publicSchema = '';
          this.addRule();
          this.loadDefaults();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  cancelConfirm(): void {
    this.showConfirm = false;
    this.pendingStatements = [];
  }
}
