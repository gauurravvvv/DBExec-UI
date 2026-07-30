/**
 * QueryBuilderStore — normalized signal store for the runtime condition tree.
 *
 * The tree is stored as a flat Map<id, node> plus a rootId, not a nested
 * FormArray: recursive reactive forms are painful to mutate, validate and undo.
 * A normalized store makes undo/redo a bounded snapshot array and node updates
 * an O(1) map write.
 *
 * Provided per-component (in the runtime page's providers), so each open form
 * gets its own tree.
 */
import { Injectable, computed, signal } from '@angular/core';
import { QbSchemaResponse, QbTreeError } from './qb-runtime.service';

export type Op = 'AND' | 'OR';
export type Arity = 'none' | 'one' | 'two' | 'many';

export interface StoreConditionNode {
  kind: 'condition';
  id: string;
  promptId: string;
  operatorCode: string;
  negate: boolean;
  values: any[];
}

export interface StoreGroupNode {
  kind: 'group';
  id: string;
  op: Op;
  negate: boolean;
  childIds: string[];
}

export type StoreNode = StoreConditionNode | StoreGroupNode;

export interface SelectItem {
  promptId: string;
  alias?: string;
}
export interface SortItem {
  promptId: string;
  dir: 'ASC' | 'DESC';
  nulls: 'FIRST' | 'LAST';
}

interface Snapshot {
  nodes: Record<string, StoreNode>;
  rootId: string;
  select: SelectItem[];
  sort: SortItem[];
  limit: number;
}

let idSeq = 0;
function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

@Injectable()
export class QueryBuilderStore {
  private nodes = signal<Map<string, StoreNode>>(new Map());
  private rootId = signal<string>('');

  readonly select = signal<SelectItem[]>([]);
  readonly sort = signal<SortItem[]>([]);
  readonly limit = signal<number>(1000);
  readonly schema = signal<QbSchemaResponse | null>(null);
  readonly serverErrors = signal<QbTreeError[]>([]);

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private readonly MAX_HISTORY = 100;

  readonly canUndo = signal<boolean>(false);
  readonly canRedo = signal<boolean>(false);

  /** The root group node, or null before hydration. */
  readonly root = computed(() => {
    const id = this.rootId();
    return id ? (this.nodes().get(id) as StoreGroupNode | undefined) ?? null : null;
  });

  /** Reactive accessor for one node. */
  nodeById(id: string) {
    return computed(() => this.nodes().get(id) ?? null);
  }

  groupById(id: string) {
    return computed(
      () => this.nodes().get(id) as StoreGroupNode | undefined ?? null,
    );
  }

  conditionById(id: string) {
    return computed(
      () => this.nodes().get(id) as StoreConditionNode | undefined ?? null,
    );
  }

  errorsForNode(id: string) {
    return computed(() => this.serverErrors().filter(e => e.nodeId === id));
  }

  /** Operator metadata for a prompt + code, from the hydrated schema. */
  operatorMeta(promptId: string, code: string): { arity: Arity } {
    const p = this.schema()
      ?.groups.flatMap(g => g.prompts)
      .find(x => x.promptId === promptId);
    const op = p?.operators.find(o => o.code === code);
    return { arity: (op?.arity as Arity) ?? 'one' };
  }

  // ── Hydration ──────────────────────────────────────────────────────

  hydrate(schema: QbSchemaResponse): void {
    this.schema.set(schema);
    this.limit.set(schema.queryBuilder.defaultLimit ?? 1000);

    const map = new Map<string, StoreNode>();
    let rootId: string;

    if (schema.defaultConditionTree) {
      rootId = this.importTree(schema.defaultConditionTree, map);
    } else {
      const root: StoreGroupNode = {
        kind: 'group',
        id: newId('g'),
        op: 'AND',
        negate: false,
        childIds: [],
      };
      map.set(root.id, root);
      rootId = root.id;
    }

    this.nodes.set(map);
    this.rootId.set(rootId);
    this.undoStack = [];
    this.redoStack = [];
    this.refreshHistoryFlags();
  }

  /** Import a server tree (childIds shape) into the normalized map. */
  private importTree(node: any, map: Map<string, StoreNode>): string {
    if (node.kind === 'group') {
      const g: StoreGroupNode = {
        kind: 'group',
        id: node.id || newId('g'),
        op: node.op,
        negate: !!node.negate,
        childIds: (node.children ?? []).map((c: any) => this.importTree(c, map)),
      };
      map.set(g.id, g);
      return g.id;
    }
    const values = node.rhs?.kind === 'literal' ? node.rhs.values : node.values ?? [];
    const c: StoreConditionNode = {
      kind: 'condition',
      id: node.id || newId('c'),
      promptId: node.promptId,
      operatorCode: node.operatorCode,
      negate: !!node.negate,
      values: values ?? [],
    };
    map.set(c.id, c);
    return c.id;
  }

  // ── Mutations (each snapshots for undo) ────────────────────────────

  addCondition(groupId: string, promptId?: string): void {
    this.mutate(map => {
      const group = map.get(groupId) as StoreGroupNode;
      if (!group) return;
      const firstPrompt = this.schema()?.groups[0]?.prompts[0];
      const pid = promptId ?? firstPrompt?.promptId ?? '';
      const op = this.schema()
        ?.groups.flatMap(g => g.prompts)
        .find(p => p.promptId === pid)?.operators[0]?.code ?? 'eq';
      const c: StoreConditionNode = {
        kind: 'condition',
        id: newId('c'),
        promptId: pid,
        operatorCode: op,
        negate: false,
        values: [],
      };
      map.set(c.id, c);
      map.set(groupId, { ...group, childIds: [...group.childIds, c.id] });
    });
  }

