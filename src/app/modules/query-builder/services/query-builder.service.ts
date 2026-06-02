import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import {
  QUERY_BUILDER,
  SECTION,
  TAB,
} from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

export interface ExecuteQueryBuilderRequest {
  queryBuilderId: string;
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

  // Reads pipe through this Subject so callers (view/edit/list/add
  // query-builder ngOnDestroy) can cancel in-flight GETs. Mutations
  // and execute() don't pipe through.
  private _cancelReads$ = new Subject<void>();

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
        this.http
          .apiGet(QUERY_BUILDER.LIST, { params })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._queryBuilders.set(res.data.queryBuilders ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(QUERY_BUILDER.GET + id)
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadStructure(id: string): Promise<void> {
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(QUERY_BUILDER.GET + id + QUERY_BUILDER.STRUCTURE_SUFFIX)
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._structure.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    }
  }

  async loadTabs(queryBuilderId: string): Promise<void> {
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(
            QUERY_BUILDER.GET + queryBuilderId + QUERY_BUILDER.TABS_SUFFIX,
          )
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._tabs.set(res.data ?? []);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    }
  }

  /**
   * Cancel any in-flight read GETs. Components call this from
   * ngOnDestroy so the XHR is aborted when the user navigates away.
   */
  cancelReads() {
    this._cancelReads$.next();
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { datasource, name, description } = form.value;
      return await lastValueFrom(
        this.http.apiPost(QUERY_BUILDER.ADD, {
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
      const { id, name, description, datasource, status } = form.getRawValue();
      // PUT /query-builders/:queryBuilderId — id moves to path.
      return await lastValueFrom(
        this.http.apiPut(QUERY_BUILDER.UPDATE + id, {
          id,
          name,
          description,
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
    datasourceId: string,
    queryBuilderId: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      // POST /query-builders/:queryBuilderId/config
      return await lastValueFrom(
        this.http.apiPost(
          QUERY_BUILDER.GET + queryBuilderId + QUERY_BUILDER.CONFIG_SUFFIX,
          { configuration, datasourceId, queryBuilderId },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async execute(payload: ExecuteQueryBuilderRequest): Promise<any> {
    this._executing.set(true);
    try {
      // POST /query-builders/:queryBuilderId/execute
      const res: any = await lastValueFrom(
        this.http.apiPost(
          QUERY_BUILDER.GET +
            payload.queryBuilderId +
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

  async delete(id: string, justification?: string): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(QUERY_BUILDER.DELETE + id, {
        body: { justification },
      }),
    );
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(QUERY_BUILDER.BULK_DELETE, { ids, justification }),
    );
  }

  async getTabSections(queryBuilderId: string, tabId: string): Promise<any> {
    // GET /tabs/:tabId/sections?queryBuilderId=
    return lastValueFrom(
      this.http.apiGet(
        TAB.SECTIONS_PREFIX +
          tabId +
          TAB.SECTIONS_SUFFIX +
          `?queryBuilderId=${queryBuilderId}`,
      ),
    );
  }

  async getSectionPrompts(
    queryBuilderId: string,
    tabId: string,
    sectionId: string,
  ): Promise<any> {
    // GET /sections/:sectionId/prompts?queryBuilderId=&tabId=
    return lastValueFrom(
      this.http.apiGet(
        SECTION.PROMPTS_PREFIX +
          sectionId +
          SECTION.PROMPTS_SUFFIX +
          `?queryBuilderId=${queryBuilderId}&tabId=${tabId}`,
      ),
    );
  }

  async getQueryBuilderConfiguration(id: string): Promise<any> {
    // GET /query-builders/:queryBuilderId/config
    return lastValueFrom(
      this.http.apiGet(QUERY_BUILDER.GET + id + QUERY_BUILDER.CONFIG_SUFFIX),
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

  deleteQueryBuilder(id: string, justification?: string): Promise<any> {
    return this.delete(id, justification);
  }

  bulkDeleteQueryBuilder(ids: string[], justification?: string): Promise<any> {
    return this.bulkDelete(ids, justification);
  }

  addQueryBuilder(queryBuilderForm: FormGroup): Promise<any> {
    return this.add(queryBuilderForm);
  }

  viewQueryBuilder(id: string): Promise<any> {
    return lastValueFrom(this.http.apiGet(QUERY_BUILDER.GET + id));
  }

  updateQueryBuilder(
    queryBuilderForm: FormGroup,
    justification?: string,
  ): Promise<any> {
    return this.update(queryBuilderForm, justification);
  }

  saveQueryBuilderConfiguration(
    configuration: any,
    datasourceId: string,
    queryBuilderId: string,
  ): Promise<any> {
    return this.saveConfig(configuration, datasourceId, queryBuilderId);
  }

  getQueryBuilderTabs(queryBuilderId: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(
        QUERY_BUILDER.GET + queryBuilderId + QUERY_BUILDER.TABS_SUFFIX,
      ),
    );
  }

  getQueryBuilderStructure(queryBuilderId: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(
        QUERY_BUILDER.GET + queryBuilderId + QUERY_BUILDER.STRUCTURE_SUFFIX,
      ),
    );
  }

  executeQueryBuilder(payload: ExecuteQueryBuilderRequest): Promise<any> {
    return this.execute(payload);
  }
}
