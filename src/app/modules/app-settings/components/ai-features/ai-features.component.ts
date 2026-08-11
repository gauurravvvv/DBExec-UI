import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { AI_WORKSPACE } from 'src/app/core/constants/api.constant';
import { environment } from 'src/environments/environment';
import { SettingsTabForm } from '../../settings-tab-form';
import {
  AI_PROVIDERS,
  suggestedModelsFor,
  type AiProviderId,
  type AiConnectionStyle,
} from '../../ai-provider-registry';

/** Placeholder shown in the API-key field when a key is already stored. */
const KEY_MASK = '••••••••••••••••••••••••';

interface AiConfigResponse {
  aiEnabled: boolean;
  aiProvider: string | null;
  aiConnectionStyle: string | null;
  aiBaseUrl: string | null;
  aiModelId: string | null;
  aiTemperature: number | null;
  aiMaxTokens: number | null;
  aiTimeoutMs: number | null;
  aiApiVersion: string | null;
  aiExtraHeaders: string | null;
  aiApiKeyConfigured: boolean;
}

interface TestResult {
  ok: boolean;
  message: string;
}

/**
 * AI Features — the System Settings tab that configures the org's AI
 * provider. Two providers: Anthropic (locked native transport) and Custom
 * (bring-your-own endpoint — Bedrock, gateways, Ollama, any OpenAI- or
 * Anthropic-compatible service — with a chooseable connection style).
 *
 * The API key is write-only: the BE returns `aiApiKeyConfigured` and never
 * the value, so the field shows a mask when a key is stored and is omitted
 * from the save unless the admin types a new one (empty string clears it).
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
  readonly testing = signal(false);
  readonly testResult = signal<TestResult | null>(null);
  readonly advancedOpen = signal(false);
  readonly suggestedModels = signal<string[]>([]);

  /** The two provider tiles. */
  readonly providers = AI_PROVIDERS;
  keyConfigured = false;

  /** Provider dropdown options (built from the registry). */
  readonly providerOptions = AI_PROVIDERS.map(p => ({
    label: p.id === 'anthropic' ? 'Anthropic' : 'Custom / Bring-your-own',
    value: p.id,
  }));

  /** Connection-style dropdown options (Custom only). */
  readonly connectionStyleOptions = [
    { label: 'Anthropic-native  ·  /v1/messages', value: 'anthropic' },
    { label: 'OpenAI-compatible  ·  /chat/completions', value: 'openai' },
  ];

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
      aiProvider: ['anthropic' as AiProviderId],
      aiConnectionStyle: ['anthropic' as AiConnectionStyle],
      aiBaseUrl: ['', [Validators.pattern(/^https?:\/\/.+/i)]],
      aiModelId: [''],
      aiTemperature: [0.2, [Validators.min(0), Validators.max(1)]],
      aiApiKey: [''],
      // Advanced (all optional)
      aiMaxTokens: [null as number | null, [Validators.min(1)]],
      aiTimeoutMs: [null as number | null, [Validators.min(1000)]],
      aiApiVersion: [''],
      aiExtraHeaders: [''],
    });

    this.form
      .get('aiEnabled')!
      .valueChanges.subscribe(enabled => this.syncRequiredValidators(!!enabled));

    // Provider dropdown change → apply its defaults (style, base URL, models).
    this.form
      .get('aiProvider')!
      .valueChanges.subscribe((id: AiProviderId) =>
        this.applyProviderDefaults(id, /*fromLoad*/ false),
      );
    // Connection-style change → refresh the suggested-model set.
    this.form
      .get('aiConnectionStyle')!
      .valueChanges.subscribe((style: AiConnectionStyle) =>
        this.suggestedModels.set(
          suggestedModelsFor(this.currentProviderId, style),
        ),
      );
    // Any edit invalidates a prior test result.
    this.form.valueChanges.subscribe(() => this.testResult.set(null));

    this.applyProviderDefaults('anthropic', /*fromLoad*/ false);
    this.load();
  }

  /** True when the current provider is Custom (endpoint + style are editable). */
  get isCustom(): boolean {
    return this.form?.get('aiProvider')?.value === 'custom';
  }

  /** Tap a suggested model chip. */
  pickModel(model: string): void {
    this.form.get('aiModelId')?.setValue(model);
    this.form.get('aiModelId')?.markAsDirty();
  }

  toggleAdvanced(): void {
    this.advancedOpen.update(v => !v);
  }

  private get currentProviderId(): AiProviderId {
    return (this.form?.get('aiProvider')?.value as AiProviderId) ?? 'anthropic';
  }

  /**
   * Apply a provider's defaults: connection style, base URL (locked for
   * Anthropic, free for Custom), and suggested models. On load we DON'T
   * overwrite saved values — only seed what the saved config didn't set.
   */
  private applyProviderDefaults(id: AiProviderId, fromLoad: boolean): void {
    const def = AI_PROVIDERS.find(p => p.id === id)!;
    const styleCtl = this.form.get('aiConnectionStyle')!;
    const baseCtl = this.form.get('aiBaseUrl')!;

    if (!fromLoad) {
      styleCtl.setValue(def.defaultConnectionStyle, { emitEvent: false });
      baseCtl.setValue(def.defaultBaseUrl, { emitEvent: false });
    }
    this.suggestedModels.set(
      suggestedModelsFor(id, styleCtl.value as AiConnectionStyle),
    );
  }

  /**
   * Toggle `required` on the config fields with the enable switch (same
   * pattern as SSO). When enabled: provider, base URL (+ shape), model,
   * accuracy (0–1), and API key are required. When off: only shape/range.
   */
  private syncRequiredValidators(enabled: boolean): void {
    const baseUrl = this.form.get('aiBaseUrl')!;
    const model = this.form.get('aiModelId')!;
    const temp = this.form.get('aiTemperature')!;
    const key = this.form.get('aiApiKey')!;
    if (enabled) {
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
      baseUrl.setValidators([Validators.pattern(/^https?:\/\/.+/i)]);
      model.clearValidators();
      temp.setValidators([Validators.min(0), Validators.max(1)]);
      key.clearValidators();
    }
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
            // Map legacy/free provider values → the two-provider model.
            const provider: AiProviderId =
              d.aiProvider === 'anthropic' ? 'anthropic' : 'custom';
            const style: AiConnectionStyle =
              d.aiConnectionStyle === 'anthropic' ||
              d.aiConnectionStyle === 'openai'
                ? d.aiConnectionStyle
                : provider === 'anthropic'
                  ? 'anthropic'
                  : 'openai';
            this.form.reset(
              {
                aiEnabled: !!d.aiEnabled,
                aiProvider: provider,
                aiConnectionStyle: style,
                aiBaseUrl: d.aiBaseUrl ?? '',
                aiModelId: d.aiModelId ?? '',
                aiTemperature: d.aiTemperature ?? 0.2,
                aiApiKey: this.keyConfigured ? KEY_MASK : '',
                aiMaxTokens: d.aiMaxTokens ?? null,
                aiTimeoutMs: d.aiTimeoutMs ?? null,
                aiApiVersion: d.aiApiVersion ?? '',
                aiExtraHeaders: d.aiExtraHeaders ?? '',
              },
              { emitEvent: false },
            );
            this.applyProviderDefaults(provider, /*fromLoad*/ true);
            this.syncRequiredValidators(!!d.aiEnabled);
            if (d.aiMaxTokens || d.aiTimeoutMs || d.aiApiVersion || d.aiExtraHeaders) {
              this.advancedOpen.set(true);
            }
          }
          this.loaded.set(true);
        },
        error: () => this.loaded.set(true),
      });
  }

  /** Pre-flight the provider WITHOUT running a turn (via the BFF). */
  async testConnection(): Promise<void> {
    if (this.testing()) return;
    this.testing.set(true);
    this.testResult.set(null);
    const v = this.form.value;
    const keyValue = (v.aiApiKey ?? '').toString();
    const body: Record<string, unknown> = {
      connectionStyle: v.aiConnectionStyle,
      baseUrl: (v.aiBaseUrl ?? '').toString().trim(),
      modelId: (v.aiModelId ?? '').toString().trim(),
      apiVersion: (v.aiApiVersion ?? '').toString().trim() || undefined,
      extraHeaders: (v.aiExtraHeaders ?? '').toString().trim() || undefined,
      maxTokens: v.aiMaxTokens ?? undefined,
      timeoutMs: v.aiTimeoutMs ?? undefined,
    };
    // Only send the key when the admin typed a real one; the mask means
    // "use the saved key" (the BFF resolves it server-side).
    if (keyValue && keyValue !== KEY_MASK) body['apiKey'] = keyValue.trim();

    try {
      const ai = environment.aiServer;
      const res = ai
        ? await firstValueFrom(
            this.http.apiPost<{ data?: { ok?: boolean; message?: string } }>(
              `${ai.replace(/\/+$/, '')}${AI_WORKSPACE.CONFIG_TEST_BFF}`,
              body,
              {
                skipLoader: true,
                headers: new HttpHeaders({
                  'x-auth-token':
                    StorageService.get(StorageType.ACCESS_TOKEN) || '',
                }),
              },
            ),
          )
        : await firstValueFrom(
            this.http.apiPost<{ data?: { ok?: boolean; message?: string } }>(
              '/ai/config/test',
              body,
              { skipLoader: true },
            ),
          );
      const data = res?.data ?? {};
      this.testResult.set({
        ok: !!data.ok,
        message: data.message ?? (data.ok ? 'Reachable.' : 'Not reachable.'),
      });
    } catch {
      this.testResult.set({
        ok: false,
        message: 'Could not reach the AI service to test.',
      });
    } finally {
      this.testing.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const payload: Record<string, unknown> = {
      aiEnabled: !!v.aiEnabled,
      aiProvider: v.aiProvider || 'anthropic',
      aiConnectionStyle: v.aiConnectionStyle || null,
      aiBaseUrl: (v.aiBaseUrl ?? '').toString().trim(),
      aiModelId: (v.aiModelId ?? '').toString().trim(),
      aiTemperature:
        v.aiTemperature === null || v.aiTemperature === ''
          ? null
          : Number(v.aiTemperature),
      aiMaxTokens:
        v.aiMaxTokens === null || v.aiMaxTokens === ''
          ? null
          : Number(v.aiMaxTokens),
      aiTimeoutMs:
        v.aiTimeoutMs === null || v.aiTimeoutMs === ''
          ? null
          : Number(v.aiTimeoutMs),
      aiApiVersion: (v.aiApiVersion ?? '').toString().trim(),
      aiExtraHeaders: (v.aiExtraHeaders ?? '').toString().trim(),
    };

    // API key: only send when the admin changed it away from the mask.
    const keyValue = (v.aiApiKey ?? '').toString();
    if (keyValue !== KEY_MASK) payload['aiApiKey'] = keyValue.trim();

    this.saving.set(true);
    try {
      const res = await firstValueFrom(
        this.http.apiPut(AI_WORKSPACE.CONFIG, payload),
      );
      if (this.globalService.handleSuccessService(res)) {
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
