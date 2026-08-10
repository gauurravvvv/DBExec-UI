import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  inject,
} from '@angular/core';
import { DbAccessService } from '../../services/db-access.service';

/**
 * One node in the effective-privileges tree. Schemas and tables are
 * lazy: their children are fetched on first expand. A table's leaf
 * children are its privilege chips (rendered inline, not as nodes).
 */
interface TreeNode {
  id: string;
  kind: 'schema' | 'table';
  label: string;
  count: number;
  hasChildren: boolean;
  // lazy-load state
  expanded: boolean;
  loading: boolean;
  loaded: boolean;
  children: TreeNode[];
  // leaf privileges (populated for tables on expand)
  privileges: { privilege: string; via: string; grantable: boolean }[];
  // paging for children (schemas: tables; large schemas page in)
  page: number;
  total: number;
}

/**
 * PrivilegeTreeComponent — a lazy-expanding schema → table → privileges
 * tree of a role's EFFECTIVE privileges, with `direct` / `via <role>`
 * provenance (PDM C1). Replaces the flat grid on the role/user detail
 * page that mis-bound `object`/`objectType` and rendered "—".
 *
 * Every level is server-driven: schema roots load on init, a schema's
 * tables load when it is expanded, and a table's privilege chips load
 * when IT is expanded. A search box filters server-side at the current
 * level. Nothing is loaded until the user asks for it, so it scales to
 * large catalogs (PDM: full server lazy-load, including trees).
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

  @Input({ required: true }) datasourceId = '';
  @Input({ required: true }) roleName = '';

  private readonly PAGE_SIZE = 100;

  roots: TreeNode[] = [];
  loading = false;
  loaded = false;
  search = '';

  ngOnInit(): void {
    this.loadRoots();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reload from scratch if the role/datasource changes after init.
    if (
      (changes['roleName'] && !changes['roleName'].firstChange) ||
      (changes['datasourceId'] && !changes['datasourceId'].firstChange)
    ) {
      this.roots = [];
      this.loaded = false;
      this.search = '';
      this.loadRoots();
    }
  }

  /** Server search over the schema roots (app-search-input debounces). */
  onSearchChange(value: string): void {
    this.search = value ?? '';
    this.loadRoots();
  }

  private loadRoots(): void {
    if (!this.datasourceId || !this.roleName) return;
    this.loading = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadEffectiveTree(this.datasourceId, this.roleName, {
        level: 'schema',
        page: 1,
        limit: this.PAGE_SIZE,
        search: this.search || undefined,
      })
      .then(res => {
        const nodes = res?.status ? (res.data?.nodes ?? []) : [];
        this.roots = nodes.map((n: any) => this.toNode(n));
      })
      .catch(() => (this.roots = []))
      .finally(() => {
        this.loading = false;
        this.loaded = true;
        this.cdr.markForCheck();
      });
  }

  private toNode(n: any): TreeNode {
    return {
      id: n.id,
      kind: n.kind,
      label: n.label,
      count: n.count ?? 0,
      hasChildren: !!n.hasChildren,
      expanded: false,
      loading: false,
      loaded: false,
      children: [],
      privileges: n.privileges ?? [],
      page: 1,
      total: 0,
    };
  }

  /** Toggle a schema node — lazy-load its tables on first expand. */
  toggleSchema(node: TreeNode): void {
    node.expanded = !node.expanded;
    if (node.expanded && !node.loaded && !node.loading) {
      this.loadTables(node);
    }
    this.cdr.markForCheck();
  }

  private loadTables(schema: TreeNode): void {
    schema.loading = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadEffectiveTree(this.datasourceId, this.roleName, {
        level: 'table',
        schema: schema.id,
        page: schema.page,
        limit: this.PAGE_SIZE,
      })
      .then(res => {
        const nodes = res?.status ? (res.data?.nodes ?? []) : [];
        schema.children = [
          ...schema.children,
          ...nodes.map((n: any) => this.toNode(n)),
        ];
        schema.total = res?.data?.count ?? schema.children.length;
      })
      .catch(() => {})
      .finally(() => {
        schema.loading = false;
        schema.loaded = true;
        this.cdr.markForCheck();
      });
  }

  /** Load the next page of tables under a schema (scroll/"load more"). */
  loadMoreTables(schema: TreeNode): void {
    schema.page += 1;
    this.loadTables(schema);
  }

  hasMoreTables(schema: TreeNode): boolean {
    return schema.children.length < schema.total;
  }

  /** Toggle a table node — lazy-load its privilege chips on first expand. */
  toggleTable(schemaId: string, table: TreeNode): void {
    table.expanded = !table.expanded;
    if (table.expanded && !table.loaded && !table.loading) {
      this.loadTablePrivileges(schemaId, table);
    }
    this.cdr.markForCheck();
  }

  private loadTablePrivileges(schemaId: string, table: TreeNode): void {
    table.loading = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadEffectiveTree(this.datasourceId, this.roleName, {
        level: 'table',
        schema: schemaId,
        table: table.label,
      })
      .then(res => {
        const nodes = res?.status ? (res.data?.nodes ?? []) : [];
        table.privileges = nodes[0]?.privileges ?? [];
      })
      .catch(() => (table.privileges = []))
      .finally(() => {
        table.loading = false;
        table.loaded = true;
        this.cdr.markForCheck();
      });
  }

  /** Provenance chip tone: direct grants are primary, inherited are neutral. */
  viaTone(via: string): 'primary' | 'neutral' {
    return via === 'direct' ? 'primary' : 'neutral';
  }

  trackById = (_: number, n: TreeNode): string => n.id;
  trackByPriv = (
    _: number,
    p: { privilege: string; via: string },
  ): string => p.privilege + '|' + p.via;
}
