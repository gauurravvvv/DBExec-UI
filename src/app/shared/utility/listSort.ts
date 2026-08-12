/**
 * listSort — shared helpers for the standard list-endpoint sort contract.
 *
 * Wire contract:
 *   ?sort=[{"field":"name","order":"asc"},{"field":"status","order":"desc"}]
 *
 * Used by every list endpoint that exposes sortable columns. Each endpoint declares
 * its own whitelist (the columns its FE table can sort on) and a column-name map
 * that translates client-facing field names to TypeORM column references.
 *
 * Why a custom Joi rule rather than two passes: keeps validation in middleware,
 * gives one consistent 400-with-message for every malformed payload, and prevents
 * each controller from re-implementing the parse-then-validate dance.
 */
import { z } from 'zod';

export interface SortEntry<F extends string = string> {
  field: F;
  order: 'asc' | 'desc';
}

/**
 * Zod equivalent of buildSortJoi — the same wire contract
 * (`?sort=<JSON-encoded array>`), same behaviour: JSON-parse the raw
 * string, validate each entry's `field` against the whitelist + `order`
 * against asc/desc, dedupe by field, cap length, then RE-STRINGIFY so the
 * controller keeps treating `req.query.sort` as a string (parse-once via
 * applySort, no surprises).
 *
 * Messages are i18n keys (validation.common.sort.*), resolved by
 * zodValidate. Returns an OPTIONAL schema — a list with no sort is valid
 * (applySort falls back to the default column).
 *
 * @param whitelist Field names the client may sort on. Anything else → 400.
 */
export const buildSortZod = <F extends string>(whitelist: readonly F[]) => {
  const entrySchema = z
    .object({
      field: z.enum(
        whitelist as unknown as [F, ...F[]],
        { message: 'validation.common.sort.field' } as any,
      ),
      order: z.enum(['asc', 'desc'], {
        message: 'validation.common.sort.order',
      } as any),
    })
    .strict();

  return z
    .string()
    .transform((raw, ctx) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.common.sort.json',
        });
        return z.NEVER;
      }
      const arraySchema = z
        .array(entrySchema)
        .max(whitelist.length, { message: 'validation.common.sort.max' })
        .superRefine((entries, c) => {
          const seen = new Set<string>();
          for (const e of entries) {
            if (seen.has(e.field)) {
              c.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'validation.common.sort.unique',
              });
              return;
            }
            seen.add(e.field);
          }
        });
      const res = arraySchema.safeParse(parsed);
      if (!res.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error.issues[0]?.message ?? 'validation.common.sort.json',
        });
        return z.NEVER;
      }
      return JSON.stringify(res.data);
    })
    .optional();
};
