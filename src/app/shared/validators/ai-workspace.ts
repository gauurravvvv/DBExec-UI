/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * This file is duplicated VERBATIM at the same path in the sibling repo
 * (dbexec-api ↔ dbexec-ui). Edit BOTH when changing any rule.
 *
 *   BE: src/shared/validators/ai-workspace.ts
 *   FE: src/app/shared/validators/ai-workspace.ts
 *
 * See organisation.ts for the convention overview.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

// ── Internal helpers ───────────────────────────────────────────────

const trimOrUndefined = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  return v;
};

// ── Schemas ────────────────────────────────────────────────────────

/**
 * Validates the /ai/confirm body — the OUTER envelope only.
 *
 * This checks that the request names a proposal to execute:
 *   - endpoint: required, non-empty, <=256 chars (router-relative path)
 *   - method:   required, one of POST | PUT | DELETE
 *   - payload:  required object (the body to send to the real endpoint)
 *   - proposalId: optional, <=128 chars (opaque id echoed from the card)
 *
 * It does NOT validate the payload's SHAPE — that is done in the
 * controller against the proposing tool's authoritative Zod schema (the
 * real endpoint validator), resolved from the confirm registry once the
 * (method, endpoint) pair is matched.
 */
export const confirmSchema = z.object({
  endpoint: z
    .string({ message: 'validation.aiWorkspace.confirm.endpoint.required' })
    .min(1, { message: 'validation.aiWorkspace.confirm.endpoint.required' })
    .max(256, { message: 'validation.aiWorkspace.confirm.endpoint.tooLong' }),
  method: z
    .string({ message: 'validation.aiWorkspace.confirm.method.required' })
    .toUpperCase()
    .refine((v) => ['POST', 'PUT', 'DELETE'].includes(v), {
      message: 'validation.aiWorkspace.confirm.method.invalid',
    }),
  payload: z
    .record(z.string(), z.any())
    .refine((v) => typeof v === 'object' && v !== null, {
      message: 'validation.aiWorkspace.confirm.payload.required',
    }),
  proposalId: z
    .string({ message: 'validation.aiWorkspace.confirm.proposalId.invalid' })
    .max(128, { message: 'validation.aiWorkspace.confirm.proposalId.tooLong' })
    .optional(),
});

export type ConfirmInput = z.infer<typeof confirmSchema>;

/**
 * Validates the AI config patch. All fields optional (partial patch).
 *
 * - aiEnabled: boolean
 * - aiProvider: <=32 chars; empty string clears (v1 expects 'openai-compat')
 * - aiConnectionStyle: 'anthropic' | 'openai' | empty/null to clear
 * - aiBaseUrl: http(s) URL <=512; empty string clears
 * - aiModelId: <=128 chars; empty string clears
 * - aiTemperature: number 0..1; null clears
 * - aiApiKey: <=4096 chars; empty string clears; omit keeps existing ciphertext
 * - aiMaxTokens: integer 1..200000; null clears
 * - aiTimeoutMs: integer 1000..600000; null clears
 * - aiApiVersion: <=32 chars; empty/null clears
 * - aiExtraHeaders: JSON object string or empty/null to clear
 */
export const putConfigSchema = z
  .object({
    aiEnabled: z.boolean().optional(),
    aiProvider: z
      .string()
      .max(32, { message: 'validation.aiWorkspace.config.aiProvider.tooLong' })
      .optional(),
    aiConnectionStyle: z
      .enum(['anthropic', 'openai'], {
        message: 'validation.aiWorkspace.config.aiConnectionStyle.invalid',
      })
      .or(z.literal(''))
      .or(z.null())
      .optional(),
    aiBaseUrl: z
      .string()
      .url({ message: 'validation.aiWorkspace.config.aiBaseUrl.invalid' })
      .max(512, { message: 'validation.aiWorkspace.config.aiBaseUrl.tooLong' })
      .or(z.literal(''))
      .optional(),
    aiModelId: z
      .string()
      .max(128, { message: 'validation.aiWorkspace.config.aiModelId.tooLong' })
      .optional(),
    aiTemperature: z
      .number({ message: 'validation.aiWorkspace.config.aiTemperature.invalid' })
      .min(0, {
        message: 'validation.aiWorkspace.config.aiTemperature.invalid',
      })
      .max(1, { message: 'validation.aiWorkspace.config.aiTemperature.invalid' })
      .or(z.null())
      .optional(),
    aiApiKey: z
      .string()
      .max(4096, { message: 'validation.aiWorkspace.config.aiApiKey.tooLong' })
      .optional(),
    aiMaxTokens: z
      .number({
        message: 'validation.aiWorkspace.config.aiMaxTokens.invalid',
      })
      .int({ message: 'validation.aiWorkspace.config.aiMaxTokens.invalid' })
      .min(1, { message: 'validation.aiWorkspace.config.aiMaxTokens.invalid' })
      .max(200000, {
        message: 'validation.aiWorkspace.config.aiMaxTokens.invalid',
      })
      .or(z.null())
      .optional(),
    aiTimeoutMs: z
      .number({
        message: 'validation.aiWorkspace.config.aiTimeoutMs.invalid',
      })
      .int({ message: 'validation.aiWorkspace.config.aiTimeoutMs.invalid' })
      .min(1000, {
        message: 'validation.aiWorkspace.config.aiTimeoutMs.invalid',
      })
      .max(600000, {
        message: 'validation.aiWorkspace.config.aiTimeoutMs.invalid',
      })
      .or(z.null())
      .optional(),
    aiApiVersion: z
      .string()
      .max(32, {
        message: 'validation.aiWorkspace.config.aiApiVersion.tooLong',
      })
      .or(z.literal(''))
      .or(z.null())
      .optional(),
    aiExtraHeaders: z
      .string()
      .max(4096, {
        message: 'validation.aiWorkspace.config.aiExtraHeaders.tooLong',
      })
      .refine(
        (v) => {
          if (v === '' || v === null || v === undefined) return true;
          try {
            const parsed = JSON.parse(v);
            return (
              typeof parsed === 'object' &&
              parsed !== null &&
              !Array.isArray(parsed)
            );
          } catch {
            return false;
          }
        },
        { message: 'validation.aiWorkspace.config.aiExtraHeaders.invalid' },
      )
      .or(z.literal(''))
      .or(z.null())
      .optional(),
  })
  .refine(
    (obj) => Object.keys(obj).length > 0,
    { message: 'validation.aiWorkspace.config.atLeastOneField' },
  );

export type PutConfigInput = z.infer<typeof putConfigSchema>;
