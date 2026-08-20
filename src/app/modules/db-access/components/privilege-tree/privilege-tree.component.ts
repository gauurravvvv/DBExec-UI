import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostBinding,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  inject,
} from '@angular/core';
import { DbAccessService } from '../../services/db-access.service';
import {
  LazyTreeLoadContext,
  LazyTreeNode,
} from 'src/app/shared/components/lazy-tree/lazy-tree.component';

/**
 * PrivilegeTreeComponent — a role's EFFECTIVE privileges as a lazy tree
 * (schema → table → privilege chips) with `direct` / `via <role>` provenance,
 * a Direct/Inherited/All split, and a hide-system-schemas toggle.
 *
 * This is now a THIN domain wrapper over the generic `app-lazy-tree`: it owns
 * the summary header + the provenance/system controls, and hands the tree a
 * `loadNodes` function that maps the generic level/parent/page/search contract
 * onto the db-access effective-tree endpoints. All fetching stays server-lazy.
 */
@Component({
  selector: 'app-privilege-tree',
  templateUrl: './privilege-tree.component.html',
  styleUrls: ['./privilege-tree.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivilegeTreeComponent implements OnInit, OnChanges {
  private cdr = inject(ChangeDetectorRef);
  private dbAccess = inject(DbAccessService);

  @Input({ required: true }) connectorId = '';
  @Input({ required: true }) roleName = '';
  /**
   * Tree scroll height. Empty by default → the shared app-lazy-tree SCSS owns
   * the responsive default (clamp, scrolls internally). Pass a number/px to
   * override, or `'none'` to let an ancestor scroll. Ignored when `fill` set.
   */
  @Input() maxHeight: string | number = '';

  /**
   * Fill mode — the tree flexes to fill its (bounded flex-column) parent, so
   * the tree body takes the remaining height on every screen. Use on full-page
   * placements (role detail). Forwarded to app-lazy-tree.
   */
  @Input() fill = false;

  /** Host class so the wrapper flexes to fill its parent in fill mode. */
  @HostBinding('class.pt-fill') get isFill(): boolean {
    return this.fill;
  }

  private readonly PAGE_SIZE = 100;

  /** Provenance split: 'all' (default) | 'direct' | 'inherited'. */
  provenance: 'all' | 'direct' | 'inherited' = 'all';
  /** Hide information_schema/pg_catalog by default; toggle to reveal. */
  includeSystem = false;

  /** Params forwarded to <app-lazy-tree>; changing the object triggers reload. */
  treeParams: Record<string, unknown> = { provenance: 'all', includeSystem: false };

  /** Header counts (direct vs inherited, object totals, system-schema count). */
  summary: {
    objects: number;
    privileges: number;
    directObjects: number;
    inheritedObjects: number;
    schemas: number;
    systemObjects: number;
    topSource: string | null;
  } | null = null;

  ngOnInit(): void {
    this.syncParams();
    this.loadSummary();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['roleName'] && !changes['roleName'].firstChange) ||
      (changes['connectorId'] && !changes['connectorId'].firstChange)
    ) {
      this.provenance = 'all';
      this.includeSystem = false;
      this.summary = null;
      this.syncParams();
      this.loadSummary();
    }
  }

  /** New object identity each time so app-lazy-tree's ngOnChanges reloads. */
  private syncParams(): void {
    this.treeParams = {
      provenance: this.provenance,
      includeSystem: this.includeSystem,
      // role/datasource are closed over by loadNodes, but including them here
      // guarantees a params change (→ tree reload) when the host swaps role.
      role: this.roleName,
      ds: this.connectorId,
    };
  }

  /** The generic tree's data source — maps level/parent → db-access endpoints. */
  loadNodes = async (
    ctx: LazyTreeLoadContext,
  ): Promise<{ nodes: LazyTreeNode[]; total: number }> => {
    if (!this.connectorId || !this.roleName) return { nodes: [], total: 0 };

    // level 0 → schema roots
    if (ctx.level === 0) {
      const res = await this.dbAccess.loadEffectiveTree(
        this.connectorId,
        this.roleName,
        {
          level: 'schema',
          page: ctx.page,
          limit: ctx.limit,
          search: ctx.search || undefined,
          provenance: this.provenance,
          includeSystem: this.includeSystem,
        },
      );
      const nodes = (res?.status ? (res.data?.nodes ?? []) : []).map(
        (n: any) => this.schemaNode(n),
      );
      return { nodes, total: res?.data?.count ?? nodes.length };
    }

    // level 1 → tables in a schema (parent = schema node)
    if (ctx.level === 1 && ctx.parent) {
      const res = await this.dbAccess.loadEffectiveTree(
        this.connectorId,
        this.roleName,
        {
          level: 'table',
          schema: ctx.parent.id,
          page: ctx.page,
          limit: ctx.limit,
          search: ctx.search || undefined,
          provenance: this.provenance,
          includeSystem: this.includeSystem,
        },
      );
      const schema = ctx.parent.id;
      const nodes = (res?.status ? (res.data?.nodes ?? []) : []).map((n: any) =>
        this.tableNode(schema, n),
      );
      return { nodes, total: res?.data?.count ?? nodes.length };
    }

    // level 2 → a table's privilege chips (parent = table leaf node)
    if (ctx.level === 2 && ctx.parent) {
      const { schema, table } = ctx.parent.data ?? {};
      const res = await this.dbAccess.loadEffectiveTree(
        this.connectorId,
        this.roleName,
        {
          level: 'table',
          schema,
          table,
          provenance: this.provenance,
        },
      );
      const privileges = res?.status
        ? (res.data?.nodes?.[0]?.privileges ?? [])
        : [];
      // Return a single synthetic node carrying the privilege list as data;
      // app-lazy-tree stashes node.data.leaf for the leaf template.
      return {
        nodes: [{ id: `${schema}.${table}`, label: table, data: { privileges } }],
        total: privileges.length,
      };
    }

    return { nodes: [], total: 0 };
  };

  private schemaNode(n: any): LazyTreeNode {
    return {
      id: n.id,
      label: n.label,
      count: n.count ?? 0,
      hasChildren: !!n.hasChildren,
      isLeaf: false,
      data: { schema: n.id },
    };
  }

  private tableNode(schema: string, n: any): LazyTreeNode {
    return {
      id: n.id,
      label: n.label,
      count: n.count ?? 0,
      hasChildren: true,
      isLeaf: true, // its "children" are privilege chips (leaf template)
      data: { schema, table: n.label },
    };
  }

  setProvenance(p: 'all' | 'direct' | 'inherited'): void {
    if (this.provenance === p) return;
    this.provenance = p;
    this.syncParams();
    this.cdr.markForCheck();
  }

  toggleSystem(): void {
    this.includeSystem = !this.includeSystem;
    this.syncParams();
    this.cdr.markForCheck();
  }

  private loadSummary(): void {
    if (!this.connectorId || !this.roleName) return;
    this.dbAccess
      .loadEffectiveSummary(this.connectorId, this.roleName)
      .then(res => {
        this.summary = res?.status ? (res.data ?? null) : null;
      })
      .catch(() => (this.summary = null))
      .finally(() => this.cdr.markForCheck());
  }

  /** Provenance chip tone for a leaf privilege. */
  viaTone(via: string): 'primary' | 'neutral' {
    return via === 'direct' ? 'primary' : 'neutral';
  }

  trackByPriv = (
    _: number,
    p: { privilege: string; via: string },
  ): string => p.privilege + '|' + p.via;
}
