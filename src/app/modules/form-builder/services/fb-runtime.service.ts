/**
 * FbRuntimeService — HTTP surface for the published-form runtime composer.
 *
 * One hydration call (schema) plus the reused compile pipeline (preview /
 * validate / execute / count). The server is the only component that turns the
 * condition tree into SQL — every call sends the validated tree, never SQL from
 * the browser. Server-mode value typeahead + bulk paste-resolve reuse the prompt
 * value endpoints, so the same qb-value-control fetcher works in both modules.
 */
import { Injectable, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FORM_BUILDER, PROMPT } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

export interface FbRuntimeOpts {
  preview?: boolean;
  asRole?: string;
}

@Injectable({ providedIn: 'root' })
export class FbRuntimeService {
  private readonly http = inject(HttpClientService);

  /** GET /forms/:id/schema[?preview=1&asRole=<roleId>]. */
  getSchema(formId: string, opts?: FbRuntimeOpts): Promise<any> {
    const params: Record<string, string> = {};
    if (opts?.preview) params['preview'] = '1';
    if (opts?.asRole) params['asRole'] = opts.asRole;
    return lastValueFrom(
      this.http.apiGet(FORM_BUILDER.schema(formId), {
        params: Object.keys(params).length ? params : undefined,
        skipLoader: true,
      }),
    );
  }

  /** POST /forms/:id/preview — compile only, returns { sql, paramCount, ... }. */
  preview(formId: string, def: any): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(FORM_BUILDER.preview(formId), def, { skipLoader: true }),
    );
  }

  /** POST /forms/:id/validate — tree + rule report ({ ok, tree, rules }). */
  validate(formId: string, def: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(FORM_BUILDER.validate(formId), def));
  }

  /** POST /forms/:id/execute — compile → run → { columns, rows, rowCount }. */
  execute(formId: string, def: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(FORM_BUILDER.execute(formId), def));
  }

  /** POST /forms/:id/count — count(*) over the compiled query → { total }. */
  count(formId: string, def: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(FORM_BUILDER.count(formId), def));
  }

  // ── Value sourcing (reused from QB — the prompt endpoints both modules share)

  /** Server-paged typeahead for a lookup prompt (spec 6.6.2). */
  searchValues(
    promptId: string,
    body: {
      search?: string;
      page?: number;
      pageSize?: number;
      dependsOn?: Record<string, string[]>;
    },
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(
        PROMPT.GET + promptId + PROMPT.VALUES_SEARCH_SUFFIX,
        body,
        { skipLoader: true },
      ),
    );
  }

  /** Bulk-paste resolution: raw blob -> { matched, unmatched } (spec 6.6.4). */
  resolveValues(promptId: string, raw: string): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(PROMPT.GET + promptId + PROMPT.VALUES_RESOLVE_SUFFIX, {
        raw,
      }),
    );
  }
}