  addGroup(groupId: string): void {
    this.mutate(map => {
      const group = map.get(groupId) as StoreGroupNode;
      if (!group) return;
      const g: StoreGroupNode = {
        kind: 'group',
        id: newId('g'),
        op: 'AND',
        negate: false,
        childIds: [],
      };
      map.set(g.id, g);
      map.set(groupId, { ...group, childIds: [...group.childIds, g.id] });
    });
  }

  removeNode(parentId: string, nodeId: string): void {
    this.mutate(map => {
      const parent = map.get(parentId) as StoreGroupNode;
      if (parent) {
        map.set(parentId, {
          ...parent,
          childIds: parent.childIds.filter(id => id !== nodeId),
        });
      }
      this.deleteSubtree(nodeId, map);
    });
  }

  private deleteSubtree(id: string, map: Map<string, StoreNode>): void {
    const n = map.get(id);
    if (n?.kind === 'group') n.childIds.forEach(c => this.deleteSubtree(c, map));
    map.delete(id);
  }

  setGroupOp(groupId: string, op: Op): void {
    this.mutate(map => {
      const g = map.get(groupId) as StoreGroupNode;
      if (g) map.set(groupId, { ...g, op });
    });
  }

  setGroupNegate(groupId: string, negate: boolean): void {
    this.mutate(map => {
      const g = map.get(groupId) as StoreGroupNode;
      if (g) map.set(groupId, { ...g, negate });
    });
  }

  setPrompt(nodeId: string, promptId: string): void {
    this.mutate(map => {
      const c = map.get(nodeId) as StoreConditionNode;
      if (!c) return;
      // Reset operator + values for the new prompt.
      const op = this.schema()
        ?.groups.flatMap(g => g.prompts)
        .find(p => p.promptId === promptId)?.operators[0]?.code ?? 'eq';
      map.set(nodeId, { ...c, promptId, operatorCode: op, values: [] });
    });
  }

  /**
   * Change the operator, reconciling values against the new arity so changing
   * a dropdown never silently discards the user's work.
   */
  setOperator(nodeId: string, code: string): void {
    this.mutate(map => {
      const c = map.get(nodeId) as StoreConditionNode;
      if (!c) return;
      const prev = this.operatorMeta(c.promptId, c.operatorCode);
      const next = this.operatorMeta(c.promptId, code);
      let values = c.values;
      if (next.arity === 'none') values = [];
      else if (next.arity === 'one' && prev.arity === 'many') values = values.slice(0, 1);
      else if (next.arity === 'many' && prev.arity === 'one')
        values = values.filter(v => v != null);
      else if (next.arity === 'two') values = [values[0] ?? null, values[1] ?? null];
      map.set(nodeId, { ...c, operatorCode: code, values });
    });
  }

  setValues(nodeId: string, values: any[]): void {
    this.mutate(map => {
      const c = map.get(nodeId) as StoreConditionNode;
      if (c) map.set(nodeId, { ...c, values });
    });
  }

  setConditionNegate(nodeId: string, negate: boolean): void {
    this.mutate(map => {
      const c = map.get(nodeId) as StoreConditionNode;
      if (c) map.set(nodeId, { ...c, negate });
    });
  }

  // ── Undo / redo ────────────────────────────────────────────────────

  private mutate(fn: (map: Map<string, StoreNode>) => void): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    const map = new Map(this.nodes());
    fn(map);
    this.nodes.set(map);
    this.refreshHistoryFlags();
  }

  undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push(this.snapshot());
    this.restore(snap);
    this.refreshHistoryFlags();
  }

  redo(): void {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(this.snapshot());
    this.restore(snap);
    this.refreshHistoryFlags();
  }

  private snapshot(): Snapshot {
    return {
      nodes: Object.fromEntries(this.nodes()),
      rootId: this.rootId(),
      select: [...this.select()],
      sort: [...this.sort()],
      limit: this.limit(),
    };
  }

  private restore(s: Snapshot): void {
    this.nodes.set(new Map(Object.entries(s.nodes)));
    this.rootId.set(s.rootId);
    this.select.set([...s.select]);
    this.sort.set([...s.sort]);
    this.limit.set(s.limit);
  }

  private refreshHistoryFlags(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }

  // ── Serialise to the server tree ───────────────────────────────────

  /** Materialise a group into the server's {kind, children} shape. */
  private materialize(id: string): any {
    const n = this.nodes().get(id);
    if (!n) return null;
    if (n.kind === 'group') {
      return {
        kind: 'group',
        id: n.id,
        op: n.op,
        negate: n.negate,
        children: n.childIds.map(c => this.materialize(c)).filter(Boolean),
      };
    }
    return {
      kind: 'condition',
      id: n.id,
      promptId: n.promptId,
      operatorCode: n.operatorCode,
      negate: n.negate,
      rhs: { kind: 'literal', values: n.values },
    };
  }

  /** The full definition the runtime API accepts. */
  definition(): any {
    const s = this.schema();
    return {
      queryBuilderId: s?.queryBuilder.id,
      treeVersion: 1,
      filter: this.rootId() ? this.materialize(this.rootId()) : null,
      select: this.select(),
      sort: this.sort(),
      distinct: false,
      limit: this.limit(),
      offset: 0,
    };
  }
}
