/**
 * ImportFormDialogComponent — pick a `.form.json` document, validate it against
 * the mirrored portability schema, then POST it to create a NEW form family +
 * draft. Emits `imported` with the new formId on success so the host can
 * navigate to the new form.
 *
 * Uses the shared overlay idiom (.confirmation-popup) + app-custom-file +
 * app-button. Parse/validate happens client-side before submit (bad JSON /
 * schema mismatch surfaces its i18n key); the BE re-validates the same schema.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  inject,
  signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { importFormSchema } from 'src/app/shared/validators/formPortability';
import { FormPortabilityService } from '../../services/form-portability.service';

/** Hard cap on an uploaded document — DoS / mis-pick guard. */
const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

@Component({
  selector: 'app-import-form-dialog',
  templateUrl: './import-form-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportFormDialogComponent {
  private readonly portability = inject(FormPortabilityService);
  private readonly global = inject(GlobalService);
  private readonly translate = inject(TranslateService);

  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly imported = new EventEmitter<string>();

  readonly importing = this.portability.importing;
  readonly parsedDocument = signal<unknown | null>(null);
  readonly fileName = signal<string | null>(null);
  readonly parseError = signal<string | null>(null);

  /** A picked file: read → JSON.parse → Zod safeParse → hold the document. */
  async onFile(file: File | null): Promise<void> {
    this.parseError.set(null);
    this.parsedDocument.set(null);
    this.fileName.set(null);
    if (!file) return;

    if (file.size > IMPORT_MAX_FILE_BYTES) {
      this.parseError.set(
        this.translate.instant('FORM_BUILDER.PORTABILITY.FILE_TOO_LARGE'),
      );
      return;
    }

    let raw: unknown;
    try {
      const text = await file.text();
      raw = JSON.parse(text);
    } catch {
      this.parseError.set(
        this.translate.instant('FORM_BUILDER.PORTABILITY.INVALID_FILE'),
      );
      return;
    }

    // The importFormSchema wraps the document under `document` — wrap the raw
    // file (which IS the document) to run the same contract the BE enforces.
    const parsed = importFormSchema.safeParse({ document: raw });
    if (!parsed.success) {
      const key =
        parsed.error.issues[0]?.message ||
        'FORM_BUILDER.PORTABILITY.INVALID_FILE';
      this.parseError.set(this.translate.instant(key));
      return;
    }

    this.parsedDocument.set(parsed.data.document);
    this.fileName.set(file.name);
  }

  async onConfirm(): Promise<void> {
    const doc = this.parsedDocument();
    if (!doc) return;
    try {
      const result = await this.portability.importDocument(doc);
      const warnCount = result.warnings?.length ?? 0;
      this.global.showInfo(
        this.translate.instant('FORM_BUILDER.PORTABILITY.IMPORTED', {
          warnings: warnCount,
        }),
      );
      this.imported.emit(result.formId);
    } catch (e: any) {
      const key = e?.message || 'FORM_BUILDER.PORTABILITY.IMPORT_FAILED';
      this.global.showWarn(this.translate.instant(key));
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
