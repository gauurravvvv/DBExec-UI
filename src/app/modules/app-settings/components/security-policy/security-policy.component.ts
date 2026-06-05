import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrgPolicyService } from '../../services/org-policy.service';

/**
 * Security Policy settings page — Org Admin only. Four numeric inputs
 * mapped onto the security slice of the per-org OrgPolicy entity.
 *
 * The same input ranges enforced server-side (and previously on the
 * System Admin's create-org form) are re-applied here so the Save
 * button is gated on valid bounds before the request leaves.
 */
@Component({
  selector: 'app-security-policy',
  templateUrl: './security-policy.component.html',
  styleUrls: ['./security-policy.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityPolicyComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  securityForm!: FormGroup;
  loading = this.orgPolicyService.loading;
  saving = this.orgPolicyService.saving;

  constructor(
    private fb: FormBuilder,
    private orgPolicyService: OrgPolicyService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.securityForm.dirty;
  }
  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.loadPolicy();
  }

  ngOnDestroy(): void {
    this.orgPolicyService.cancelReads();
  }

  private initForm(): void {
    this.securityForm = this.fb.group({
      maxLoginAttempts: [
        5,
        [Validators.required, Validators.min(3), Validators.max(10)],
      ],
      accountLockDurationHours: [
        1,
        [Validators.required, Validators.min(0), Validators.max(24)],
      ],
      passwordHistoryLimit: [
        5,
        [Validators.required, Validators.min(1), Validators.max(24)],
      ],
      sessionInactivityTimeout: [
        30,
        [Validators.required, Validators.min(5), Validators.max(1440)],
      ],
    });
  }

  private async loadPolicy(): Promise<void> {
    await this.orgPolicyService.getPolicy();
    const data = this.orgPolicyService.current();
    if (!data) return;
    this.securityForm.patchValue(
      {
        maxLoginAttempts: data.maxLoginAttempts ?? 5,
        accountLockDurationHours: data.accountLockDurationHours ?? 1,
        passwordHistoryLimit: data.passwordHistoryLimit ?? 5,
        sessionInactivityTimeout: data.sessionInactivityTimeout ?? 30,
      },
      { emitEvent: false },
    );
    this.securityForm.markAsPristine();
    this.cdr.markForCheck();
  }

  async onSave(): Promise<void> {
    if (this.securityForm.invalid) {
      this.securityForm.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    const v = this.securityForm.value;
    const res = await this.orgPolicyService.updateSecurity({
      maxLoginAttempts: Number(v.maxLoginAttempts),
      accountLockDurationHours: Number(v.accountLockDurationHours),
      passwordHistoryLimit: Number(v.passwordHistoryLimit),
      sessionInactivityTimeout: Number(v.sessionInactivityTimeout),
    });
    if (this.globalService.handleSuccessService(res)) {
      this.securityForm.markAsPristine();
      this.cdr.markForCheck();
    }
  }

  getFieldError(fieldName: string): string {
    const control = this.securityForm.get(fieldName);
    if (!control?.errors || !control.touched) return '';
    if (control.errors['required'])
      return this.translate.instant('VALIDATION.FIELD_REQUIRED');
    if (control.errors['min'])
      return this.translate.instant('VALIDATION.MIN_VALUE', {
        value: control.errors['min'].min,
      });
    if (control.errors['max'])
      return this.translate.instant('VALIDATION.MAX_VALUE', {
        value: control.errors['max'].max,
      });
    return '';
  }
}
