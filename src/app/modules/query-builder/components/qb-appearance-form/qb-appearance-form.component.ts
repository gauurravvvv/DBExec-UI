/**
 * qb-appearance-form — the admin's per-prompt appearance editor (spec §6.3).
 *
 * The appearance config is a discriminated union on Prompt.type. This form is
 * data-driven from qb-appearance-fields: an accordion of sections, each a grid
 * of shared app-custom-* controls. On save it round-trips the edited object
 * through the mirrored promptAppearanceSchema so what the admin sees is exactly
 * what the runtime renderer and the server validator accept.
 *
 * `type` is fixed to the prompt's type (the Zod discriminant); the admin never
 * edits it here — changing a prompt's control type is a prompt-level action.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  computed,
  signal,
} from '@angular/core';
import {
  PromptAppearance,
  defaultAppearanceFor,
  promptAppearanceSchema,
} from 'src/app/shared/validators/promptAppearance';
import {
  AppearanceField,
  AppearanceSection,
  FieldOption,
  sectionsForType,
} from '../../helpers/qb-appearance-fields';

@Component({
  selector: 'qb-appearance-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-appearance-form.component.html',
  styleUrls: ['./qb-appearance-form.component.scss'],
})
export class QbAppearanceFormComponent implements OnChanges {
  /** The prompt's control type — the appearance discriminant. */
  @Input({ required: true }) promptType!: string;
  /** The stored appearance ({} for never-configured prompts). */
  @Input() appearance: Record<string, any> | null = null;
  /** Operator codes applicable to this prompt, for the allowed-operators picker. */
  @Input() operatorOptions: FieldOption[] = [];

  /** Emits the validated appearance object on every change. */
  @Output() appearanceChange = new EventEmitter<PromptAppearance>();
  /** Emits validation errors (i18n keys) so the host can gate Save. */
  @Output() validityChange = new EventEmitter<string[]>();

  /** The working copy the controls bind to. */
  readonly model = signal<Record<string, any>>({});

  readonly sections = computed<AppearanceSection[]>(() =>
    sectionsForType(this.promptType),
  );

  ngOnChanges(): void {
    // Seed the model: parse the stored config (with defaults) or fall back.
    const merged = { ...(this.appearance ?? {}), type: this.promptType };
    const parsed = promptAppearanceSchema.safeParse(merged);
    const seed = parsed.success
      ? (parsed.data as Record<string, any>)
      : (defaultAppearanceFor(this.promptType) as unknown as Record<
          string,
          any
        >);
    this.model.set({ ...seed, type: this.promptType });
    this.emit();
  }

  /** Read a field value for binding. */
  value(key: string): any {
    return this.model()[key];
  }

  /** Write a field value and re-validate. */
  setValue(key: string, val: any): void {
    this.model.update(m => ({ ...m, [key]: val }));
    this.emit();
  }

  /** trackBy for the section / field ngFor. */
  trackSection = (_: number, s: AppearanceSection) => s.title;
  trackField = (_: number, f: AppearanceField) => f.key;

  /** For the allowed-operators multiselect, the current codes as an array. */
  get allowedOperators(): string[] {
    const v = this.model()['allowedOperators'];
    return Array.isArray(v) ? v : [];
  }

  private emit(): void {
    const candidate = { ...this.model(), type: this.promptType };
    const parsed = promptAppearanceSchema.safeParse(candidate);
    if (parsed.success) {
      this.appearanceChange.emit(parsed.data);
      this.validityChange.emit([]);
    } else {
      this.validityChange.emit(
        parsed.error.issues.map(i => i.message).filter(Boolean),
      );
    }
  }
}
