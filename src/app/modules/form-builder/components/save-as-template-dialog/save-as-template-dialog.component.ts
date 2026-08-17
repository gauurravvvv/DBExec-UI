/**
 * SaveAsTemplateDialogComponent — name + optional description form that saves
 * the given form version as a reusable org template. Emits `saved` with the new
 * template id on success. Reuses the shared overlay + app-custom-input /
 * app-custom-textarea / app-button; validates against saveTemplateSchema (the
 * same contract the BE enforces) before submit.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { saveTemplateSchema } from 'src/app/shared/validators/formPortability';
import { FormPortabilityService } from '../../services/form-portability.service';

@Component({
  selector: 'app-save-as-template-dialog',
  templateUrl: './save-as-template-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveAsTemplateDialogComponent {
  private readonly portability = inject(FormPortabilityService);
  private readonly global = inject(GlobalService);
  private readonly translate = inject(TranslateService);

  @Input({ required: true }) formId!: string;
  @Input({ required: true }) version!: number;

  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly saved = new EventEmitter<string>();

  readonly saving = this.portability.saving;
  readonly name = signal('');
  readonly description = signal('');
  readonly error = signal<string | null>(null);

  onNameChange(v: string): void {
    this.name.set(v ?? '');
    this.error.set(null);
  }

  onDescriptionChange(v: string): void {
    this.description.set(v ?? '');
  }

  async onConfirm(): Promise<void> {
    const parsed = saveTemplateSchema.safeParse({
      name: this.name().trim(),
      description: this.description().trim() || null,
    });
    if (!parsed.success) {
      const key =
        parsed.error.issues[0]?.message ||
        'FORM_BUILDER.PORTABILITY.SAVE_FAILED';
      this.error.set(this.translate.instant(key));
      return;
    }
    try {
      await this.portability.saveAsTemplate(
        this.formId,
        this.version,
        parsed.data.name,
        parsed.data.description,
      );
      this.global.showInfo(
        this.translate.instant('FORM_BUILDER.PORTABILITY.TEMPLATE_SAVED'),
      );
      this.saved.emit(this.name().trim());
    } catch (e: any) {
      const key = e?.message || 'FORM_BUILDER.PORTABILITY.SAVE_FAILED';
      this.global.showWarn(this.translate.instant(key));
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
