import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/** PostgreSQL privilege sets per object level. */
const TABLE_PRIVS = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
];
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
  private host: ElementRef<HTMLElement> = inject(ElementRef);

  /**
   * Embedded in the Privileges hub — hide this component's own page header
   * (title + all the section-nav buttons + the Apply button), its own
   * datasource-picker toolbar row, and the internal Compose/Effective
   * segmented control. The hub owns those; the datasource comes from the
   * shared context (DbAccessContextService.datasourceChanged$).
   */
  @Input() embedded = false;
  /**
   * Force which single sub-view this instance shows when embedded. The hub
   * mounts two instances — one `compose`, one `effective` — so each tab gets
   * full width and only the Compose instance carries the change-summary
   * dialog + Apply. `null` (standalone) keeps the internal segmented toggle.
   */
  @Input() mode: 'compose' | 'effective' | null = null;

  private dsSub?: Subscription;

  /** Rule id to flash after it's added (drives a transient highlight class). */
  highlightId: number | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;
  capability = this.ctx.capability;
  capabilityLoading = this.ctx.capabilityLoading;
  unsupported = this.ctx.unsupported;

  datasourceId = '';

  /** Active tab: the rule composer (write) vs the effective-privileges
   *  inspector (read-only). Split so each gets full width. */
  activeTab: 'compose' | 'effective' = 'compose';

  schemaOptions: Option[] = [];
  roleOptions: Option[] = [];
  levelOptions: { label: string; value: Level }[] = [];
  defaultPrivileges: any[] = [];

  rules: AccessRule[] = [];
  private ruleSeq = 0;

  // Per-rule hints (e.g. column-level pruned tables to a single table).
  ruleHints: Record<number, string> = {};

  // ── Role picker → effective privileges (unified app-privilege-tree) ──
  // The picked role feeds <app-privilege-tree>, which server-lazy-loads the
  // schema → table → privilege tree with the Direct/Inherited/All split and
  // system-schema toggle. No client-side grouping/filtering here anymore.
  filterRole: string | null = null;

  // ── Review-SQL confirm gate ─────────────────────────────────────────────
  showConfirm = false;
  confirmLoading = false;
  summaries: string[] = [];
  /** Exact SQL + danger per statement, from the BE preview. */
  confirmStatements: any[] = [];
  confirmDestructive = false;
  /** Typed-confirm phrase for a critical change-set (else null). */
  confirmPhrase: string | null = null;
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

  // ── Intent-first (guided) compose ───────────────────────────────────────
  // Default mode is a WHO → WHAT → WHERE guided flow that drives a SINGLE
  // AccessRule (rules[0]); "Advanced" reveals the full multi-rule card
  // repeater. Both feed the SAME applyChanges() preview→execute pipeline, so
  // the guided flow is pure UX sugar over the existing change-set machinery.
  composeMode: 'guided' | 'advanced' = 'guided';

  /** Grant presets → the privilege set they expand to (table level). */
  readonly PRESETS: { key: string; labelKey: string; descKey: string; privileges: string[] }[] =
    [
      {
        key: 'read',
        labelKey: 'DB_ACCESS.PRESET_READ',
        descKey: 'DB_ACCESS.PRESET_READ_DESC',
        privileges: ['SELECT'],
      },
      {
        key: 'readwrite',
        labelKey: 'DB_ACCESS.PRESET_RW',
        descKey: 'DB_ACCESS.PRESET_RW_DESC',
        privileges: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      },
      {
        key: 'custom',
        labelKey: 'DB_ACCESS.PRESET_CUSTOM',
        descKey: 'DB_ACCESS.PRESET_CUSTOM_DESC',
        privileges: [],
      },
    ];
  /** Which preset the user picked in guided mode ('' until chosen). */
  guidedPreset = '';

  // ── Reflect current state (diff-apply) ──────────────────────────────────
  // When a grantee + schema is chosen, we load the role's CURRENT direct
  // grants so the guided privilege picker starts pre-selected with what the
  // role already has — you edit against reality, and Apply sends only the
  // GRANT/REVOKE delta. `currentPrivs` is the set of privileges the grantee
  // already holds across the chosen scope (union of table grants in-schema).
  currentPrivs = new Set<string>();
  loadingCurrent = false;
  /** True once we've loaded current grants for the active grantee+schema. */
  private currentLoadedFor = '';

  /** The single rule guided mode manipulates (always rules[0]). */
  get primaryRule(): AccessRule | null {
    return this.rules[0] ?? null;
  }

  setComposeMode(mode: 'guided' | 'advanced'): void {
    if (mode === this.composeMode) return;
    this.composeMode = mode;
    // Switching modes clears the previous form entirely — Guided and Advanced
    // build the rule set differently, and carrying half-filled state across is
    // confusing. Reset to a single blank rule + clear guided selections so the
    // user starts fresh (and Apply is re-gated to invalid).
    this.rules = [this.blankRule()];
    this.guidedPreset = '';
    this.currentPrivs = new Set<string>();
    this.currentLoadedFor = '';
    this.cdr.markForCheck();
  }

  /** A fresh, empty access rule (grant on all tables in a schema, no privs). */
  private blankRule(): AccessRule {
    return {
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
    };
  }

  /** Apply a preset: set the primary rule's privileges to the preset's set. */
  setPreset(key: string): void {
    const preset = this.PRESETS.find(p => p.key === key);
    const rule = this.primaryRule;
    if (!preset || !rule) return;
    this.guidedPreset = key;
    if (key !== 'custom') {
      rule.privileges = [...preset.privileges];
    } else if (!rule.privileges.length) {
      rule.privileges = [];
    }
    rule.level = 'table';
    this.rules = [...this.rules]; // immutable nudge → OnPush + Apply gating
    this.cdr.markForCheck();
  }

  /** Toggle one privilege in the guided "Custom" grid. */
  toggleGuidedPriv(priv: string): void {
    const rule = this.primaryRule;
    if (!rule) return;
    rule.privileges = rule.privileges.includes(priv)
      ? rule.privileges.filter(p => p !== priv)
      : [...rule.privileges, priv];
    this.guidedPreset = 'custom';
    this.rules = [...this.rules];
    this.cdr.markForCheck();
  }

  /** Set who the guided grant is for. */
  setGuidedGrantee(grantee: string): void {
    const rule = this.primaryRule;
    if (!rule) return;
    rule.grantee = grantee ?? '';
    this.rules = [...this.rules];
    this.reflectCurrentState();
    this.cdr.markForCheck();
  }

  /** Set the guided target schema (delegates to the existing reconcile). */
  setGuidedSchema(schema: string): void {
    const rule = this.primaryRule;
    if (!rule) return;
    rule.schema = schema ?? '';
    this.onSchemaChange(rule);
    this.reflectCurrentState();
  }

  /**
   * Load the grantee's CURRENT direct grants for the chosen schema and
   * pre-select the privileges it already holds — so the guided picker reflects
   * reality (diff-apply). Only runs when both grantee + schema are set; keyed
   * so it doesn't re-fetch for the same pair.
   */
  private reflectCurrentState(): void {
    const rule = this.primaryRule;
    if (!rule || !rule.grantee || !rule.schema || !this.datasourceId) {
      this.currentPrivs = new Set();
      this.currentLoadedFor = '';
      return;
    }
    const key = `${rule.grantee}::${rule.schema}`;
    if (key === this.currentLoadedFor) return;
    this.currentLoadedFor = key;
    this.loadingCurrent = true;
    this.currentPrivs = new Set();
    this.cdr.markForCheck();
    this.dbAccess
      .loadRoleGrants(this.datasourceId, rule.grantee)
      .then(res => {
        const grants: any[] = res?.status ? (res.data ?? []) : [];
        const inSchema = grants.filter(g => g.schema === rule.schema);
        this.currentPrivs = new Set(
          inSchema.map(g => String(g.privilege).toUpperCase()),
        );
        // Pre-select what they already have (only if the user hasn't started
        // a custom edit yet), so the picker opens reflecting current state.
        if (!this.guidedPreset && this.currentPrivs.size) {
          rule.privileges = [...this.currentPrivs];
          this.guidedPreset = 'custom';
          this.rules = [...this.rules];
        }
      })
      .catch(() => (this.currentPrivs = new Set()))
      .finally(() => {
        this.loadingCurrent = false;
        this.cdr.markForCheck();
      });
  }

  /** Does the grantee already hold this privilege on the chosen scope? */
  alreadyHas(priv: string): boolean {
    return this.currentPrivs.has(priv);
  }

  /** All-tables vs specific-tables in guided mode. */
  setGuidedAllTables(all: boolean): void {
    const rule = this.primaryRule;
    if (!rule) return;
    rule.allTables = all;
    this.onAllTablesChange(rule);
  }

  /** Open the live Active Sessions viewer, carrying the selected datasource. */
  goToSessions(): void {
    this.router.navigate(['/app/db-privileges/sessions'], {
      queryParams: this.datasourceId ? { ds: this.datasourceId } : {},
    });
  }

  /** Open the role/privilege templates manage screen (PDM D10). */
  goToTemplates(): void {
    this.router.navigate([DB_ACCESS.TEMPLATES_LIST]);
  }

  ngOnInit(): void {
    // Embedded: this instance is locked to a single sub-view (the hub renders
    // one per tab) and takes its datasource from the shared context.
    if (this.mode) this.activeTab = this.mode;
    if (this.embedded) {
      // Hydrate any datasource already chosen (cross-section nav / the hub's
      // shared picker), then react to future changes from the hub picker.
      const initial = this.ctx.datasourceId() || '';
      if (initial) this.onDatasourceChange(initial);
      this.dsSub = this.ctx.datasourceChanged$.subscribe(id =>
        this.onDatasourceChange(id || ''),
      );
    }

    this.levelOptions = [
      {
        label: this.translate.instant('DB_ACCESS.LEVEL_TABLE'),
        value: 'table',
      },
      {
        label: this.translate.instant('DB_ACCESS.LEVEL_COLUMN'),
        value: 'column',
      },
      {
        label: this.translate.instant('DB_ACCESS.LEVEL_SCHEMA'),
        value: 'schema',
      },
      {
        label: this.translate.instant('DB_ACCESS.LEVEL_SEQUENCE'),
        value: 'sequence',
      },
      {
        label: this.translate.instant('DB_ACCESS.LEVEL_FUNCTION'),
        value: 'function',
      },
    ];
  }

  ngOnDestroy(): void {
    this.dbAccess.cancelReads();
    this.dsSub?.unsubscribe();
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
    this.guidedPreset = '';
    this.currentPrivs = new Set();
    this.currentLoadedFor = '';
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
        this.roleOptions = (this.dbAccess.roles() ?? []).map(r => ({
          label: r.name,
          value: r.name,
        }));
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  private loadDefaults(): void {
    this.dbAccess
      .loadDefaultPrivileges(this.datasourceId)
      .then(res => {
        // BE returns ready-to-render rows { scope, grantee, privileges[] },
        // exploded from pg_default_acl and ORDER BY'd (scope, object_type,
        // grantee) entirely in SQL — no FE parsing or sorting.
        this.defaultPrivileges = res?.status ? (res.data ?? []) : [];
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  // ── Rule repeater (immutable updates + markForCheck; fix #9) ────────────

  trackByRule = (_: number, rule: AccessRule): number => rule.id;

  addRule(): void {
    const rule = this.blankRule();
    this.rules = [...this.rules, rule];
    this.cdr.markForCheck();
    this.revealRule(rule.id);
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
    const stillUsed = this.rules.some(
      r => r.id !== rule.id && r.schema === rule.schema,
    );
    if (rule.schema && !stillUsed) {
      this.ctx.invalidateSchema(this.datasourceId, rule.schema);
    }
    delete this.ruleHints[rule.id];
    this.rules = this.rules.filter(r => r.id !== rule.id);
    this.cdr.markForCheck();
  }

  privsFor(level: Level): string[] {
    switch (level) {
      case 'column':
        return COLUMN_PRIVS;
      case 'schema':
        return SCHEMA_PRIVS;
      case 'sequence':
        return SEQUENCE_PRIVS;
      case 'function':
        return FUNCTION_PRIVS;
      case 'table':
      default:
        return TABLE_PRIVS;
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
        this.ruleHints[rule.id] = this.translate.instant(
          'DB_ACCESS.COLUMN_LEVEL_SINGLE_TABLE',
        );
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
    return (
      rule.level === 'table' ||
      rule.level === 'column' ||
      rule.level === 'sequence' ||
      rule.level === 'function'
    );
  }

  /** i18n key for the "All <objects> in schema" toggle — level-aware so a
   *  Sequence rule reads "All sequences in schema", not "All tables…". */
  allObjectsLabelKey(rule: AccessRule): string {
    switch (rule.level) {
      case 'sequence':
        return 'DB_ACCESS.ALL_SEQUENCES';
      case 'function':
        return 'DB_ACCESS.ALL_FUNCTIONS';
      default:
        return 'DB_ACCESS.ALL_TABLES';
    }
  }

  /** i18n key for the object-multiselect field label, by level. */
  objectsLabelKey(rule: AccessRule): string {
    switch (rule.level) {
      case 'column':
        return 'DB_ACCESS.TABLE'; // column level targets one table
      case 'sequence':
        return 'DB_ACCESS.SEQUENCES';
      case 'function':
        return 'DB_ACCESS.FUNCTIONS';
      default:
        return 'DB_ACCESS.TABLES';
    }
  }

  /** i18n key for the object-multiselect placeholder, by level. */
  objectsPlaceholderKey(rule: AccessRule): string {
    switch (rule.level) {
      case 'sequence':
        return 'DB_ACCESS.SELECT_SEQUENCES';
      case 'function':
        return 'DB_ACCESS.SELECT_FUNCTIONS';
      default:
        return 'DB_ACCESS.SELECT_TABLES';
    }
  }

  ruleValid(rule: AccessRule): boolean {
    if (!rule.schema || !rule.grantee || !rule.privileges.length) return false;
    if (rule.level === 'table' && !rule.allTables && !rule.tables.length)
      return false;
    if (rule.level === 'column' && !rule.tables.length) return false;
    if (
      (rule.level === 'sequence' || rule.level === 'function') &&
      !rule.allTables &&
      !rule.tables.length
    )
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
    const base: any = {
      kind: rule.action,
      privileges: rule.privileges,
      [roleKey]: rule.grantee,
    };
    if (rule.action === 'grant' && rule.withGrantOption)
      base.withGrantOption = true;
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
    return rule.tables.map(name => ({
      ...base,
      objType,
      object: { parts: [rule.schema, name] },
    }));
  }

  // ── Apply (fix #9 — was a no-op; now POSTs to /change-set) ──────────────

  applyChanges(): void {
    // Effective is read-only — never previews/executes. And a preview already
    // open (or a save in flight) blocks a second open, so one click = one
    // dialog even if the trigger fires twice.
    if (this.activeTab !== 'compose' || this.showConfirm || this.saving())
      return;
    const valid = this.rules.filter(r => this.ruleValid(r));
    if (!valid.length) return;
    this.pendingStatements = valid.flatMap(r => this.ruleToStatements(r));
    this.summaries = valid.map(r =>
      describeChange(this.ruleToIntent(r), this.translate),
    );
    this.confirmDestructive = valid.some(r => r.action === 'revoke');
    this.openConfirm();
  }

  private openConfirm(): void {
    this.showConfirm = true;
    this.confirmLoading = true;
    this.confirmStatements = [];
    this.confirmPhrase = null;
    this.cdr.markForCheck();
    // Dry-run (previewOnly) → the exact SQL + danger classification the
    // Review-SQL dialog renders.
    this.dbAccess
      .applyChangeSet(this.datasourceId, {
        statements: this.pendingStatements,
        previewOnly: true,
      })
      .then(res => {
        if (!res?.status) {
          this.globalService.handleSuccessService(res);
          this.showConfirm = false;
          return;
        }
        const data = res.data ?? {};
        this.confirmStatements = data.statements ?? [];
        if (Array.isArray(data.summary) && data.summary.length) {
          this.summaries = data.summary;
        }
        this.confirmDestructive = !!data.isDestructive;
        this.confirmPhrase =
          data.requiresTypedConfirm && data.confirmPhrase
            ? data.confirmPhrase
            : null;
      })
      .catch(() => (this.showConfirm = false))
      .finally(() => {
        this.confirmLoading = false;
        this.cdr.markForCheck();
      });
  }

  confirmApply(confirmPhrase: string): void {
    this.dbAccess
      .applyChangeSet(this.datasourceId, {
        statements: this.pendingStatements,
        confirm: true,
        confirmPhrase,
      })
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showConfirm = false;
          // Reset to a single fresh rule + refresh defaults / effective.
          this.rules = [];
          this.ruleSeq = 0;
          this.ruleHints = {};
          this.addRule();
          this.loadDefaults();
          // effective tree re-reads itself via its @Input when filterRole set
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  cancelConfirm(): void {
    this.showConfirm = false;
    this.pendingStatements = [];
  }

  // ── Role picker → effective privileges (unified tree) ───────────────────

  /**
   * Just record the picked role; <app-privilege-tree> does the rest
   * (server-lazy schema→table→privilege tree, Direct/Inherited/All split,
   * system-schema toggle). Null when cleared so PrimeNG hides its ✕ icon.
   */
  onFilterRoleChange(role: any): void {
    this.filterRole = role ?? null;
    this.cdr.markForCheck();
  }
}
