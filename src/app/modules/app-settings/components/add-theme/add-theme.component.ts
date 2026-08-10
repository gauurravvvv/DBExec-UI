import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime } from 'rxjs';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { THEME_PRESET } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import {
  THEME_TOKENS,
  THEME_TOKEN_GROUPS,
  ThemeToken,
  ThemeTokenGroup,
} from 'src/app/shared/theme/theme-tokens';
import {
  ThemePreset,
  ThemeSettingsService,
} from '../../services/theme-settings.service';

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface TokenGroupView {
  group: ThemeTokenGroup;
  tokens: ThemeToken[];
  open: boolean;
}

/**
 * AddThemeComponent — the routed create/edit page for a theme preset.
 *
 * One component serves both:
 *  - /app/settings/themes/new       → create a custom preset
 *  - /app/settings/themes/:id/edit  → edit a custom preset
 *  - /app/settings/themes/:id       → view (read-only, seeded or not)
 *
 * A name field + the 44-control colour editor (grouped accordion,
 * swatch + hex per token). Live preview repaints this tab while editing;
 * the authoritative theme is restored on leave. Seeded presets open
 * read-only. Save creates/updates and returns to the list.
 */
@Component({
  selector: 'app-add-theme',
  templateUrl: './add-theme.component.html',
  styleUrls: ['./add-theme.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddThemeComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  themeForm!: FormGroup;
  groups: TokenGroupView[] = [];

  presetId: string | null = null;
  mode: 'new' | 'edit' | 'view' = 'new';
  loadedPreset: ThemePreset | null = null;
  saving = false;

  get isEdit(): boolean {
    return this.mode === 'edit';
  }
  get isView(): boolean {
    return this.mode === 'view';
  }
  get readOnly(): boolean {
    return this.isView || !!this.loadedPreset?.isSeeded;
  }

  private readonly destroyRef = inject(DestroyRef);

  /** The authoritative (active) theme captured on entry, BEFORE any
   *  live-preview overwrites `ThemeService.theme()`. Restored on leave so
   *  cancelling/backing out never strands the workspace on the unsaved
   *  preview. (Mirrors the snapshot in list-themes.) */
  private activeThemeSnapshot: unknown = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private themeService: ThemeSettingsService,
    private themeInjector: ThemeService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {
    this.buildGroups();
    this.initForm();
  }

  hasUnsavedChanges(): boolean {
    return this.themeForm.dirty && !this.readOnly;
  }

  ngOnInit(): void {
    // Capture the active theme FIRST — before seedDefaults()/loadPreset()
    // call livePreview(), which overwrites ThemeService.theme() with the
    // preview. Restoring this on leave (not theme()) is what keeps a
    // cancelled edit/view from stranding the workspace on the preview.
    this.activeThemeSnapshot = this.themeInjector.theme();

    // Route shape: /new (no id) or /:id or /:id/edit.
    this.presetId = this.route.snapshot.paramMap.get('id');
    const isEditSegment = this.route.snapshot.url.some(s => s.path === 'edit');
    if (!this.presetId) {
      this.mode = 'new';
      this.seedDefaults();
    } else {
      this.mode = isEditSegment ? 'edit' : 'view';
      void this.loadPreset(this.presetId);
    }

    // Live-preview colour edits on this tab.
    this.themeForm.valueChanges
      .pipe(debounceTime(120), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.livePreview());
  }

  ngOnDestroy(): void {
    // Restore the theme captured on entry — the editor preview was local.
    // Must use the snapshot, NOT themeInjector.theme(), which livePreview()
    // has overwritten with the (unsaved) preview.
    this.themeInjector.applyFromLogin(this.activeThemeSnapshot as any);
  }

  // ── Form ────────────────────────────────────────────────────
  private buildGroups(): void {
    this.groups = THEME_TOKEN_GROUPS.map((group, i) => ({
      group,
      tokens: THEME_TOKENS.filter(t => t.group === group),
      open: i === 0,
    }));
  }

  private initForm(): void {
    const controls: Record<string, any> = {
      name: ['', [Validators.required, Validators.maxLength(80)]],
      description: ['', [Validators.maxLength(200)]],
    };
    for (const token of THEME_TOKENS) {
      const validators =
        token.key === 'primary'
          ? [Validators.required, Validators.pattern(HEX_PATTERN)]
          : token.key === 'primaryText'
            ? []
            : [Validators.pattern(HEX_PATTERN)];
      controls[token.key] = ['', validators];
    }
    this.themeForm = this.fb.group(controls);
  }

  /** New preset starts from the current active theme's colours (a good
   *  base to tweak), or platform defaults if none. */
  private async seedDefaults(): Promise<void> {
    await this.themeService.load();
    const cur = this.themeService.current();
    this.patchColors(cur?.colors ?? {});
    this.themeForm.markAsPristine();
    this.livePreview();
    this.cdr.markForCheck();
  }

  private async loadPreset(id: string): Promise<void> {
    const p = await this.themeService.getPreset(id);
    if (!p) {
      this.router.navigateByUrl(THEME_PRESET.LIST);
      return;
    }
    this.loadedPreset = p;
    this.themeForm.patchValue({ name: p.name, description: p.description ?? '' });
    this.patchColors(p.colors ?? {});
    if (this.readOnly) this.themeForm.disable({ emitEvent: false });
    this.themeForm.markAsPristine();
    this.livePreview();
    this.cdr.markForCheck();
  }

  private patchColors(colors: Record<string, string>): void {
    const patch: Record<string, string> = {};
    for (const token of THEME_TOKENS) patch[token.key] = colors[token.key] ?? '';
    this.themeForm.patchValue(patch, { emitEvent: false });
  }

  toggleGroup(v: TokenGroupView): void {
    v.open = !v.open;
  }
  trackByGroup(_i: number, g: TokenGroupView): string {
    return g.group;
  }

  onColorPicked(controlName: string, value: string): void {
    if (this.readOnly) return;
    this.themeForm.get(controlName)?.setValue(value, { emitEvent: false });
    this.themeForm.get(controlName)?.markAsDirty();
    this.livePreview();
  }

  private editorColors(): Record<string, string> {
    const colors: Record<string, string> = {};
    for (const token of THEME_TOKENS) {
      const v = String(this.themeForm.get(token.key)?.value ?? '').trim();
      if (v) colors[token.key] = v;
    }
    return colors;
  }

  private livePreview(): void {
    // View is read-only: opening a preset to inspect it should not repaint
    // the whole workspace in that preset's colours. Only new/edit preview.
    if (this.readOnly) return;
    this.themeInjector.applyFromLogin({ colors: this.editorColors() } as any);
  }

  swatchValue(controlName: string): string {
    const raw = String(this.themeForm.get(controlName)?.value ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
      const m = raw.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`.toLowerCase();
    }
    return '#cccccc';
  }

  showFieldError(controlName: string): boolean {
    const c = this.themeForm.get(controlName);
    return !!(c?.invalid && c?.touched);
  }

  // ── Save / cancel ───────────────────────────────────────────
  async onSave(): Promise<void> {
    if (this.readOnly || this.saving) return;
    if (this.themeForm.invalid) {
      this.themeForm.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const body = {
      name: String(this.themeForm.get('name')?.value ?? '').trim(),
      description: String(this.themeForm.get('description')?.value ?? '').trim(),
      colors: this.editorColors(),
    };
    try {
      const res = this.isEdit
        ? await this.themeService.updatePreset(this.presetId!, body)
        : await this.themeService.createPreset(body);
      if (this.globalService.handleSuccessService(res)) {
        this.themeForm.markAsPristine();
        // The list reloads via its own adapter on navigation.
        this.router.navigateByUrl(THEME_PRESET.LIST);
      }
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  onCancel(): void {
    this.router.navigateByUrl(THEME_PRESET.LIST);
  }

  onEditFromView(): void {
    if (this.presetId) this.router.navigateByUrl(THEME_PRESET.edit(this.presetId));
  }
}
