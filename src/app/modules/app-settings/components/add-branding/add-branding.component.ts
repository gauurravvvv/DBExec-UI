import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { APP_SETTINGS_HUB, BRANDING_PRESET } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  BrandingPreset,
  BrandingSettingsService,
} from '../../services/branding-settings.service';

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * AddBrandingComponent — routed create/edit/view page for a branding
 * (watermark) preset. Mirrors add-theme: name + description + the
 * watermark form (toggle, text, bg/text colours) with a live pill
 * preview, Save/Cancel, unsaved-changes guard. Routes:
 *   /branding-presets/new · /:id/edit · /:id (view, read-only)
 */
@Component({
  selector: 'app-add-branding',
  templateUrl: './add-branding.component.html',
  styleUrls: ['./add-branding.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddBrandingComponent implements OnInit, HasUnsavedChanges {
  form!: FormGroup;
  presetId: string | null = null;
  mode: 'new' | 'edit' | 'view' = 'new';
  saving = false;

  minTextLength = 3;
  maxTextLength = 30;

  get isEdit(): boolean {
    return this.mode === 'edit';
  }
  get isView(): boolean {
    return this.mode === 'view';
  }

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private brandingService: BrandingSettingsService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.isView;
  }

  ngOnInit(): void {
    this.presetId = this.route.snapshot.paramMap.get('id');
    const isEditSegment = this.route.snapshot.url.some(s => s.path === 'edit');
    if (!this.presetId) {
      this.mode = 'new';
    } else {
      this.mode = isEditSegment ? 'edit' : 'view';
      void this.loadPreset(this.presetId);
    }
    if (this.isView) this.form.disable({ emitEvent: false });
  }

  private initForm(): void {
    // A branding preset always carries a watermark — enabling/disabling one is
    // handled by activating/deactivating the preset in the list, not by a form
    // toggle. So the watermark fields are always present and required.
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(80)]],
      description: ['', [Validators.maxLength(200)]],
      watermarkText: [
        '',
        [
          Validators.required,
          Validators.minLength(this.minTextLength),
          Validators.maxLength(this.maxTextLength),
        ],
      ],
      watermarkBgColor: [
        '#0d47a1',
        [Validators.required, Validators.pattern(HEX_PATTERN)],
      ],
      watermarkTextColor: [
        '#ffffff',
        [Validators.required, Validators.pattern(HEX_PATTERN)],
      ],
    });
  }

  private async loadPreset(id: string): Promise<void> {
    const p = await this.brandingService.getPreset(id);
    if (!p) {
      this.router.navigateByUrl(APP_SETTINGS_HUB.tab('branding'));
      return;
    }
    this.form.patchValue({
      name: p.name,
      description: p.description ?? '',
      watermarkText: p.watermarkText ?? '',
      watermarkBgColor: p.watermarkBgColor ?? '#0d47a1',
      watermarkTextColor: p.watermarkTextColor ?? '#ffffff',
    });
    this.form.markAsPristine();
    if (this.isView) this.form.disable({ emitEvent: false });
    this.cdr.markForCheck();
  }

  swatchValue(control: string): string {
    const raw = String(this.form.get(control)?.value ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const m = raw.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
    }
    return '#cccccc';
  }
  onColorPicked(control: string, value: string): void {
    if (this.isView) return;
    this.form.get(control)?.setValue(value);
    this.form.get(control)?.markAsDirty();
  }

  showFieldError(control: string): boolean {
    const c = this.form.get(control);
    return !!(c?.invalid && c?.touched);
  }

  getTextError(): string {
    const c = this.form.get('watermarkText');
    const key = c?.hasError('required')
      ? 'BRANDING.TEXT_REQUIRED'
      : 'BRANDING.TEXT_LENGTH';
    return this.translate.instant(key, {
      min: this.minTextLength,
      max: this.maxTextLength,
    });
  }

  private body(): Partial<BrandingPreset> {
    const v = this.form.getRawValue();
    // A preset always defines a watermark; whether it's shown is decided by
    // activating the preset in the list, so persist showWatermark = true.
    return {
      name: (v.name ?? '').trim(),
      description: (v.description ?? '').trim(),
      showWatermark: true,
      watermarkText: (v.watermarkText ?? '').trim(),
      watermarkBgColor: v.watermarkBgColor,
      watermarkTextColor: v.watermarkTextColor,
    };
  }

  async onSave(): Promise<void> {
    if (this.isView || this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    try {
      const res = this.isEdit
        ? await this.brandingService.updatePreset(this.presetId!, this.body())
        : await this.brandingService.createPreset(this.body());
      if (this.globalService.handleSuccessService(res)) {
        this.form.markAsPristine();
        this.router.navigateByUrl(APP_SETTINGS_HUB.tab('branding'));
      }
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  onCancel(): void {
    this.router.navigateByUrl(APP_SETTINGS_HUB.tab('branding'));
  }
  onEditFromView(): void {
    if (this.presetId) this.router.navigateByUrl(BRANDING_PRESET.edit(this.presetId));
  }
}
