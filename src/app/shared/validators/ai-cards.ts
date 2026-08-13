/**
 * AI Workspace — result-card schemas (clean-room, original).
 *
 * A discriminated union of the cards the engine streams to the client.
 * Every card is validated here at the BE boundary before it goes on the
 * wire; an invalid card degrades to a text note rather than throwing.
 *
 * This file is MIRRORED byte-for-byte into
 *   dbexec-ui/src/app/shared/validators/ai-cards.ts
 * so the FE renderer and BE producer share one contract. Edit both
 * together.
 *
 * Card kinds:
 *   sql            — generated SQL (read/copy/open-in-editor)
 *   result_grid    — rows from a read-only run_query
 *   schema         — introspected schema graph
 *   connections    — the user's connections
 *   table          — a generic list (list_users / list_roles)
 *   dataset_draft  — a proposed dataset (not yet saved)
 *   visual_preview — a proposed chart, rendered via app-echart-visual
 *   confirm        — a write proposal: user Confirm executes an existing
 *                    guarded endpoint. The engine NEVER executes it.
 *   error          — a friendly error note
 */
import { z } from 'zod';

const jsonRecord = z.record(z.string(), z.unknown());

export const sqlCardSchema = z.object({
  kind: z.literal('sql'),
  sql: z.string(),
  connectionId: z.string(),
  explanation: z.string().optional(),
});

export const resultGridCardSchema = z.object({
  kind: z.literal('result_grid'),
  columns: z.array(z.string()),
  rows: z.array(jsonRecord),
  rowCount: z.number(),
  truncated: z.boolean(),
  total: z.number().optional(),
});

const schemaColumnSchema = z.object({ name: z.string(), dataType: z.string() });
const schemaTableSchema = z.object({
  name: z.string(),
  columns: z.array(schemaColumnSchema),
});
const schemaEntrySchema = z.object({
  name: z.string(),
  tables: z.array(schemaTableSchema),
});
export const schemaCardSchema = z.object({
  kind: z.literal('schema'),
  connectionId: z.string(),
  schemas: z.array(schemaEntrySchema),
});

export const connectionsCardSchema = z.object({
  kind: z.literal('connections'),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      datasource: z.string(),
      // Engine/dialect, e.g. postgres | mysql | mssql | oracle | snowflake.
      engine: z.string().optional(),
      // False when the executor cannot run queries on this engine (v1: PG only).
      runnable: z.boolean().optional(),
      isDefault: z.boolean(),
    }),
  ),
});

export const tableCardSchema = z.object({
  kind: z.literal('table'),
  title: z.string(),
  columns: z.array(z.string()),
  rows: z.array(jsonRecord),
  count: z.number(),
});

export const datasetDraftCardSchema = z.object({
  kind: z.literal('dataset_draft'),
  name: z.string(),
  description: z.string().optional(),
  sql: z.string(),
  datasourceId: z.string(),
  /** True when this reflects an EXISTING dataset (read), not a new draft. */
  readOnly: z.boolean().optional(),
});

export const visualPreviewCardSchema = z.object({
  kind: z.literal('visual_preview'),
  chartType: z.string(),
  xAxisColumn: z.string().optional(),
  yAxisColumn: z.string().optional(),
  dimensionColumn: z.string().optional(),
  measureColumn: z.string().optional(),
  aggregate: z.string().optional(),
  config: jsonRecord,
  data: z.array(z.unknown()),
  /** The dataset the visual should be built on, if the user saves it. */
  datasetDraft: datasetDraftCardSchema.optional(),
});

/**
 * A write proposal. The engine builds this card and STOPS — it never
 * mutates. On Confirm the FE posts { endpoint, method, payload } to
 * `POST /ai/confirm`, which re-validates the payload against the
 * proposing tool's schema, re-checks the acting user's RBAC for the
 * action, executes the real guarded endpoint in-process, and audit-logs
 * it (source:'ai'). `destructive` drives the mandatory confirm/typed-
 * confirmation UX for delete/publish/role-grant; `proposalId` lets the
 * FE (and a future server-side proposal cache) tie the executed call
 * back to exactly what was proposed.
 */
export const confirmCardSchema = z.object({
  kind: z.literal('confirm'),
  action: z.string(), // create | update | delete
  entity: z.string(), // user | role | dataset | datasource | savedQuery | ...
  summary: z.string(),
  endpoint: z.string(), // e.g. /users
  method: z.enum(['POST', 'PUT', 'DELETE']),
  payload: jsonRecord,
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  // True for delete / publish / role-grant style actions — the FE gates
  // these behind a mandatory confirm (and may require typed confirmation).
  // Absent is treated as false (non-destructive) by both ends.
  destructive: z.boolean().optional(),
  // Opaque id for this proposal, minted by the proposing tool. Echoed by
  // the FE on Confirm so the executed action is provably the proposed one
  // (and so a short-TTL server-side proposal cache can key on it later).
  proposalId: z.string().optional(),
  // Set true when a confirm card is rehydrated from history — the FE
  // renders it read-only (a stale proposal must not be replayed; the user
  // re-asks to act). Stamped by getConversation on reload.
  inert: z.boolean().optional(),
});

export const errorCardSchema = z.object({
  kind: z.literal('error'),
  message: z.string(),
  hint: z.string().optional(),
});

export const aiCardSchema = z.discriminatedUnion('kind', [
  sqlCardSchema,
  resultGridCardSchema,
  schemaCardSchema,
  connectionsCardSchema,
  tableCardSchema,
  datasetDraftCardSchema,
  visualPreviewCardSchema,
  confirmCardSchema,
  errorCardSchema,
]);

export type AiCard = z.infer<typeof aiCardSchema>;
export type SqlCard = z.infer<typeof sqlCardSchema>;
export type ResultGridCard = z.infer<typeof resultGridCardSchema>;
export type SchemaCard = z.infer<typeof schemaCardSchema>;
export type ConnectionsCard = z.infer<typeof connectionsCardSchema>;
export type TableCard = z.infer<typeof tableCardSchema>;
export type DatasetDraftCard = z.infer<typeof datasetDraftCardSchema>;
export type VisualPreviewCard = z.infer<typeof visualPreviewCardSchema>;
export type ConfirmCard = z.infer<typeof confirmCardSchema>;
export type ErrorCard = z.infer<typeof errorCardSchema>;

/**
 * Validate a card at the boundary. Returns the parsed card, or an error
 * card describing the failure (so a malformed card never crashes the
 * stream).
 */
export function safeCard(card: unknown): AiCard {
  const parsed = aiCardSchema.safeParse(card);
  if (parsed.success) return parsed.data;
  return {
    kind: 'error',
    message: 'The assistant produced a result that could not be displayed.',
  };
}
