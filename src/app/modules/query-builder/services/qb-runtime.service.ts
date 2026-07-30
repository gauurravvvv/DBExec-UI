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
import { QUERY_BUILDER } from 'src/app/core/constants/api.constant';
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
    | { kind: 'lookup'; searchable: boolean; pageSize: number }
    | { kind: 'free' };
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
}
