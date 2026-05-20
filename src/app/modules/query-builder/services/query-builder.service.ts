import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { QUERY_BUILDER, SECTION, TAB } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

export interface ExecuteQueryBuilderRequest {
  queryBuilderId: string;
  organisation: string;
  prompts: {
    promptId: string;
    type: string;
    value: any;
    isRange: boolean;
    startValue: any;
    endValue: any;
  }[];
}

@Injectable({ providedIn: 'root' })
export class QueryBuilderService {
  private _queryBuilders = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _structure = signal<any>(null);
  private _tabs = signal<any[]>([]);
  private _result = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _executing = signal(false);

  readonly queryBuilders = this._queryBuilders.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly structure = this._structure.asReadonly();
  readonly tabs = this._tabs.asReadonly();
  readonly result = this._result.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly executing = this._executing.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(QUERY_BUILDER.LIST, { params }),
      );
      if (res?.status) {
        this._queryBuilders.set(res.data.queryBuilders ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(orgId: string, id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(QUERY_BUILDER.GET + `${orgId}/${id}`),
      );
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async loadStructure(orgId: string, id: string): Promise<void> {
    const res: any = await lastValueFrom(
      this.http.apiGet(QUERY_BUILDER.GET + `${orgId}/${id}` + QUERY_BUILDER.STRUCTURE_SUFFIX),
    );
    if (res?.status) this._structure.set(res.data);
  }

  async loadTabs(orgId: string, queryBuilderId: string): Promise<void> {
    const res: any = await lastValueFrom(
      this.http.apiGet(QUERY_BUILDER.GET + `${orgId}/${queryBuilderId}` + QUERY_BUILDER.TABS_SUFFIX),
    );
    if (res?.status) this._tabs.set(res.data ?? []);
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { organisation, datasource, name, description } = form.value;
      return await lastValueFrom(
        this.http.apiPost(QUERY_BUILDER.ADD, {
          organisation,
          datasource,
          name,
          description,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async update(form: FormGroup, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const { id, name, description, organisation, datasource, status } =
        form.getRawValue();
      // PUT /query-builders/:orgId/:queryBuilderId — id moves to path.
      return await lastValueFrom(
        this.http.apiPut(QUERY_BUILDER.UPDATE + `${organisation}/${id}`, {
          id,
          name,
          description,
          organisation,
          datasource,
          status: status ? 1 : 0,
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async saveConfig(
    configuration: any,
    organisation: string,
    datasourceId: string,
    queryBuilderId: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      // POST /query-builders/:orgId/:queryBuilderId/config
      return await lastValueFrom(
        this.http.apiPost(
          QUERY_BUILDER.GET +
            `${organisation}/${queryBuilderId}` +
            QUERY_BUILDER.CONFIG_SUFFIX,
          { configuration, organisation, datasourceId, queryBuilderId },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async execute(payload: ExecuteQueryBuilderRequest): Promise<any> {
    this._executing.set(true);
    try {
      // POST /query-builders/:orgId/:queryBuilderId/execute
      const res: any = await lastValueFrom(
        this.http.apiPost(
          QUERY_BUILDER.GET +
            `${payload.organisation}/${payload.queryBuilderId}` +
            QUERY_BUILDER.EXECUTE_SUFFIX,
          payload,
        ),
      );
      if (res?.status) this._result.set(res.data);
      return res;
    } finally {
      this._executing.set(false);
    }
  }

  async delete(
    orgId: string,
    id: string,
    justification?: string,
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(QUERY_BUILDER.DELETE + `${orgId}/${id}`, {
        body: { justification },
      }),
    );
  }

  async bulkDelete(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(QUERY_BUILDER.BULK_DELETE_PREFIX + orgId + QUERY_BUILDER.BULK_DELETE_SUFFIX, { ids, justification }),
    );
  }

  async getTabSections(
    orgId: string,
    queryBuilderId: string,
    tabId: string,
  ): Promise<any> {
    // GET /tabs/:orgId/:tabId/sections?queryBuilderId=
    return lastValueFrom(
      this.http.apiGet(
        TAB.SECTIONS_PREFIX +
          `${orgId}/${tabId}` +
          TAB.SECTIONS_SUFFIX +
          `?queryBuilderId=${queryBuilderId}`,
      ),
    );
  }

  async getSectionPrompts(
    orgId: string,
    queryBuilderId: string,
    tabId: string,
    sectionId: string,
  ): Promise<any> {
    // GET /sections/:orgId/:sectionId/prompts?queryBuilderId=&tabId=
    return lastValueFrom(
      this.http.apiGet(
        SECTION.PROMPTS_PREFIX +
          `${orgId}/${sectionId}` +
          SECTION.PROMPTS_SUFFIX +
          `?queryBuilderId=${queryBuilderId}&tabId=${tabId}`,
      ),
    );
  }

  async getQueryBuilderConfiguration(orgId: string, id: string): Promise<any> {
    // GET /query-builders/:orgId/:queryBuilderId/config
    return lastValueFrom(
      this.http.apiGet(
        QUERY_BUILDER.GET + `${orgId}/${id}` + QUERY_BUILDER.CONFIG_SUFFIX,
      ),
    );
  }

  resetCurrent(): void {
    this._current.set(null);
    this._structure.set(null);
    this._result.set(null);
  }

  // Legacy aliases — kept for external callers
  listQueryBuilder(params: any): Promise<any> {
    return lastValueFrom(this.http.apiGet(QUERY_BUILDER.LIST, { params }));
  }

  deleteQueryBuilder(
    orgId: string,
    id: string,
    justification?: string,
  ): Promise<any> {
    return this.delete(orgId, id, justification);
  }

  bulkDeleteQueryBuilder(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    return this.bulkDelete(ids, justification, orgId);
  }

  addQueryBuilder(queryBuilderForm: FormGroup): Promise<any> {
    return this.add(queryBuilderForm);
  }

  viewQueryBuilder(orgId: string, id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(QUERY_BUILDER.GET + `${orgId}/${id}`),
    );
  }

  updateQueryBuilder(
    queryBuilderForm: FormGroup,
    justification?: string,
  ): Promise<any> {
    return this.update(queryBuilderForm, justification);
  }

  saveQueryBuilderConfiguration(
    configuration: any,
    organisation: string,
    datasourceId: string,
    queryBuilderId: string,
  ): Promise<any> {
    return this.saveConfig(
      configuration,
      organisation,
      datasourceId,
      queryBuilderId,
    );
  }

  getQueryBuilderTabs(orgId: string, queryBuilderId: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(QUERY_BUILDER.GET + `${orgId}/${queryBuilderId}` + QUERY_BUILDER.TABS_SUFFIX),
    );
  }

  getQueryBuilderStructure(
    orgId: string,
    queryBuilderId: string,
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(
        QUERY_BUILDER.GET +
          `${orgId}/${queryBuilderId}` +
          QUERY_BUILDER.STRUCTURE_SUFFIX,
      ),
    );
  }

  executeQueryBuilder(payload: ExecuteQueryBuilderRequest): Promise<any> {
    return this.execute(payload);
  }
}
