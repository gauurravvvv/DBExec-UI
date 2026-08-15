import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FbAdminService } from '../../services/fb-admin.service';
import { FormBuilderStore } from '../../services/form-builder-store';
import { CreateRuleBody, FbFormRule, RuleAction } from '../../services/fb-types';
import { PersistedAst, PersistedLeaf, PersistedLeafOp } from '../../logic/ruleAst.adapter';
import { validateExpression } from '../../logic/exprEngine';

/** One editable leaf-condition row (persisted-op form). */
interface LeafRow {
  fieldKey: string;
  op: PersistedLeafOp;
  value: string;
}

type FieldOption = { key: string; label: string; dataType: string | null };

/**
 * fb-rule-editor — the single-rule editor. Builds/parses the persisted trigger
 * AST round-trip: one leaf ↔ a bare PersistedLeaf, multiple leaves ↔ a
 * PersistedGroup with a combinator. Any deeper nesting or a `not` group is shown
 * read-only (the "advanced rule" banner) — the builder cannot simplify it, so it
 * is preserved verbatim on save.
 */
@Component({
  selector: 'fb-rule-editor',
  templateUrl: './fb-rule-editor.component.html',
  styleUrls: ['./fb-rule-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbRuleEditorComponent implements OnChanges {
  private readonly admin = inject(FbAdminService);
  readonly store = inject(FormBuilderStore);

  /** The rule to edit, or 'new' for a fresh one. */
  @Input({ required: true }) rule!: FbFormRule | 'new';
  /** Placement keys (+ labels + dataType) for the field/target selects. */
  @Input() fieldKeys: FieldOption[] = [];

  @Output() saved = new EventEmitter<FbFormRule>();
  @Output() cancelled = new EventEmitter<void>();

  // ── Editable model (signals) ──────────────────────────────────────────
  readonly name = signal('');
  readonly combinator = signal<'and' | 'or'>('and');
  readonly leaves = signal<LeafRow[]>([{ fieldKey: '', op: 'eq', value: '' }]);
  readonly action = signal<RuleAction>('show');
  readonly targetKeys = signal<string[]>([]);
  readonly setValueExpr = signal('');
  readonly message = signal('');

  /** Non-null when the persisted trigger is an unsupported/nested AST. */
  readonly advancedAst = signal<PersistedAst | null>(null);
  readonly saving = signal(false);

  readonly combinatorOptions = [
    { label: 'FORM_BUILDER.RULES.COMBINATOR_ALL', value: 'and' },
    { label: 'FORM_BUILDER.RULES.COMBINATOR_ANY', value: 'or' },
  ];
  readonly opOptions = [
    { label: 'FORM_BUILDER.RULES.OP.EQ', value: 'eq' },
    { label: 'FORM_BUILDER.RULES.OP.NE', value: 'ne' },
    { label: 'FORM_BUILDER.RULES.OP.GT', value: 'gt' },
    { label: 'FORM_BUILDER.RULES.OP.GTE', value: 'gte' },
    { label: 'FORM_BUILDER.RULES.OP.LT', value: 'lt' },
    { label: 'FORM_BUILDER.RULES.OP.LTE', value: 'lte' },
    { label: 'FORM_BUILDER.RULES.OP.IN', value: 'in' },
    { label: 'FORM_BUILDER.RULES.OP.NOT_IN', value: 'notIn' },
    { label: 'FORM_BUILDER.RULES.OP.CONTAINS', value: 'contains' },
    { label: 'FORM_BUILDER.RULES.OP.NOT_CONTAINS', value: 'notContains' },
    { label: 'FORM_BUILDER.RULES.OP.IS_EMPTY', value: 'isEmpty' },
    { label: 'FORM_BUILDER.RULES.OP.IS_NOT_EMPTY', value: 'isNotEmpty' },
  ];
  readonly actionOptions = [
    { label: 'FORM_BUILDER.RULES.ACTION.SHOW', value: 'show' },
    { label: 'FORM_BUILDER.RULES.ACTION.HIDE', value: 'hide' },
    { label: 'FORM_BUILDER.RULES.ACTION.ENABLE', value: 'enable' },
    { label: 'FORM_BUILDER.RULES.ACTION.DISABLE', value: 'disable' },
    { label: 'FORM_BUILDER.RULES.ACTION.REQUIRE', value: 'require' },
    { label: 'FORM_BUILDER.RULES.ACTION.OPTIONAL', value: 'optional' },
    { label: 'FORM_BUILDER.RULES.ACTION.SET_VALUE', value: 'set_value' },
    { label: 'FORM_BUILDER.RULES.ACTION.CLEAR', value: 'clear' },
    { label: 'FORM_BUILDER.RULES.ACTION.VALIDATE', value: 'validate' },
  ];

  /** Ops that carry no value input. */
  private readonly VALUELESS: PersistedLeafOp[] = ['isEmpty', 'isNotEmpty'];

  readonly needsExpr = computed(() => this.action() === 'set_value');
  readonly needsMessage = computed(() => this.action() === 'validate');
  readonly exprError = computed(
    () =>
      this.needsExpr() &&
      this.setValueExpr().trim().length > 0 &&
      !validateExpression(this.setValueExpr()).ok,
  );

  readonly canSave = computed(() => {
    if (this.advancedAst()) return false;
    if (this.name().trim().length === 0) return false;
    if (this.targetKeys().length === 0) return false;
    if (this.leaves().length === 0) return false;
    if (this.leaves().some(l => !l.fieldKey)) return false;
    if (this.needsExpr() && (this.setValueExpr().trim() === '' || this.exprError()))
      return false;
    if (this.needsMessage() && this.message().trim() === '') return false;
    return true;
  });

  ngOnChanges(): void {
    if (this.rule === 'new') {
      this.name.set('');
      this.combinator.set('and');
      this.leaves.set([{ fieldKey: '', op: 'eq', value: '' }]);
      this.action.set('show');
      this.targetKeys.set([]);
      this.setValueExpr.set('');
      this.message.set('');
      this.advancedAst.set(null);
      return;
    }
    const r = this.rule;
    this.name.set(r.name ?? '');
    this.action.set(r.action);
    this.targetKeys.set([...(r.targetFieldKeys ?? [])]);
    this.setValueExpr.set(r.setValueExpr ?? '');
    this.message.set(r.message ?? '');
    this.parseTrigger(r.trigger);
  }

  // ── Leaf-row ops ──────────────────────────────────────────────────────
  addLeaf(): void {
    this.leaves.update(list => [...list, { fieldKey: '', op: 'eq', value: '' }]);
  }
  removeLeaf(i: number): void {
    this.leaves.update(list => list.filter((_, idx) => idx !== i));
  }
  patchLeaf(i: number, patch: Partial<LeafRow>): void {
    this.leaves.update(list =>
      list.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }
  isValueless(op: PersistedLeafOp): boolean {
    return this.VALUELESS.includes(op);
  }

  // ── Trigger AST round-trip ────────────────────────────────────────────
  /** Build the persisted trigger AST from the leaf rows. */
  buildTrigger(): PersistedAst {
    const leaves = this.leaves().map(l => this.rowToLeaf(l));
    if (leaves.length === 1) return leaves[0];
    return { kind: 'group', combinator: this.combinator(), children: leaves };
  }

  private rowToLeaf(row: LeafRow): PersistedLeaf {
    const leaf: PersistedLeaf = { kind: 'leaf', fieldKey: row.fieldKey, op: row.op };
    if (!this.isValueless(row.op)) leaf.value = this.coerceValue(row.op, row.value);
    return leaf;
  }

  /** in/notIn take a comma-separated list; everything else a scalar string. */
  private coerceValue(op: PersistedLeafOp, raw: string): unknown {
    if (op === 'in' || op === 'notIn') {
      return raw
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }
    return raw;
  }

  /** Inverse: populate rows from a persisted trigger, or fall back to advanced. */
  parseTrigger(t: PersistedAst): void {
    this.advancedAst.set(null);
    if (t.kind === 'leaf') {
      this.combinator.set('and');
      this.leaves.set([this.leafToRow(t)]);
      return;
    }
    // A flat group of leaves with an and/or combinator is editable.
    const flatLeaves =
      t.combinator !== 'not' && t.children.every(c => c.kind === 'leaf');
    if (flatLeaves) {
      this.combinator.set(t.combinator as 'and' | 'or');
      this.leaves.set((t.children as PersistedLeaf[]).map(l => this.leafToRow(l)));
      return;
    }
    // Nested groups or a `not` group — read-only.
    this.advancedAst.set(t);
  }

  private leafToRow(leaf: PersistedLeaf): LeafRow {
    const v = leaf.value;
    return {
      fieldKey: leaf.fieldKey,
      op: leaf.op,
      value: Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v),
    };
  }

  readonly advancedJson = computed(() => {
    const ast = this.advancedAst();
    return ast ? JSON.stringify(ast, null, 2) : '';
  });

  // ── Persist ───────────────────────────────────────────────────────────
  async save(): Promise<void> {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    const body: CreateRuleBody = {
      name: this.name().trim(),
      trigger: this.buildTrigger(),
      action: this.action(),
      targetFieldKeys: [...this.targetKeys()],
    };
    if (this.needsExpr()) body.setValueExpr = this.setValueExpr().trim();
    if (this.needsMessage()) body.message = this.message().trim();

    try {
      const formId = this.store.formId();
      const v = this.store.version();
      const result =
        this.rule === 'new'
          ? await this.admin.createRule(formId, v, body)
          : await this.admin.updateRule(formId, v, this.rule.id, body);
      this.saved.emit(result);
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
