/**
 * QbAdminService — the HTTP surface for the Query Builder v2 admin screens.
 *
 * Kept separate from qb-runtime.service (business-user hydration + compile) and
 * from the legacy query-builder.service (tab/section CRUD): these are the form
 * design endpoints — settings, placements, joins, output columns, default tree,
 * clone and publish. The API-path constants already exist in QUERY_BUILDER; this
 * service is the typed client for them.
 */
import { Injectable, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { PROMPT, QUERY_BUILDER } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { PromptAppearance } from 'src/app/shared/validators/promptAppearance';

// ── Wire types (kept loose where the server shape is still settling) ──────

export interface QbSettings {
  defaultLimit: number;
  maxLimit: number;
  forceDistinct: boolean;
  mandatoryFilter: any | null;
  usesOperatorEngine: boolean;
  baseSchema: string | null;
  baseTable: string | null;
  baseAlias: string | null;
}

export interface QbPlacement {
  promptId: string;
  groupLabel: string | null;
  groupSequence: number;
  promptSequence: number;
  isMandatory: boolean;
  isLocked: boolean;
  displayNameOverride?: string | null;
  appearanceOverride?: Record<string, any> | null;
}

export interface QbJoin {
  id?: string;
  joinType: string;
  leftAlias: string;
  leftColumn: string;
  rightSchema: string;
  rightTable: string;
  rightAlias: string;
  rightColumn: string;
  cardinality: string;
  sequence: number;
}

export interface QbOutputColumn {
  expr: string;
  alias: string;
  sequence: number;
}

@Injectable({ providedIn: 'root' })
export class QbAdminService {
  private readonly http = inject(HttpClientService);

  private get(path: string): Promise<any> {
    return lastValueFrom(this.http.apiGet(path));
  }
  private put(path: string, body: any): Promise<any> {
    return lastValueFrom(this.http.apiPut(path, body));
  }
  private post(path: string, body: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(path, body));
  }

  // ── Settings ──────────────────────────────────────────────────────────

  getSettings(id: string): Promise<any> {
    return this.get(QUERY_BUILDER.GET + id + QUERY_BUILDER.SETTINGS_SUFFIX);
  }
  saveSettings(id: string, settings: Partial<QbSettings>): Promise<any> {
    return this.put(
      QUERY_BUILDER.GET + id + QUERY_BUILDER.SETTINGS_SUFFIX,
      settings,
    );
  }

  // ── Placements (the form designer) ────────────────────────────────────

  getPlacements(id: string): Promise<any> {
    return this.get(QUERY_BUILDER.GET + id + '/prompts');
  }
  savePlacements(id: string, placements: QbPlacement[]): Promise<any> {
    return this.put(QUERY_BUILDER.GET + id + '/prompts', { placements });
  }

  // ── Joins ─────────────────────────────────────────────────────────────

  getJoins(id: string): Promise<any> {
    return this.get(QUERY_BUILDER.GET + id + QUERY_BUILDER.JOINS_SUFFIX);
  }
  saveJoins(id: string, joins: QbJoin[]): Promise<any> {
    return this.put(QUERY_BUILDER.GET + id + QUERY_BUILDER.JOINS_SUFFIX, {
      joins,
    });
  }

  // ── Output columns ────────────────────────────────────────────────────

  getOutputColumns(id: string): Promise<any> {
    return this.get(
      QUERY_BUILDER.GET + id + QUERY_BUILDER.OUTPUT_COLUMNS_SUFFIX,
    );
  }
  saveOutputColumns(id: string, outputColumns: QbOutputColumn[]): Promise<any> {
    return this.put(
      QUERY_BUILDER.GET + id + QUERY_BUILDER.OUTPUT_COLUMNS_SUFFIX,
      { outputColumns },
    );
  }

  // ── Default tree ──────────────────────────────────────────────────────

  getDefaultTree(id: string): Promise<any> {
    return this.get(QUERY_BUILDER.GET + id + QUERY_BUILDER.DEFAULT_TREE_SUFFIX);
  }
  saveDefaultTree(id: string, tree: any): Promise<any> {
    return this.put(QUERY_BUILDER.GET + id + QUERY_BUILDER.DEFAULT_TREE_SUFFIX, {
      defaultConditionTree: tree,
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  clone(id: string): Promise<any> {
    return this.post(QUERY_BUILDER.GET + id + '/clone', {});
  }
  publish(id: string): Promise<any> {
    return this.post(QUERY_BUILDER.GET + id + '/publish', {});
  }

  // ── Prompt appearance (admin) ─────────────────────────────────────────

  savePromptAppearance(
    promptId: string,
    appearance: PromptAppearance,
  ): Promise<any> {
    return this.put(PROMPT.GET + promptId + PROMPT.APPEARANCE_SUFFIX, {
      appearance,
    });
  }
  getPromptAppearance(promptId: string): Promise<any> {
    return this.get(PROMPT.GET + promptId + PROMPT.APPEARANCE_SUFFIX);
  }

  // ── Prompt library (for the designer palette) ─────────────────────────

  listPrompts(datasourceId: string, search = ''): Promise<any> {
    const params: Record<string, any> = {
      datasourceId,
      page: 1,
      pageSize: 500,
    };
    if (search) params['filter'] = JSON.stringify({ name: search });
    return lastValueFrom(
      this.http.apiGet(PROMPT.LIST, { params, skipLoader: true }),
    );
  }
}
