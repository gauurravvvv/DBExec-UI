import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { BrandingSettingsService } from '../../services/branding-settings.service';

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const MIN_TEXT = 3;
const MAX_TEXT = 30;

/**
 * Branding settings page — toggle the bottom-right watermark on/off
 * and configure its text, background colour, and text colour.
 *
 * Two valid form states (mirrors the BE Joi schema):
 *  - Disabled: only the toggle is meaningful; the other three fields
 *    are hidden and left at whatever value was last persisted (so
 *    the admin can re-enable later without re-typing).
 *  - Enabled: text 3-30 chars + two valid hex colours, all required.
 *
 * Form-control validators are added/removed dynamically when the
 * toggle flips so the Save button only requires the relevant fields.
 */
@Component({
  selector: 'app-branding-settings',
  templateUrl: './branding-settings.component.html',
  styleUrls: ['./branding-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandingSettingsComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  brandingForm!: FormGroup;
  readonly minTextLength = MIN_TEXT;
  readonly maxTextLength = MAX_TEXT;

  loading = this.brandingService.loading;
  saving = this.brandingService.saving;

  constructor(
    private fb: FormBuilder,
    private brandingService: BrandingSettingsService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
    // Add/remove validators on the dependent fields whenever the
    // master toggle changes so the Save button's enabled state
    // tracks the BE's rules without us re-checking on submit.
    this.brandingForm
      .get('showWatermark')!
      .valueChanges.subscribe(enabled => this.syncDependentValidators(!!enabled));
  }

  get isFormDirty(): boolean {
    return this.brandingForm.dirty;
  }
  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.loadBranding();
  }

  ngOnDestroy(): void {
    this.brandingService.cancelReads();
  }

  private initForm(): void {
    this.brandingForm = this.fb.group({
      showWatermark: [false],
      watermarkText: [''],
      watermarkBgColor: [''],
      watermarkTextColor: [''],
    });
  }

  private syncDependentValidators(enabled: boolean): void {
    const text = this.brandingForm.get('watermarkText')!;
    const bg = this.brandingForm.get('watermarkBgColor')!;
    const fg = this.brandingForm.get('watermarkTextColor')!;
    if (enabled) {
      text.setValidators([
        Validators.required,
        Validators.minLength(MIN_TEXT),
        Validators.maxLength(MAX_TEXT),
      ]);
      bg.setValidators([Validators.required, Validators.pattern(HEX_PATTERN)]);
      fg.setValidators([Validators.required, Validators.pattern(HEX_PATTERN)]);
    } else {
      text.clearValidators();
      bg.clearValidators();
      fg.clearValidators();
    }
    text.updateValueAndValidity({ emitEvent: false });
    bg.updateValueAndValidity({ emitEvent: false });
    fg.updateValueAndValidity({ emitEvent: false });
  }

  private async loadBranding(): Promise<void> {
    await this.brandingService.load();
    const data = this.brandingService.current();
    if (!data) return;
    this.brandingForm.patchValue(
      {
        showWatermark: data.showWatermark,
        watermarkText: data.watermarkText ?? '',
        watermarkBgColor: data.watermarkBgColor ?? '',
        watermarkTextColor: data.watermarkTextColor ?? '',
      },
      { emitEvent: true },
    );
    // patchValue with emitEvent runs the valueChanges subscription
    // above, so the dependent validators are now in the right state.
    this.brandingForm.markAsPristine();
    this.cdr.markForCheck();
  }

  // ── Colour-picker bridge (same helper as Theme settings) ─────
  onColorPicked(controlName: string, value: string): void {
    this.brandingForm.get(controlName)?.setValue(value);
    this.brandingForm.get(controlName)?.markAsDirty();
  }

  swatchValue(controlName: string): string {
    const raw = String(this.brandingForm.get(controlName)?.value ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const m = raw.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
    }
    return '#cccccc';
  }

  // ── Save flow ───────────────────────────────────────────────
  async onSave(): Promise<void> {
    if (this.brandingForm.invalid) {
      this.brandingForm.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    const v = this.brandingForm.value;
    const enabled = v.showWatermark === true;
    const payload = enabled
      ? {
          showWatermark: true,
          watermarkText: (v.watermarkText ?? '').toString().trim(),
          watermarkBgColor: (v.watermarkBgColor ?? '').toString().trim(),
          watermarkTextColor: (v.watermarkTextColor ?? '').toString().trim(),
        }
      : { showWatermark: false };
    const res = await this.brandingService.save(payload as any);
    if (this.globalService.handleSuccessService(res)) {
      this.brandingForm.markAsPristine();
      this.cdr.markForCheck();
    }
  }

  // ── Error messages for inline display ────────────────────────
  getTextError(): string {
    const c = this.brandingForm.get('watermarkText');
    if (!c) return '';
    if (c.errors?.['required']) return 'Watermark text is required';
    if (c.errors?.['minlength'])
      return `Minimum ${MIN_TEXT} characters`;
    if (c.errors?.['maxlength'])
      return `Maximum ${MAX_TEXT} characters`;
    return '';
  }
}
