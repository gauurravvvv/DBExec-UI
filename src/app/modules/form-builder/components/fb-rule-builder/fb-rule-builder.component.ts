import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { FbAdminService } from '../../services/fb-admin.service';
import { FormBuilderStore, SelectedElement } from '../../services/form-builder-store';
import { FbFormRule } from '../../services/fb-types';
import { conditionFieldKeys, toEngineCondition } from '../../logic';

/**
 * fb-rule-builder — the Rules inspector view. List mode shows the version's
 * rules (name, a human when→then summary, an enable toggle, edit/delete) with a
 * missing-target warning when a rule references a field key no placement carries;
 * "New rule" / edit swaps to the <fb-rule-editor> child. When a field is
 * selected, the list is filtered to rules that target that field's key.
 */
@Component({
  selector: 'fb-rule-builder',
  templateUrl: './fb-rule-builder.component.html',
  styleUrls: ['./fb-rule-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbRuleBuilderComponent implements OnInit {
  readonly store = inject(FormBuilderStore);
  private readonly admin = inject(FbAdminService);
  private readonly global = inject(GlobalService);

  /** The current inspector selection (field-scoped when a field is selected). */
  selected = input<SelectedElement>(null);

  /** null = list; a rule or 'new' = editor. */
  readonly editing = signal<FbFormRule | 'new' | null>(null);
  readonly deletingId = signal<string | null>(null);

  readonly rules = this.store.rules;
  readonly fieldKeys = this.store.fieldKeys;

  /** The key of the selected field (if a field is selected), else null. */
  private readonly selectedFieldKey = computed<string | null>(() => {
    const s = this.selected();
    if (s?.kind !== 'field') return null;
    return this.store.selectedField()?.fieldKey ?? null;
  });

  /** Rules shown in the list — all, or filtered to the selected field's key. */
  readonly visibleRules = computed<FbFormRule[]>(() => {
    const key = this.selectedFieldKey();
    const all = this.rules();
    if (!key) return all;
    return all.filter(r => (r.targetFieldKeys ?? []).includes(key));
  });

  ngOnInit(): void {
    if (this.rules().length === 0) this.store.loadRules();
  }

  // ── List actions ──────────────────────────────────────────────────────
  startNew(): void {
    this.editing.set('new');
  }
  edit(rule: FbFormRule): void {
    this.editing.set(rule);
  }
  async remove(rule: FbFormRule): Promise<void> {
    this.deletingId.set(rule.id);
    try {
      await this.admin.deleteRule(this.store.formId(), this.store.version(), rule.id);
      this.store.removeRule(rule.id);
    } catch {
      this.global.showWarn('That rule could not be deleted.');
    } finally {
      this.deletingId.set(null);
    }
  }
  async toggleEnabled(rule: FbFormRule): Promise<void> {
    const next = !rule.isEnabled;
    // optimistic
    this.store.upsertRule({ ...rule, isEnabled: next });
    try {
      const saved = await this.admin.updateRule(
        this.store.formId(),
        this.store.version(),
        rule.id,
        { isEnabled: next },
      );
      this.store.upsertRule(saved);
    } catch {
      this.store.upsertRule(rule); // rollback
      this.global.showWarn('That change could not be saved.');
    }
  }

  // ── Editor callbacks ──────────────────────────────────────────────────
  onSaved(rule: FbFormRule): void {
    this.store.upsertRule(rule);
    this.editing.set(null);
  }
  onCancelled(): void {
    this.editing.set(null);
  }

  // ── List rendering helpers ────────────────────────────────────────────
  /** Field keys a rule references (trigger + targets) not present on the form. */
  missingKeys(rule: FbFormRule): string[] {
    const known = this.store.knownFieldKeys();
    const referenced = new Set<string>();
    try {
      for (const k of conditionFieldKeys(toEngineCondition(rule.trigger))) {
        referenced.add(k);
      }
    } catch {
      /* advanced/unmappable trigger — skip trigger-key extraction */
    }
    for (const k of rule.targetFieldKeys ?? []) referenced.add(k);
    return [...referenced].filter(k => !known.has(k));
  }

  /** A short "when … then <action> [targets]" summary for the list row. */
  summary(rule: FbFormRule): string {
    const labelFor = (k: string) =>
      this.fieldKeys().find(f => f.key === k)?.label ?? k;
    const targets = (rule.targetFieldKeys ?? []).map(labelFor).join(', ');
    return `${rule.action}${targets ? ' → ' + targets : ''}`;
  }
}
