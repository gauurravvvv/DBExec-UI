import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { DashboardService } from 'src/app/modules/dashboard/services/dashboard.service';

/**
 * Payload emitted by the dialog when the user submits.
 * - mode='new'      → caller posts a fresh publish (server creates new dashboard)
 * - mode='existing' → caller posts a republish (server overwrites snapshot)
 */
export interface PublishDashboardPayload {
  mode: 'new' | 'existing';
  dashboardId?: string;
  name?: string;
  description?: string;
}

/**
 * PublishDashboardDialog
 *
 * Drives the "publish into new dashboard" vs "republish into existing
 * one" UX. Loads the list of dashboards already published from this
 * analysis on open so the user can pick a target.
 *
 * The 'existing' tab is destructive — overwriting the previous
 * snapshot — so a confirmation step is required before emitting the
 * payload. We do that confirmation inline (a second "Yes, overwrite"
 * button reveal) rather than spawning a second dialog: the warning
 * stays close to the action and the user only needs one click after
 * they've already focused on a specific target.
 */
@Component({
  selector: 'app-publish-dashboard-dialog',
  templateUrl: './publish-dashboard-dialog.component.html',
  styleUrls: ['./publish-dashboard-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishDashboardDialogComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() orgId = '';
  @Input() datasourceId = '';
  @Input() analysisId = '';
  @Input() analysisName = '';
  // Saving spinner controlled by the parent (so parent can keep
  // showing it while the response is processed and navigation runs).
  @Input() saving = false;
  @Output() close = new EventEmitter<PublishDashboardPayload | null>();

  form!: FormGroup;
  mode: 'new' | 'existing' = 'new';
  existingDashboards: any[] = [];
  loadingExisting = false;
  confirmingOverwrite = false;

  constructor(
    private fb: FormBuilder,
    private translate: TranslateService,
    private dashboardService: DashboardService,
    private cdr: ChangeDetectorRef,
  ) {}

  @HostListener('document:keydown.escape')
  handleEsc() {
    if (this.visible) this.onCancel();
  }

  ngOnInit() {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']?.currentValue) {
      this.reset();
      this.loadExisting();
    }
  }

  private initForm() {
    this.form = this.fb.group({
      // Required only when mode === 'new'. We toggle the validator in
      // setMode() rather than rely on @if-required, so reactive form
      // validity matches the visible UI exactly.
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: ['', [Validators.maxLength(500)]],
      dashboardId: [''],
    });
  }

  private reset() {
    this.mode = 'new';
    this.confirmingOverwrite = false;
    this.form?.reset({ name: '', description: '', dashboardId: '' });
    this.applyValidators();
  }

  setMode(mode: 'new' | 'existing') {
    this.mode = mode;
    this.confirmingOverwrite = false;
    this.applyValidators();
  }

  private applyValidators() {
    if (!this.form) return;
    const nameCtrl = this.form.get('name');
    const dashCtrl = this.form.get('dashboardId');
    if (this.mode === 'new') {
      nameCtrl?.setValidators([
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(100),
        Validators.pattern(REGEX.orgName),
      ]);
      dashCtrl?.clearValidators();
    } else {
      // Republish: name optional rename only.
      nameCtrl?.setValidators([
        Validators.minLength(2),
        Validators.maxLength(100),
        Validators.pattern(REGEX.orgName),
      ]);
      dashCtrl?.setValidators([Validators.required]);
    }
    nameCtrl?.updateValueAndValidity();
    dashCtrl?.updateValueAndValidity();
  }

  private async loadExisting() {
    if (!this.datasourceId || !this.analysisId) return;
    this.loadingExisting = true;
    try {
      this.existingDashboards = await this.dashboardService.listForAnalysis({
        datasourceId: this.datasourceId,
        analysisId: this.analysisId,
      });
    } catch {
      this.existingDashboards = [];
    } finally {
      this.loadingExisting = false;
      this.cdr.markForCheck();
    }
  }

  getNameError(): string {
    const ctrl = this.form.get('name');
    if (!ctrl) return '';
    if (ctrl.errors?.['required'])
      return this.translate.instant('VALIDATION.ANALYSIS_NAME_REQUIRED');
    if (ctrl.errors?.['minlength'])
      return this.translate.instant('VALIDATION.ANALYSIS_NAME_MIN_LENGTH', {
        length: ctrl.errors['minlength'].requiredLength,
      });
    if (ctrl.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.ANALYSIS_NAME_MAX_LENGTH', {
        length: ctrl.errors['maxlength'].requiredLength,
      });
    if (ctrl.errors?.['pattern'])
      return this.translate.instant('VALIDATION.ANALYSIS_NAME_PATTERN');
    return '';
  }

  /** True when the user can hit the primary action. */
  get canSubmit(): boolean {
    if (this.saving) return false;
    if (this.mode === 'new') {
      return !!this.form.get('name')?.valid;
    }
    return !!this.form.get('dashboardId')?.value;
  }

  onPrimaryClick() {
    if (!this.canSubmit) return;
    if (this.mode === 'existing' && !this.confirmingOverwrite) {
      // First click: arm the destructive confirmation. Second click
      // (with confirmingOverwrite=true) actually emits.
      this.confirmingOverwrite = true;
      return;
    }
    this.emitPayload();
  }

  private emitPayload() {
    const name = (this.form.get('name')?.value || '').trim();
    const description = (this.form.get('description')?.value || '').trim();
    const dashboardId = this.form.get('dashboardId')?.value || undefined;

    const payload: PublishDashboardPayload = {
      mode: this.mode,
      description: description || undefined,
    };
    if (this.mode === 'new') {
      payload.name = name;
    } else {
      payload.dashboardId = dashboardId;
      if (name) payload.name = name;
    }
    this.close.emit(payload);
  }

  onCancel() {
    this.close.emit(null);
  }

  cancelConfirm() {
    this.confirmingOverwrite = false;
  }
}
