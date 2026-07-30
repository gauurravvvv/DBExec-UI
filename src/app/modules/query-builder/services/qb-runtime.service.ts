/**
 * QbRuntimeService — the HTTP surface for the business-user query composer.
 *
 * One hydration call (schema) plus the compile pipeline (preview / validate /
 * execute / count). The server is the only component that turns the condition
 * tree into SQL, so every call sends the validated tree and receives either SQL
 * text (preview) or rows (execute) — never SQL built in the browser.
 */
import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { PROMPT, QUERY_BUILDER } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

export interface QbSchemaResponse {
  queryBuilder: {
    id: string;
    name: string;
    description: string;
    datasourceId: string;
    defaultLimit: number;
    maxLimit: number;
    forceDistinct: boolean;
    usesOperatorEngine: boolean;
    canEdit: boolean;
    sharedWithMe: boolean;
  };
  logicalOperators: { code: string; label: string }[];
  groups: QbSchemaGroup[];
  defaultConditionTree: any | null;
}

export interface QbSchemaGroup {
  groupLabel: string | null;
  groupSequence: number;
  prompts: QbSchemaPrompt[];
}

export interface QbSchemaPrompt {
  placementId: string;
  promptId: string;
  displayName: string;
  description: string;
  type: string;
  dataType: string | null;
  isMandatory: boolean;
  isLocked: boolean;
  isSelectable: boolean;
  isFilterable: boolean;
  isSortable: boolean;
  appearance: any;
  operators: { code: string; label: string; arity: string }[];
  valueSource:
    | { kind: 'static'; values: { value: string; display: string }[] }
    | {
        kind: 'lookup';
        searchable: boolean;
        pageSize: number;
        dependsOn?: string[];
      }
    | { kind: 'free' };
}

export interface QbValueOption {
  value: string;
  display: string;
}

export interface QbValueSearchResponse {
  options: QbValueOption[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface QbValueResolveResponse {
  matched: QbValueOption[];
  unmatched: string[];
  total: number;
}

export interface QbPreviewResponse {
  sql: string;
  paramCount: number;
  joinsUsed: string[];
  warnings: string[];
}

export interface QbExecuteResponse {
  columns: string[];
  rows: any[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export interface QbTreeError {
  nodeId: string;
  code: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class QbRuntimeService {
  constructor(private readonly http: HttpClientService) {}

  getSchema(queryBuilderId: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(
        `${QUERY_BUILDER.GET}${queryBuilderId}${QUERY_BUILDER.SCHEMA_SUFFIX}`,
      ),
    );
  }

  preview(definition: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(QUERY_BUILDER.PREVIEW, definition));
  }

  validate(definition: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(QUERY_BUILDER.VALIDATE, definition));
  }

  execute(definition: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(QUERY_BUILDER.RUN, definition));
  }

  count(definition: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(QUERY_BUILDER.COUNT, definition));
  }

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
