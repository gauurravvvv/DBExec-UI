import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/** PostgreSQL privilege sets per object level. */
const TABLE_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const COLUMN_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'];
const SCHEMA_PRIVS = ['USAGE', 'CREATE'];
const SEQUENCE_PRIVS = ['USAGE', 'SELECT', 'UPDATE'];
const FUNCTION_PRIVS = ['EXECUTE'];

type Level = 'table' | 'column' | 'schema' | 'sequence' | 'function';
type Option = { label: string; value: string };

/**
 * One composed access rule (a repeater row). Maps to one or more change-set
 * statements when serialised. NO SQL — pure structured intent. Objects
 * (tables / sequences / functions) come from the memoised context cache.
 */
interface AccessRule {
  id: number;
  schema: string;
  allTables: boolean;
  tables: string[];
  columnsByTable: Record<string, string[]>;
  level: Level;
  privileges: string[];
  grantee: string;
  action: 'grant' | 'revoke';
  withGrantOption: boolean;
}

/**
 * PrivilegesAccessComponent — the merged Privileges + Effective surface.
 * NO p-tabView. Layout: a pending-changes + Apply bar at the TOP, then a
 * two-column body — the Access-Rules composer (which scrolls inside a
 * bounded flex container) on the left, and a rail on the right holding a
 * role FILTER (its live effective privileges) and the default-privileges
 * panel.
 *
 * FULLY STATELESS: the composer reads the role's LIVE effective privileges
 * and applies grant/restrict change-sets directly against the target
 * datasource. Nothing is saved to our DB — there are no saved privilege
 * sets.
 *
 * Efficiency (fix #6/#8): all schema/table/column/sequence/function reads go
 * through DbAccessContextService, which memoises by data tuple and dedupes
 * in-flight calls — N rules on the same schema share ONE fetch, and a
 * datasource switch cancels stale responses + clears the cache.
 *
 * The component is OnPush; every rule mutation uses an immutable update
 * (`this.rules = [...]`) followed by markForCheck() so the Apply button's
 * disabled state + the live summary never go stale (fix #9). Apply POSTs the
 * composed statements[] to /change-set and refreshes on success.
 */
