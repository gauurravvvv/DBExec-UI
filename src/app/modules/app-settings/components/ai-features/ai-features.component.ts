import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { AI_WORKSPACE } from 'src/app/core/constants/api.constant';
import { SettingsTabForm } from '../../settings-tab-form';

/** Placeholder shown in the API-key field when a key is already stored. */
const KEY_MASK = '••••••••••••••••••••••••';

interface AiConfigResponse {
  aiEnabled: boolean;
  aiProvider: string | null;
  aiBaseUrl: string | null;
  aiModelId: string | null;
  aiTemperature: number | null;
  aiApiKeyConfigured: boolean;
}

/**
 * AI Features — the System Settings tab that configures the org's AI
 * Workspace: enable toggle, provider, base URL, model, accuracy
 * (temperature), and the provider API key. The key is write-only: the BE
 * returns `aiApiKeyConfigured` and never the value, so the field shows a
 * mask when a key is stored and is omitted from the save unless the admin
 * types a new one (empty string clears it) — mirrors the SSO cert form.
 */
@Component({
  selector: 'app-ai-features',
  templateUrl: './ai-features.component.html',
  styleUrls: ['./ai-features.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiFeaturesComponent implements OnInit, SettingsTabForm {
  form!: FormGroup;
  readonly saving = signal(false);
  readonly loaded = signal(false);
  /** True when a key is already stored — drives the mask + "Configured" tag. */
  keyConfigured = false;

  // SettingsTabForm — lets the hub's single Save button drive this tab.
  onSave(): void {
    this.save();
  }
  get dirty(): boolean {
    return !!this.form?.dirty;
  }
  get busy(): boolean {
    return this.saving();
  }

  constructor(
    private fb: FormBuilder,
    private http: HttpClientService,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      aiEnabled: [false],
      aiProvider: ['openai-compat'],
      // Base URL is always URL-shaped when present; required-ness is layered
      // on by syncRequiredValidators when AI is enabled.
      aiBaseUrl: ['', [Validators.pattern(/^https?:\/\/.+/i)]],
      aiModelId: [''],
      // Accuracy (temperature) is 0–1; always range-checked, required when on.
      aiTemperature: [0.2, [Validators.min(0), Validators.max(1)]],
      aiApiKey: [''],
    });
    // Config fields are only meaningful when AI is ON — make them required
    // then, optional when off (same pattern as SSO). The API key field holds
    // a mask when already configured, which satisfies `required`.
    this.form
      .get('aiEnabled')!
      .valueChanges.subscribe(enabled =>
        this.syncRequiredValidators(!!enabled),
      );
    this.load();
  }

  /**
   * Toggle `required` on the AI config fields with the enable switch. When
   * enabled: provider, base URL (+ URL shape), model, accuracy (+ 0–1 range),
   * and API key are all required. When disabled: only the shape/range checks
   * remain so a saved-but-off config isn't blocked. emitEvent:false avoids
   * re-triggering the toggle subscription.
   */
  private syncRequiredValidators(enabled: boolean): void {
    const provider = this.form.get('aiProvider')!;
    const baseUrl = this.form.get('aiBaseUrl')!;
    const model = this.form.get('aiModelId')!;
    const temp = this.form.get('aiTemperature')!;
    const key = this.form.get('aiApiKey')!;
    if (enabled) {
      provider.setValidators([Validators.required]);
      baseUrl.setValidators([
        Validators.required,
        Validators.pattern(/^https?:\/\/.+/i),
      ]);
      model.setValidators([Validators.required]);
      temp.setValidators([
        Validators.required,
        Validators.min(0),
        Validators.max(1),
      ]);
      key.setValidators([Validators.required]);
    } else {
      provider.clearValidators();
      baseUrl.setValidators([Validators.pattern(/^https?:\/\/.+/i)]);
      model.clearValidators();
      temp.setValidators([Validators.min(0), Validators.max(1)]);
      key.clearValidators();
    }
    provider.updateValueAndValidity({ emitEvent: false });
    baseUrl.updateValueAndValidity({ emitEvent: false });
    model.updateValueAndValidity({ emitEvent: false });
    temp.updateValueAndValidity({ emitEvent: false });
    key.updateValueAndValidity({ emitEvent: false });
  }

  private load(): void {
    this.http
      .apiGet<{ data?: AiConfigResponse }>(AI_WORKSPACE.CONFIG, {
        skipLoader: true,
      })
      .subscribe({
        next: res => {
          const d = res?.data;
          if (d) {
            this.keyConfigured = !!d.aiApiKeyConfigured;
            this.form.reset(
              {
                aiEnabled: !!d.aiEnabled,
                aiProvider: d.aiProvider ?? 'openai-compat',
                aiBaseUrl: d.aiBaseUrl ?? '',
                aiModelId: d.aiModelId ?? '',
                aiTemperature: d.aiTemperature ?? 0.2,
                aiApiKey: this.keyConfigured ? KEY_MASK : '',
              },
              { emitEvent: false },
            );
            // reset with emitEvent:false skips the toggle subscription, so
            // apply the required-validators for the loaded enabled state.
            this.syncRequiredValidators(!!d.aiEnabled);
          }
          this.loaded.set(true);
        },
        error: () => this.loaded.set(true),
      });
  }

  async save(): Promise<void> {
    // Block save on invalid config (e.g. AI enabled but a required field
    // missing / bad URL / accuracy out of 0–1) and surface the errors.
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const payload: Record<string, unknown> = {
      aiEnabled: !!v.aiEnabled,
      aiProvider: v.aiProvider || '',
      aiBaseUrl: (v.aiBaseUrl ?? '').toString().trim(),
      aiModelId: (v.aiModelId ?? '').toString().trim(),
      aiTemperature:
        v.aiTemperature === null || v.aiTemperature === ''
          ? null
          : Number(v.aiTemperature),
    };

    // API key: only send when the admin actually changed it away from the
    // mask. Typed value → set; explicit empty → clear; mask left as-is → omit.
    const keyValue = (v.aiApiKey ?? '').toString();
    if (keyValue !== KEY_MASK) {
      payload['aiApiKey'] = keyValue.trim();
    }

    this.saving.set(true);
    try {
      const res = await firstValueFrom(
        this.http.apiPut(AI_WORKSPACE.CONFIG, payload),
      );
      // Surfaces the BE's localized success message as a toast (same as the
      // SSO / Email / Security tabs) — only proceed on a real success.
      if (this.globalService.handleSuccessService(res)) {
        // If a real key was sent, reflect "configured" + re-mask the field.
        if (payload['aiApiKey']) {
          this.keyConfigured = true;
          this.form.get('aiApiKey')?.setValue(KEY_MASK, { emitEvent: false });
        } else if (payload['aiApiKey'] === '') {
          this.keyConfigured = false;
        }
        this.form.markAsPristine();
      }
    } finally {
      this.saving.set(false);
    }
  }
}
