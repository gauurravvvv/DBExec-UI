import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  OrgPolicyService,
  SsoConfigPayload,
} from '../../services/org-policy.service';

/**
 * SSO Settings page — Org Admin only. Configures the org's SAML 2.0
 * IdP so the login screen can offer "Sign in with SSO" for this org.
 *
 * The IdP certificate is DEK-encrypted server-side and NEVER returned;
 * the BE sends `ssoCertificateConfigured` instead. When true, the
 * textarea is pre-filled with a constant mask. On Save the cert is sent
 * ONLY when the admin typed a new value (textarea differs from the
 * mask) — otherwise it's omitted so the stored cert is preserved
 * (matches updateSsoConfig.ts semantics on the BE).
 */

// Constant placeholder shown when a cert is already on file. Sending
// this back verbatim would be meaningless, so the Save path omits the
// cert whenever the textarea still holds exactly this string.
const CERT_MASK = '••••••••••••••••••••••••••••••••';

@Component({
  selector: 'app-sso-settings',
  templateUrl: './sso-settings.component.html',
  styleUrls: ['./sso-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SsoSettingsComponent
  implements OnInit, OnDestroy, HasUnsavedChanges
{
  ssoForm!: FormGroup;
  loading = this.orgPolicyService.loading;
  saving = this.orgPolicyService.saving;

  /** The mask string, exposed so the template can compare / reset. */
  readonly certMask = CERT_MASK;

  /** True when a cert ciphertext is already stored server-side. Drives
   *  the "Configured" badge + the masked prefill. */
  certConfigured = false;

  constructor(
    private fb: FormBuilder,
    private orgPolicyService: OrgPolicyService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.ssoForm.dirty;
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
    this.ssoForm = this.fb.group({
      ssoEnabled: [false],
      ssoIssuer: [''],
      ssoEntryPoint: [''],
      ssoCertificate: [''],
    });
  }

  private async loadPolicy(): Promise<void> {
    // Reuse the cached snapshot if a sibling tab already loaded it;
    // otherwise fetch. getPolicy() is idempotent + signal-backed.
    if (!this.orgPolicyService.current()) {
      await this.orgPolicyService.getPolicy();
    }
    const data = this.orgPolicyService.current();
    if (!data) return;
    this.certConfigured = !!data.ssoCertificateConfigured;
    this.ssoForm.patchValue(
      {
        ssoEnabled: !!data.ssoEnabled,
        ssoIssuer: data.ssoIssuer ?? '',
        ssoEntryPoint: data.ssoEntryPoint ?? '',
        // Prefill the mask when a cert is on file so the admin sees
        // "something is configured" without the ciphertext leaving the
        // server.
        ssoCertificate: this.certConfigured ? CERT_MASK : '',
      },
      { emitEvent: false },
    );
    this.ssoForm.markAsPristine();
    this.cdr.markForCheck();
  }

  async onSave(): Promise<void> {
    if (this.saving()) return;
    const v = this.ssoForm.value;

    const payload: SsoConfigPayload = {
      ssoEnabled: !!v.ssoEnabled,
      ssoIssuer: (v.ssoIssuer ?? '').toString().trim(),
      ssoEntryPoint: (v.ssoEntryPoint ?? '').toString().trim(),
    };

    // Only forward the certificate when the admin actually typed a new
    // one (textarea differs from the mask). Leaving the mask untouched
    // omits the key → the BE keeps the stored ciphertext.
    const certValue = (v.ssoCertificate ?? '').toString();
    if (certValue !== CERT_MASK) {
      payload.ssoCertificate = certValue.trim();
    }

    const res = await this.orgPolicyService.updateSso(payload);
    if (this.globalService.handleSuccessService(res)) {
      // If a new cert was sent, it is now on file — reflect that on the
      // badge + re-mask the textarea so the admin doesn't see their raw
      // paste sitting there (and a subsequent save won't re-send it).
      if (payload.ssoCertificate) {
        this.certConfigured = true;
        this.ssoForm
          .get('ssoCertificate')
          ?.setValue(CERT_MASK, { emitEvent: false });
      } else if (payload.ssoCertificate === '') {
        // Explicitly cleared.
        this.certConfigured = false;
      }
      this.ssoForm.markAsPristine();
      this.cdr.markForCheck();
    }
  }
}
