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

type EmailProvider = 'NONE' | 'SMTP' | 'SES';

/**
 * Email Configuration settings page — Org Admin only. Selects the
 * outbound provider for the per-org OrgPolicy and (conditionally)
 * collects the credentials.
 *
 * Secrets (smtpPassword, sesSecretAccessKey) are never returned by
 * the BE; the form shows a "Configured" badge sourced from the
 * *Configured booleans on the GET response and the user leaves the
 * field blank to keep the current value.
 */
@Component({
  selector: 'app-email-configuration',
  templateUrl: './email-configuration.component.html',
  styleUrls: ['./email-configuration.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailConfigurationComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  emailForm!: FormGroup;
  loading = this.orgPolicyService.loading;
  saving = this.orgPolicyService.saving;

  // Mirrors of the *Configured booleans the BE returns. The form never
  // re-renders these (BE doesn't send ciphertext) but the user needs to
  // know one is on file before deciding to leave the field blank.
  smtpPasswordConfigured = false;
  sesSecretAccessKeyConfigured = false;

  constructor(
    private fb: FormBuilder,
    private orgPolicyService: OrgPolicyService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
    this.emailForm
      .get('emailProvider')!
      .valueChanges.subscribe(p => this.syncValidators(p));
  }

  get isFormDirty(): boolean {
    return this.emailForm.dirty;
  }
  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  get selectedProvider(): EmailProvider {
    return (this.emailForm.get('emailProvider')?.value ?? 'NONE') as EmailProvider;
  }

  ngOnInit(): void {
    this.loadPolicy();
  }

  ngOnDestroy(): void {
    this.orgPolicyService.cancelReads();
  }

  private initForm(): void {
    this.emailForm = this.fb.group({
      emailProvider: ['NONE'],
      smtpHost: [''],
      smtpPort: [587],
      smtpUser: [''],
      smtpPassword: [''],
      smtpFrom: [''],
      sesRegion: [''],
      sesAccessKeyId: [''],
      sesSecretAccessKey: [''],
      sesFrom: [''],
    });
  }

  private syncValidators(provider: EmailProvider | null): void {
    const smtpFields = ['smtpHost', 'smtpPort', 'smtpUser', 'smtpFrom'];
    const sesFields = ['sesRegion', 'sesAccessKeyId', 'sesFrom'];
    [...smtpFields, ...sesFields].forEach(f => {
      this.emailForm.get(f)?.clearValidators();
      this.emailForm.get(f)?.updateValueAndValidity({ emitEvent: false });
    });

    if (provider === 'SMTP') {
      this.emailForm
        .get('smtpHost')
        ?.setValidators([Validators.required, Validators.maxLength(255)]);
      this.emailForm
        .get('smtpPort')
        ?.setValidators([
          Validators.required,
          Validators.min(1),
          Validators.max(65535),
        ]);
      this.emailForm
        .get('smtpUser')
        ?.setValidators([Validators.required, Validators.maxLength(255)]);
      this.emailForm
        .get('smtpFrom')
        ?.setValidators([Validators.required, Validators.email]);
    } else if (provider === 'SES') {
      this.emailForm
        .get('sesRegion')
        ?.setValidators([
          Validators.required,
          Validators.maxLength(50),
          Validators.pattern(/^[a-z]{2}-[a-z]+-\d{1,2}$/),
        ]);
      this.emailForm
        .get('sesAccessKeyId')
        ?.setValidators([
          Validators.required,
          Validators.minLength(16),
          Validators.maxLength(128),
        ]);
      this.emailForm
        .get('sesFrom')
        ?.setValidators([Validators.required, Validators.email]);
    }
    [...smtpFields, ...sesFields].forEach(f => {
      this.emailForm.get(f)?.updateValueAndValidity({ emitEvent: false });
    });
  }

  private async loadPolicy(): Promise<void> {
    await this.orgPolicyService.getPolicy();
    const data = this.orgPolicyService.current();
    if (!data) return;
    this.smtpPasswordConfigured = !!data.smtpPasswordConfigured;
    this.sesSecretAccessKeyConfigured = !!data.sesSecretAccessKeyConfigured;
    this.emailForm.patchValue(
      {
        emailProvider: data.emailProvider ?? 'NONE',
        smtpHost: data.smtpHost ?? '',
        smtpPort: data.smtpPort ?? 587,
        smtpUser: data.smtpUser ?? '',
        smtpPassword: '',
        smtpFrom: data.smtpFrom ?? '',
        sesRegion: data.sesRegion ?? '',
        sesAccessKeyId: data.sesAccessKeyId ?? '',
        sesSecretAccessKey: '',
        sesFrom: data.sesFrom ?? '',
      },
      { emitEvent: true },
    );
    this.emailForm.markAsPristine();
    this.cdr.markForCheck();
  }

  setProvider(provider: EmailProvider): void {
    this.emailForm.get('emailProvider')?.setValue(provider);
    this.emailForm.get('emailProvider')?.markAsDirty();
  }

  async onSave(): Promise<void> {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    if (this.saving()) return;
    const v = this.emailForm.value;
    const provider: EmailProvider = v.emailProvider ?? 'NONE';
    const payload: any = {
      emailProvider: provider === 'NONE' ? null : provider,
    };
    if (provider === 'SMTP') {
      payload.smtpHost = v.smtpHost?.toString().trim() || null;
      payload.smtpPort = v.smtpPort != null ? Number(v.smtpPort) : null;
      payload.smtpUser = v.smtpUser?.toString().trim() || null;
      // Only forward password if the user actually typed one — blank
      // means "keep the existing ciphertext".
      if (v.smtpPassword) payload.smtpPassword = v.smtpPassword;
      payload.smtpFrom = v.smtpFrom?.toString().trim() || null;
    } else if (provider === 'SES') {
      payload.sesRegion = v.sesRegion?.toString().trim() || null;
      payload.sesAccessKeyId = v.sesAccessKeyId?.toString().trim() || null;
      if (v.sesSecretAccessKey) payload.sesSecretAccessKey = v.sesSecretAccessKey;
      payload.sesFrom = v.sesFrom?.toString().trim() || null;
    }
    const res = await this.orgPolicyService.updateEmail(payload);
    if (this.globalService.handleSuccessService(res)) {
      this.emailForm.get('smtpPassword')?.reset('');
      this.emailForm.get('sesSecretAccessKey')?.reset('');
      this.emailForm.markAsPristine();
      // If the user just sent a new secret, mirror that on the local
      // "Configured" badge so they don't see "—" until next reload.
      if (provider === 'SMTP' && v.smtpPassword)
        this.smtpPasswordConfigured = true;
      if (provider === 'SES' && v.sesSecretAccessKey)
        this.sesSecretAccessKeyConfigured = true;
      this.cdr.markForCheck();
    }
  }

  getFieldError(fieldName: string): string {
    const control = this.emailForm.get(fieldName);
    if (!control?.errors || !control.touched) return '';
    if (control.errors['required'])
      return this.translate.instant('VALIDATION.FIELD_REQUIRED');
    if (control.errors['email'])
      return this.translate.instant('VALIDATION.EMAIL_INVALID');
    if (control.errors['maxlength'])
      return this.translate.instant('VALIDATION.MAX_LENGTH', {
        length: control.errors['maxlength'].requiredLength,
      });
    if (control.errors['minlength'])
      return this.translate.instant('VALIDATION.MIN_LENGTH', {
        length: control.errors['minlength'].requiredLength,
      });
    if (control.errors['min'])
      return this.translate.instant('VALIDATION.MIN_VALUE', {
        value: control.errors['min'].min,
      });
    if (control.errors['max'])
      return this.translate.instant('VALIDATION.MAX_VALUE', {
        value: control.errors['max'].max,
      });
    if (control.errors['pattern'])
      return this.translate.instant('VALIDATION.INVALID_FORMAT_REGION');
    return '';
  }
}
