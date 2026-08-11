/**
 * AI provider registry (FE) — the two-provider model shown in AI Features.
 *
 * Kept intentionally small: 'anthropic' (locked native transport) and
 * 'custom' (bring-your-own — Bedrock, gateways, Ollama, any OpenAI- or
 * Anthropic-compatible endpoint, with a chooseable connection style).
 *
 * The connection style is what actually drives the BFF transport
 * (anthropic → /v1/messages + x-api-key, openai → /chat/completions + Bearer).
 * This mirrors the BFF's transport selection; keep the two in sync.
 */
export type AiProviderId = 'anthropic' | 'custom';
export type AiConnectionStyle = 'anthropic' | 'openai';

export interface AiProviderDef {
  id: AiProviderId;
  /** i18n key for the tile label. */
  labelKey: string;
  /** i18n key for the tile sub-line. */
  subKey: string;
  /** Short glyph shown on the tile. */
  glyph: string;
  /** Default wire format when this provider is picked. */
  defaultConnectionStyle: AiConnectionStyle;
  /** Auto-filled base URL ('' = the admin enters their own). */
  defaultBaseUrl: string;
  /** Whether the base URL is editable (Custom) or locked (Anthropic). */
  baseUrlEditable: boolean;
}

export const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: 'anthropic',
    labelKey: 'APP_SETTINGS.AI_FEATURES.PROVIDER_ANTHROPIC',
    subKey: 'APP_SETTINGS.AI_FEATURES.PROVIDER_ANTHROPIC_SUB',
    glyph: 'AN',
    defaultConnectionStyle: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    baseUrlEditable: false,
  },
  {
    id: 'custom',
    labelKey: 'APP_SETTINGS.AI_FEATURES.PROVIDER_CUSTOM',
    subKey: 'APP_SETTINGS.AI_FEATURES.PROVIDER_CUSTOM_SUB',
    glyph: '··',
    defaultConnectionStyle: 'openai',
    defaultBaseUrl: '',
    baseUrlEditable: true,
  },
];

/** Suggested model quick-picks per (provider, style). Editable — hints only. */
export function suggestedModelsFor(
  id: AiProviderId,
  style: AiConnectionStyle,
): string[] {
  if (id === 'anthropic') {
    return ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'];
  }
  // Custom: suggestions depend on the wire format the admin chose.
  return style === 'anthropic'
    ? ['claude-sonnet-4-6', 'glm-4.7', 'anthropic.claude-opus-4-8']
    : ['gpt-4o', 'gpt-4o-mini', 'llama3.2', 'glm-4.7'];
}
