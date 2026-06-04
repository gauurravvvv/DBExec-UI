import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { ThemeSettingsService } from '../../services/theme-settings.service';

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

@Component({
  selector: 'app-theme-settings',
  templateUrl: './theme-settings.component.html',
  styleUrls: ['./theme-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSettingsComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  themeForm!: FormGroup;
  // Tracks whether the persisted row is the BE-synthesised default —
  // affects the empty-state banner and lets us hide "Reset" when the
  // theme already matches defaults.
  isDefault = true;
  showResetConfirm = false;

  loading = this.themeService.loading;
  saving = this.themeService.saving;
  resetting = this.themeService.resetting;

  constructor(
    private fb: FormBuilder,
    private themeService: ThemeSettingsService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.themeForm.dirty;
  }
  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.loadTheme();
  }

  ngOnDestroy(): void {
    // Cancel the in-flight GET if the admin navigates away mid-load.
    this.themeService.cancelReads();
  }

  private initForm(): void {
    this.themeForm = this.fb.group({
      primary: ['', [Validators.required, Validators.pattern(HEX_PATTERN)]],
      primaryHover: ['', [Validators.pattern(HEX_PATTERN)]],
      primaryLight: ['', [Validators.pattern(HEX_PATTERN)]],
      // 'white' / 'black' / '#rrggbb' — kept as a plain string so the
      // user can pick either a shortcut or a custom hex.
      primaryText: [''],
    });
  }

  private async loadTheme(): Promise<void> {
    await this.themeService.load();
    const data = this.themeService.current();
    if (!data) return;
    this.isDefault = data.isDefault ?? true;
    this.themeForm.patchValue({
      primary: data.primary,
      primaryHover: data.primaryHover,
      primaryLight: data.primaryLight,
      primaryText: data.primaryText,
    });
    this.themeForm.markAsPristine();
    this.cdr.markForCheck();
  }

  /**
   * Bridge between the native <input type="color"> swatch and the
   * Reactive Form control. Browsers always emit a 6-char #rrggbb
   * lowercase value from the picker, which is what we persist —
   * 3-char shorthand is only accepted as user-typed input. Mark
   * dirty so the Save button enables.
   */
  onColorPicked(controlName: string, value: string): void {
    this.themeForm.get(controlName)?.setValue(value);
    this.themeForm.get(controlName)?.markAsDirty();
  }

  /**
   * Resolve the swatch's `value` attribute. The native picker rejects
   * anything that isn't a 6-char hex (no 3-char shorthand, no named
   * colours), so we normalise: a valid 6-char hex passes through,
   * a 3-char hex is expanded, anything else falls back to a neutral
   * grey so the picker is still openable.
   */
  swatchValue(controlName: string): string {
    const raw = String(this.themeForm.get(controlName)?.value ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const m = raw.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
    }
    return '#cccccc';
  }

  // ── Save flow ───────────────────────────────────────────────
  async onSave(): Promise<void> {
    if (this.themeForm.invalid) {
      this.themeForm.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    const v = this.themeForm.value;
    const payload: any = {
      primary: v.primary?.trim(),
      primaryHover: v.primaryHover?.trim() || undefined,
      primaryLight: v.primaryLight?.trim() || undefined,
      primaryText: v.primaryText?.trim() || undefined,
    };
    // Strip undefined so the BE merge logic falls back to existing
    // values rather than overwriting them with blanks.
    Object.keys(payload).forEach(
      k => payload[k] === undefined && delete payload[k],
    );
    const res = await this.themeService.save(payload);
    if (this.globalService.handleSuccessService(res)) {
      this.isDefault = false;
      this.themeForm.markAsPristine();
      this.cdr.markForCheck();
    }
  }

  // ── Reset flow ──────────────────────────────────────────────
  openResetConfirm(): void {
    this.showResetConfirm = true;
  }
  cancelReset(): void {
    this.showResetConfirm = false;
  }
  async proceedReset(): Promise<void> {
    if (this.resetting()) return;
    const res = await this.themeService.reset();
    this.showResetConfirm = false;
    if (this.globalService.handleSuccessService(res)) {
      // Reload form values from the (now reset) persisted row so the
      // colour pickers reflect defaults.
      const data = this.themeService.current();
      if (data) {
        this.isDefault = data.isDefault ?? true;
        this.themeForm.patchValue({
          primary: data.primary,
          primaryHover: data.primaryHover,
          primaryLight: data.primaryLight,
          primaryText: data.primaryText,
        });
        this.themeForm.markAsPristine();
        this.cdr.markForCheck();
      }
    }
  }

}
