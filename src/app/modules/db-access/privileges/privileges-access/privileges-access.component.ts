import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
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
 * One object's effective privileges, grouped from the flat API rows for the
 * Effective-privileges panel. `sources` lists distinct provenance — 'Direct'
 * for a direct grant, otherwise the role the privilege is inherited through.
 */
interface EffectiveGroup {
  key: string; // "schema.table" — display label + filter target + trackBy id
  privileges: string[]; // sorted, de-duplicated privilege names (full set)
  shown: string[]; // the first N privileges rendered as chips (fits one line)
  extra: number; // count collapsed into the "+N" chip (0 when all shown)
  sources: string[]; // distinct provenance: 'Direct' | '<role>' …
}

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
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  /** Rule id to flash after it's added (drives a transient highlight class). */
  highlightId: number | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

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
  filterRole: string | null = null;
  effectiveLoading = false;
  /** Raw flat rows from the API ({schema, table, privilege, via}). */
  private effectiveRaw: any[] = [];
  /** Rows grouped into one entry per object (schema.table) — the display model. */
  effectiveGroups: EffectiveGroup[] = [];
  /** effectiveGroups narrowed by the object filter box (what the list renders). */
  filteredGroups: EffectiveGroup[] = [];
  /** Substring filter over schema.table. */
  effectiveFilter = '';
  /** Totals for the summary line. */
  effectiveObjectCount = 0;
  effectivePrivCount = 0;

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
    private router: Router,
  ) {}

  get canManage(): boolean {
    return this.ctx.canManage;
  }

  /** Open the live Active Sessions viewer, carrying the selected datasource. */
  goToSessions(): void {
    this.router.navigate(['/app/db-privileges/sessions'], {
      queryParams: this.datasourceId ? { ds: this.datasourceId } : {},
    });
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
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
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
    this.filterRole = null;
    this.resetEffective();
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
    const id = ++this.ruleSeq;
    this.rules = [
      ...this.rules,
      {
        id,
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
    this.revealRule(id);
  }

  /** Scroll the just-added rule into view (within the bounded scroll area)
   *  and flash a transient highlight so the user's eye lands on it. */
  private revealRule(id: number): void {
    this.highlightId = id;
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    // Wait for the *ngFor to render the new card, then scroll + focus it.
    requestAnimationFrame(() => {
      const card = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-rule-id="${id}"]`,
      );
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Clear the highlight after the pulse so re-adding re-triggers it.
      this.highlightTimer = setTimeout(() => {
        this.highlightId = null;
        this.cdr.markForCheck();
      }, 1600);
    });
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

  // ── Control interdependencies ───────────────────────────────────────────
  //
  // The composer's object multiselect (tables / sequences / functions) is a
  // dependent field: whether it's SHOWN and what OPTIONS it has both derive
  // from level + schema + allTables. The single source of truth for "does
  // this rule currently need its object list?" is `needsObjectList` below;
  // every control that can affect that answer (level, schema, allTables,
  // tables) funnels through `reconcileRule`, which normalises the dependent
  // state and lazily loads the right objects. This guarantees the list is
  // populated the instant the field becomes visible — no matter which
  // control the user touched, or in what order — closing the class of bugs
  // where flipping "All tables" off (or picking table-level after schema)
  // left the field empty because nothing had loaded the objects.

  /** True when the object multiselect is rendered for this rule (mirror of
   *  the template's *ngIf: level uses objects, a schema is chosen, and either
   *  we're at column level or "All tables" is off). */
  private needsObjectList(rule: AccessRule): boolean {
    if (!this.usesObjects(rule) || !rule.schema) return false;
    return rule.level === 'column' || !rule.allTables;
  }

  /**
   * Normalise a rule's dependent state after ANY interdependent control
   * changes, then lazily fetch the objects the (now-consistent) rule needs.
   * Always re-emits `rules` after the async load resolves so the freshly
   * loaded options render even though the load was kicked off by an
   * unrelated control. Idempotent — the context cache dedupes fetches.
   */
  private reconcileRule(rule: AccessRule): void {
    // Column level always targets a single table and always shows the picker.
    if (rule.level === 'column') {
      rule.allTables = false;
      if (rule.tables.length > 1) {
        rule.tables = [rule.tables[rule.tables.length - 1]];
        this.ruleHints[rule.id] = this.translate.instant('DB_ACCESS.COLUMN_LEVEL_SINGLE_TABLE');
      } else {
        delete this.ruleHints[rule.id];
      }
    } else {
      delete this.ruleHints[rule.id];
    }

    // Schema level has no object list — clear any leftover selections so a
    // stale table/column can't leak into validity or the serialised change.
    if (rule.level === 'schema') {
      rule.tables = [];
      rule.columnsByTable = {};
      rule.allTables = true;
    }

    // When the object list is hidden (All tables ON at table/sequence/function
    // level), drop the now-invisible selections for the same reason.
    if (!this.needsObjectList(rule) && rule.level !== 'schema') {
      rule.tables = [];
      rule.columnsByTable = {};
    }

    // Prune column selections down to the still-selected tables.
    const keep = new Set(rule.tables);
    Object.keys(rule.columnsByTable).forEach(t => {
      if (!keep.has(t)) delete rule.columnsByTable[t];
    });

    // Lazily load exactly the objects the visible field needs.
    if (this.needsObjectList(rule)) {
      this.loadObjectsFor(rule);
      // Column level: prefetch the columns of its single chosen table.
      if (rule.level === 'column' && rule.tables[0]) {
        this.loadColumnsFor(rule, rule.tables[0]);
      }
    }

    this.rules = [...this.rules];
    this.cdr.markForCheck();
  }

  onLevelChange(rule: AccessRule): void {
    // Prune privileges that don't apply to the new level (fix #12).
    const allowed = this.privsFor(rule.level);
    rule.privileges = rule.privileges.filter(p => allowed.includes(p));
    this.reconcileRule(rule);
  }

  onSchemaChange(rule: AccessRule): void {
    // Switching schema invalidates every object selection under it.
    rule.tables = [];
    rule.columnsByTable = {};
    this.reconcileRule(rule);
  }

  /** "All tables in schema" toggled. Off → load + show the object list;
   *  on → the list hides and its selections are cleared. Both handled by the
   *  central reconcile so the list is never left empty when it appears. */
  onAllTablesChange(rule: AccessRule): void {
    this.reconcileRule(rule);
  }

  /** Fetch the objects a rule's multiselect needs (tables / sequences /
   *  functions by level) and re-emit rules when they arrive. */
  private loadObjectsFor(rule: AccessRule): void {
    if (!rule.schema) return;
    const loader =
      rule.level === 'sequence'
        ? this.ctx.loadSequences(this.datasourceId, rule.schema)
        : rule.level === 'function'
          ? this.ctx.loadFunctions(this.datasourceId, rule.schema)
          : this.ctx.loadTables(this.datasourceId, rule.schema);
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

  /** Object selection changed. Column-level coercion to a single table,
   *  column pruning, and the single-table column prefetch all live in the
   *  central reconcile (fix #7 / #12). */
  onTablesChange(rule: AccessRule): void {
    this.reconcileRule(rule);
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

  /** Apply is allowed only when there is at least one rule AND every rule is
   *  complete — so no half-filled rule is silently skipped on apply. */
  get allRulesValid(): boolean {
    return this.rules.length > 0 && this.rules.every(r => this.ruleValid(r));
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
    // Keep null when cleared (not '') so PrimeNG's p-dropdown treats it as
    // "no value" and hides its clear (✕) icon — an empty string counts as a
    // present value and would leave the ✕ showing after a clear.
    this.filterRole = role ?? null;
    this.effectiveFilter = '';
    if (!this.filterRole) {
      this.resetEffective();
      this.cdr.markForCheck();
      return;
    }
    this.loadEffective(this.filterRole);
  }

  private loadEffective(role: string): void {
    this.effectiveLoading = true;
    this.resetEffective();
    this.cdr.markForCheck();
    this.dbAccess
      .loadEffective(this.datasourceId, role)
      .then(res => {
        this.effectiveRaw = res?.status ? (res.data ?? []) : [];
        this.groupEffective();
      })
      .catch(() => this.resetEffective())
      .finally(() => {
        this.effectiveLoading = false;
        this.cdr.markForCheck();
      });
  }

  /** Clear all effective-privilege display state. */
  private resetEffective(): void {
    this.effectiveRaw = [];
    this.effectiveGroups = [];
    this.filteredGroups = [];
    this.effectiveObjectCount = 0;
    this.effectivePrivCount = 0;
  }

  /**
   * Collapse the flat {schema, table, privilege, via} rows into one entry per
   * object (schema.table): privileges de-duplicated + sorted, provenance
   * de-duplicated ('direct' → 'Direct'). Objects sorted by name. This is what
   * makes the panel scannable — one line per table instead of one per grant.
   */
  private groupEffective(): void {
    const byKey = new Map<string, { privs: Set<string>; sources: Set<string> }>();
    let privCount = 0;
    for (const r of this.effectiveRaw) {
      const table = r.table || r.object || r.name || '';
      const key = (r.schema ? r.schema + '.' : '') + table;
      if (!key) continue;
      let g = byKey.get(key);
      if (!g) {
        g = { privs: new Set<string>(), sources: new Set<string>() };
        byKey.set(key, g);
      }
      const priv = r.privilege || r.priv;
      if (priv && !g.privs.has(priv)) {
        g.privs.add(priv);
        privCount++;
      }
      const via = r.via || 'direct';
      g.sources.add(via === 'direct' ? 'Direct' : via);
    }

    // Chips shown inline per row before collapsing the rest into "+N". Keeps
    // every row a single fixed-height line (required by the virtual scroll).
    const MAX_CHIPS = 6;

    this.effectiveGroups = Array.from(byKey.entries())
      .map(([key, g]) => {
        const privileges = Array.from(g.privs).sort();
        return {
          key,
          privileges,
          shown: privileges.slice(0, MAX_CHIPS),
          extra: Math.max(0, privileges.length - MAX_CHIPS),
          // 'Direct' first, then role names alphabetically.
          sources: Array.from(g.sources).sort((a, b) =>
            a === 'Direct' ? -1 : b === 'Direct' ? 1 : a.localeCompare(b),
          ),
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));

    this.effectiveObjectCount = this.effectiveGroups.length;
    this.effectivePrivCount = privCount;
    this.applyEffectiveFilter();
  }

  /** Narrow the grouped objects by the filter box (substring on schema.table). */
  onEffectiveFilterChange(value: string): void {
    this.effectiveFilter = value ?? '';
    this.applyEffectiveFilter();
    this.cdr.markForCheck();
  }

  private applyEffectiveFilter(): void {
    const q = this.effectiveFilter.trim().toLowerCase();
    this.filteredGroups = q
      ? this.effectiveGroups.filter(g => g.key.toLowerCase().includes(q))
      : this.effectiveGroups;
  }

  /** trackBy for the virtual-scroll list. */
  trackByGroupKey = (_: number, g: EffectiveGroup): string => g.key;
}
