/**
 * ─── MIRRORED FILE ───────────────────────────────────────────────────
 * Duplicated VERBATIM at the same path in the sibling repo:
 *   BE: src/shared/validators/queryBuilderTree.ts
 *   FE: src/app/shared/validators/queryBuilderTree.ts
 *
 * The query-builder condition tree contract. The client sends a validated JSON
 * tree of metadata IDs; the server is the only component that turns IDs into
 * SQL. Both the FE store and the BE execute/preview validators consume this so
 * the shape can never drift.
 * ─────────────────────────────────────────────────────────────────────
 */
import { z } from 'zod';

/**
 * Right-hand side of a condition. Discriminated so the tree never needs
 * versioning when column-to-column and context-token comparison land. v1
 * implements 'literal' only; 'promptRef' and 'context' parse here and are
 * rejected by the compiler validator with NOT_IMPLEMENTED.
 */
export const conditionRhs = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('literal'),
    values: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .max(5000),
  }),
  z.object({
    kind: z.literal('promptRef'),
    promptId: z.string().uuid(),
  }),
  z.object({
    kind: z.literal('context'),
    token: z.enum([
      'current_user_id',
      'current_user_email',
      'current_org_id',
      'today',
      'now',
    ]),
  }),
]);

export const conditionNode = z
  .object({
    kind: z.literal('condition'),
    id: z.string().max(64),
    promptId: z.string().uuid(),
    operatorCode: z.string().max(48),
    negate: z.boolean().default(false),
    rhs: conditionRhs.optional(),
    /** @deprecated shorthand for rhs {kind:'literal', values}. Normalised on read. */
    values: z
      .array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .max(5000)
      .optional(),
  })
  .transform(n => ({
    ...n,
    rhs: n.rhs ?? { kind: 'literal' as const, values: n.values ?? [] },
  }));

export type ConditionNodeInput = z.input<typeof conditionNode>;

// GroupNode is recursive; declare the type then lazily build the schema.
export type GroupNodeShape = {
  kind: 'group';
  id: string;
  op: 'AND' | 'OR';
  negate: boolean;
  children: Array<GroupNodeShape | z.infer<typeof conditionNode>>;
};

export const groupNode: z.ZodType<GroupNodeShape> = z.lazy(() =>
  z.object({
    kind: z.literal('group'),
    id: z.string().max(64),
    op: z.enum(['AND', 'OR']),
    negate: z.boolean().default(false),
    children: z.array(z.union([groupNode, conditionNode])).max(200),
  }),
) as z.ZodType<GroupNodeShape>;

/** Legacy flat prompt input — kept so the current FE keeps working. */
const legacyPromptInput = z.object({
  promptId: z.string().uuid(),
  operatorCode: z.string().max(48).optional(),
  value: z.unknown().optional(),
  values: z.array(z.unknown()).optional(),
});

export const executeQueryBuilderSchema = z.object({
  queryBuilderId: z.string().uuid(),
  treeVersion: z.literal(1).default(1),
  filter: groupNode.nullable().default(null),
  select: z
    .array(
      z.object({
        promptId: z.string().uuid(),
        alias: z
          .string()
          .max(63)
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .optional(),
        aggregate: z
          .enum(['COUNT', 'COUNT_DISTINCT', 'SUM', 'AVG', 'MIN', 'MAX'])
          .optional(),
      }),
    )
    .max(200)
    .default([]),
  sort: z
    .array(
      z.object({
        promptId: z.string().uuid(),
        dir: z.enum(['ASC', 'DESC']),
        nulls: z.enum(['FIRST', 'LAST']).default('LAST'),
      }),
    )
    .max(20)
    .default([]),
  distinct: z.boolean().default(false),
  limit: z.number().int().min(1).max(50000).optional(),
  offset: z.number().int().min(0).max(1_000_000).default(0),

  // legacy flat payload — accepted so addDatasetViaBuilder keeps working
  prompts: z.array(legacyPromptInput).optional(),
});

export type ExecuteQueryBuilderInput = z.input<
  typeof executeQueryBuilderSchema
>;
export type ExecuteQueryBuilder = z.infer<typeof executeQueryBuilderSchema>;

/** Preview shares the execute shape (compile only, never runs). */
export const previewQueryBuilderSchema = executeQueryBuilderSchema;

/** The default-tree PUT accepts just a group (or null). */
export const defaultTreeSchema = z.object({
  defaultConditionTree: groupNode.nullable(),
});