@Component({
  selector: 'app-privileges-access',
  templateUrl: './privileges-access.component.html',
  styleUrls: ['./privileges-access.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivilegesAccessComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;
  capability = this.ctx.capability;
  capabilityLoading = this.ctx.capabilityLoading;
  unsupported = this.ctx.unsupported;

  datasourceId = '';

  schemaOptions: Option[] = [];
  roleOptions: Option[] = [];
  levelOptions: { label: string; value: Level }[] = [];
  defaultPrivileges: any[] = [];

  rules: AccessRule[] = [];
  private ruleSeq = 0;

  // Per-rule hints (e.g. column-level pruned tables to a single table).
  ruleHints: Record<number, string> = {};

  // ── Role filter → effective privileges (merged from old Effective tab) ──
  filterRole = '';
  effectiveRows: any[] = [];
  effectiveLoading = false;

  // ── Change-summary confirm gate ─────────────────────────────────────────
  showConfirm = false;
  confirmLoading = false;
  summaries: string[] = [];
  confirmDestructive = false;
  private pendingStatements: any[] = [];

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  get canManage(): boolean {
    return this.ctx.canManage;
  }

  ngOnInit(): void {
    this.levelOptions = [
      { label: this.translate.instant('DB_ACCESS.LEVEL_TABLE'), value: 'table' },
      { label: this.translate.instant('DB_ACCESS.LEVEL_COLUMN'), value: 'column' },
      { label: this.translate.instant('DB_ACCESS.LEVEL_SCHEMA'), value: 'schema' },
      { label: this.translate.instant('DB_ACCESS.LEVEL_SEQUENCE'), value: 'sequence' },
      { label: this.translate.instant('DB_ACCESS.LEVEL_FUNCTION'), value: 'function' },
    ];
  }

  ngOnDestroy(): void {
    this.dbAccess.cancelReads();
  }

  /** Emitted by the datasource picker (init hydrate + change). */
  onDatasourceChange(id: string): void {
    this.datasourceId = id || '';
    // Reset ALL composer state on datasource switch (fix #12) — the context
    // already cleared its caches + cancelled in-flight for the old one.
    this.schemaOptions = [];
    this.roleOptions = [];
    this.defaultPrivileges = [];
    this.rules = [];
    this.ruleSeq = 0;
    this.ruleHints = {};
    this.filterRole = '';
    this.effectiveRows = [];
    if (!this.datasourceId) {
      this.cdr.markForCheck();
      return;
    }
    this.loadSchemas();
    this.loadRoles();
    this.loadDefaults();
    this.addRule();
    this.cdr.markForCheck();
  }

  private loadSchemas(): void {
    this.ctx.loadSchemas(this.datasourceId).then(opts => {
      this.schemaOptions = opts;
      this.cdr.markForCheck();
    });
  }

  private loadRoles(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        this.roleOptions = (this.dbAccess.roles() ?? []).map(r => ({ label: r.name, value: r.name }));
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  private loadDefaults(): void {
    this.dbAccess
      .loadDefaultPrivileges(this.datasourceId)
      .then(res => {
        if (res?.status) this.defaultPrivileges = res.data ?? [];
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  // ── Rule repeater (immutable updates + markForCheck; fix #9) ────────────

  trackByRule = (_: number, rule: AccessRule): number => rule.id;

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
    this.cdr.markForCheck();
  }

  removeRule(rule: AccessRule): void {
    // Tear down cached options for this rule's schema if no other rule uses
    // it (fix #12) — the context cache is shared, so only invalidate when
    // this was the last consumer.
    const stillUsed = this.rules.some(r => r.id !== rule.id && r.schema === rule.schema);
    if (rule.schema && !stillUsed) {
      this.ctx.invalidateSchema(this.datasourceId, rule.schema);
    }
    delete this.ruleHints[rule.id];
    this.rules = this.rules.filter(r => r.id !== rule.id);
    this.cdr.markForCheck();
  }

  privsFor(level: Level): string[] {
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
    // Prune privileges that don't apply to the new level (fix #12).
    const allowed = this.privsFor(rule.level);
    rule.privileges = rule.privileges.filter(p => allowed.includes(p));

    // Column level targets a SINGLE table (fix #7): if multiple were picked,
    // keep the first and surface a hint.
    if (rule.level === 'column' && rule.tables.length > 1) {
      rule.tables = [rule.tables[0]];
      this.ruleHints[rule.id] = this.translate.instant('DB_ACCESS.COLUMN_LEVEL_SINGLE_TABLE');
    } else {
      delete this.ruleHints[rule.id];
    }

    // Switching to a schema-only level drops table/column selections.
    if (rule.level === 'schema') {
      rule.tables = [];
      rule.columnsByTable = {};
      rule.allTables = true;
    }

    // Load objects for sequence/function levels (fix #10).
    if ((rule.level === 'sequence' || rule.level === 'function') && rule.schema) {
      this.loadObjectsFor(rule);
    }

    this.rules = [...this.rules];
    this.cdr.markForCheck();
  }

  onSchemaChange(rule: AccessRule): void {
    // Clearing the schema clears tables + columns + dependent state (fix #12).
    rule.tables = [];
    rule.columnsByTable = {};
    delete this.ruleHints[rule.id];
    if (!rule.schema) {
      this.rules = [...this.rules];
      this.cdr.markForCheck();
      return;
    }
    // Memoised fetch — shared across rules on the same schema (fix #6/#8).
    if (rule.level === 'sequence' || rule.level === 'function') {
      this.loadObjectsFor(rule);
    } else {
      this.ctx.loadTables(this.datasourceId, rule.schema).then(() => {
        this.rules = [...this.rules];
        this.cdr.markForCheck();
      });
    }
    this.rules = [...this.rules];
    this.cdr.markForCheck();
  }

  private loadObjectsFor(rule: AccessRule): void {
    const loader =
      rule.level === 'sequence'
        ? this.ctx.loadSequences(this.datasourceId, rule.schema)
        : this.ctx.loadFunctions(this.datasourceId, rule.schema);
    loader.then(() => {
      this.rules = [...this.rules];
      this.cdr.markForCheck();
    });
  }

  /** Options for the object multiselect — tables OR sequences OR functions. */
  objectsFor(rule: AccessRule): Option[] {
    if (rule.level === 'sequence' || rule.level === 'function') {
      return this.ctx.peekObjects(this.datasourceId, rule.schema, rule.level);
    }
    return this.ctx.peekTables(this.datasourceId, rule.schema);
  }

  columnsFor(rule: AccessRule, table: string): Option[] {
    return this.ctx.peekColumns(this.datasourceId, rule.schema, table);
  }

  loadColumnsFor(rule: AccessRule, table: string): void {
    if (!table) return;
    this.ctx.loadColumns(this.datasourceId, rule.schema, table).then(() => {
      this.rules = [...this.rules];
      this.cdr.markForCheck();
    });
  }

  /** Column-level table select is single (fix #7) — coerce to one value. */
  onTablesChange(rule: AccessRule): void {
    if (rule.level === 'column' && rule.tables.length > 1) {
      rule.tables = [rule.tables[rule.tables.length - 1]];
      this.ruleHints[rule.id] = this.translate.instant('DB_ACCESS.COLUMN_LEVEL_SINGLE_TABLE');
    }
    // Prune columns of tables no longer selected (fix #12).
    const keep = new Set(rule.tables);
    Object.keys(rule.columnsByTable).forEach(t => {
      if (!keep.has(t)) delete rule.columnsByTable[t];
    });
    // Prefetch columns for a column-level single table.
    if (rule.level === 'column' && rule.tables[0]) {
      this.loadColumnsFor(rule, rule.tables[0]);
    }
    this.rules = [...this.rules];
    this.cdr.markForCheck();
  }

  togglePriv(rule: AccessRule, priv: string): void {
    rule.privileges = rule.privileges.includes(priv)
      ? rule.privileges.filter(p => p !== priv)
      : [...rule.privileges, priv];
    this.rules = [...this.rules];
    this.cdr.markForCheck();
  }

  onActionChange(): void {
    this.rules = [...this.rules];
    this.cdr.markForCheck();
  }

  isColumnSingle(rule: AccessRule): boolean {
    return rule.level === 'column';
  }

  usesObjects(rule: AccessRule): boolean {
    return rule.level === 'table' || rule.level === 'column' ||
      rule.level === 'sequence' || rule.level === 'function';
  }

  ruleValid(rule: AccessRule): boolean {
    if (!rule.schema || !rule.grantee || !rule.privileges.length) return false;
    if (rule.level === 'table' && !rule.allTables && !rule.tables.length) return false;
    if (rule.level === 'column' && !rule.tables.length) return false;
    if ((rule.level === 'sequence' || rule.level === 'function') && !rule.allTables && !rule.tables.length)
      return false;
    return true;
  }

  get anyValidRule(): boolean {
    return this.rules.some(r => this.ruleValid(r));
  }

  get liveSummaries(): string[] {
    return this.rules
      .filter(r => this.ruleValid(r))
      .map(r => describeChange(this.ruleToIntent(r), this.translate));
  }

  private ruleToIntent(rule: AccessRule): ChangeIntent {
    return {
      kind: rule.action,
      privileges: rule.privileges,
      objectType: rule.level,
      schema: rule.schema,
      tables: rule.allTables && rule.level !== 'column' ? [] : rule.tables,
      columns:
        rule.level === 'column' && rule.tables.length
          ? (rule.columnsByTable[rule.tables[0]] ?? [])
          : undefined,
      grantee: rule.grantee,
      withGrantOption: rule.withGrantOption,
    };
  }

  /**
   * Map a composed AccessRule into the structured intent applyChangeSet
   * expects (1:1 with pgSqlBuilder). A column-level rule targets one table;
   * "all objects in schema" → object.allInSchema; else one stmt per object.
   */
  private ruleToStatements(rule: AccessRule): any[] {
    const roleKey = rule.action === 'grant' ? 'toRole' : 'fromRole';
    const base: any = { kind: rule.action, privileges: rule.privileges, [roleKey]: rule.grantee };
    if (rule.action === 'grant' && rule.withGrantOption) base.withGrantOption = true;
    if (rule.action === 'revoke') base.behavior = 'RESTRICT';

    if (rule.level === 'schema') {
      return [{ ...base, objType: 'SCHEMA', object: { parts: [rule.schema] } }];
    }

    if (rule.level === 'column') {
      const table = rule.tables[0];
      return [
        {
          ...base,
          objType: 'TABLE',
          object: {
            parts: [rule.schema, table],
            columns: rule.privileges.map(p => ({
              privilege: p,
              columns: rule.columnsByTable[table] ?? [],
            })),
          },
        },
      ];
    }

    const objType = rule.level.toUpperCase(); // TABLE | SEQUENCE | FUNCTION
    if (rule.allTables) {
      return [{ ...base, objType, object: { allInSchema: rule.schema } }];
    }
    return rule.tables.map(name => ({ ...base, objType, object: { parts: [rule.schema, name] } }));
  }

  // ── Apply (fix #9 — was a no-op; now POSTs to /change-set) ──────────────

  applyChanges(): void {
    const valid = this.rules.filter(r => this.ruleValid(r));
    if (!valid.length) return;
    this.pendingStatements = valid.flatMap(r => this.ruleToStatements(r));
    this.summaries = valid.map(r => describeChange(this.ruleToIntent(r), this.translate));
    this.confirmDestructive = valid.some(r => r.action === 'revoke');
    this.openConfirm();
  }

  private openConfirm(): void {
    this.showConfirm = true;
    this.confirmLoading = true;
    this.cdr.markForCheck();
    // Dry-run validate (previewOnly) — surface success only, never SQL.
    this.dbAccess
      .applyChangeSet(this.datasourceId, { statements: this.pendingStatements, previewOnly: true })
      .then(res => {
        if (!res?.status) {
          this.globalService.handleSuccessService(res);
          this.showConfirm = false;
        }
      })
      .catch(() => (this.showConfirm = false))
      .finally(() => {
        this.confirmLoading = false;
        this.cdr.markForCheck();
      });
  }

  confirmApply(): void {
    this.dbAccess
      .applyChangeSet(this.datasourceId, { statements: this.pendingStatements, confirm: true })
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showConfirm = false;
          // Reset to a single fresh rule + refresh defaults / effective.
          this.rules = [];
          this.ruleSeq = 0;
          this.ruleHints = {};
          this.addRule();
          this.loadDefaults();
          if (this.filterRole) this.loadEffective(this.filterRole);
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  cancelConfirm(): void {
    this.showConfirm = false;
    this.pendingStatements = [];
  }

  // ── Role filter → effective privileges (fix #4) ─────────────────────────

  onFilterRoleChange(role: any): void {
    this.filterRole = role || '';
    if (!this.filterRole) {
      this.effectiveRows = [];
      this.cdr.markForCheck();
      return;
    }
    this.loadEffective(this.filterRole);
  }

  private loadEffective(role: string): void {
    this.effectiveLoading = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadEffective(this.datasourceId, role)
      .then(res => (this.effectiveRows = res?.status ? (res.data ?? []) : []))
      .catch(() => (this.effectiveRows = []))
      .finally(() => {
        this.effectiveLoading = false;
        this.cdr.markForCheck();
      });
  }

  effectiveObject(row: any): string {
    const schema = row.schema ? row.schema + '.' : '';
    return schema + (row.object || row.table || row.name || '');
  }
}
