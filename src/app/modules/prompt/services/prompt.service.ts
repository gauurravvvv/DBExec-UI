import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { PROMPT } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class PromptService {
  private _prompts = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _config = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly prompts = this._prompts.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly config = this._config.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(PROMPT.LIST, { params }),
      );
      if (res?.status) {
        this._prompts.set(res.data.prompts ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch {
      this._prompts.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(orgId: string, id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(PROMPT.GET + `${orgId}/${id}`),
      );
      if (res?.status) this._current.set(res.data);
    } catch {
      this._current.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async loadConfig(orgId: string, id: string): Promise<void> {
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(PROMPT.GET + `${orgId}/${id}` + PROMPT.CONFIG_SUFFIX),
      );
      if (res?.status) this._config.set(res.data);
    } catch {
      this._config.set(null);
    }
  }

  async add(promptForm: any): Promise<any> {
    this._saving.set(true);
    try {
      const { organisation, datasource, tab, prompts } = promptForm;
      return await lastValueFrom(
        this.http.apiPost(PROMPT.ADD, {
          organisation,
          datasource,
          tab,
          prompts,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async update(form: FormGroup, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const {
        id,
        organisation,
        datasource,
        tab,
        section,
        name,
        description,
        status,
      } = form.value;
      // PUT /prompts/:orgId/:promptId
      return await lastValueFrom(
        this.http.apiPut(PROMPT.UPDATE + `${organisation}/${id}`, {
          id,
          organisation,
          datasource,
          tab,
          section,
          name,
          description,
          status: status ? 1 : 0,
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async configPrompt(data: any): Promise<any> {
    this._saving.set(true);
    try {
      // POST /prompts/:orgId/:promptId/config — body still carries
      // the full payload; the id is taken from the path.
      return await lastValueFrom(
        this.http.apiPost(
          PROMPT.GET + `${data.organisation}/${data.id}` + PROMPT.CONFIG_SUFFIX,
          data,
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(
    orgId: string,
    id: string,
    justification?: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(PROMPT.DELETE + `${orgId}/${id}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async bulkDelete(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(PROMPT.BULK_DELETE_PREFIX + orgId + PROMPT.BULK_DELETE_SUFFIX, { ids, justification }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async getPromptValuesBySQL(params: any): Promise<any> {
    // POST /prompts/:orgId/:promptId/values
    return lastValueFrom(
      this.http.apiPost(
        PROMPT.GET +
          `${params.orgId}/${params.promptId}` +
          PROMPT.VALUES_SUFFIX,
        {
          orgId: params.orgId,
          datasourceId: params.datasourceId,
          query: params.query,
        },
      ),
    );
  }

  async refreshPromptValues(params: any): Promise<any> {
    // POST /prompts/:orgId/:promptId/refresh-values
    return lastValueFrom(
      this.http.apiPost(
        PROMPT.GET +
          `${params.orgId}/${params.promptId}` +
          PROMPT.REFRESH_VALUES_SUFFIX,
        {
          organisation: params.orgId,
          datasourceId: params.datasourceId,
          promptId: params.promptId,
        },
      ),
    );
  }

  async updateAppearance(params: any): Promise<any> {
    // PUT /prompts/:orgId/:promptId/appearance
    return lastValueFrom(
      this.http.apiPut(
        PROMPT.GET +
          `${params.orgId}/${params.id}` +
          PROMPT.APPEARANCE_SUFFIX,
        {
          id: params.id,
          organisation: params.orgId,
          appearence: params.appearance,
        },
      ),
    );
  }

  async getAppearance(orgId: string, id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(PROMPT.GET + `${orgId}/${id}` + PROMPT.APPEARANCE_SUFFIX),
    );
  }

  resetCurrent(): void {
    this._current.set(null);
  }
  resetConfig(): void {
    this._config.set(null);
  }

  // Legacy aliases kept for backward compatibility
  listPrompt(params: any): Promise<any> {
    return lastValueFrom(this.http.apiGet(PROMPT.LIST, { params }));
  }

  deletePrompt(
    orgId: string,
    id: string,
    justification?: string,
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(PROMPT.DELETE + `${orgId}/${id}`, {
        body: { justification },
      }),
    );
  }

  bulkDeletePrompt(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(PROMPT.BULK_DELETE_PREFIX + orgId + PROMPT.BULK_DELETE_SUFFIX, { ids, justification }),
    );
  }

  addPrompt(promptForm: any): Promise<any> {
    const { organisation, datasource, tab, prompts } = promptForm;
    return lastValueFrom(
      this.http.apiPost(PROMPT.ADD, { organisation, datasource, tab, prompts }),
    );
  }

  viewPrompt(orgId: string, id: string): Promise<any> {
    return lastValueFrom(this.http.apiGet(PROMPT.GET + `${orgId}/${id}`));
  }

  updatePrompt(promptForm: FormGroup, justification?: string): Promise<any> {
    const {
      id,
      organisation,
      datasource,
      tab,
      section,
      name,
      description,
      status,
    } = promptForm.value;
    return lastValueFrom(
      this.http.apiPut(PROMPT.UPDATE + `${organisation}/${id}`, {
        id,
        organisation,
        datasource,
        tab,
        section,
        name,
        description,
        status: status ? 1 : 0,
        justification,
      }),
    );
  }

  getConfig(orgId: string, id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(PROMPT.GET + `${orgId}/${id}` + PROMPT.CONFIG_SUFFIX),
    );
  }

  refreshPromptValuesBySQL(params: any): Promise<any> {
    // POST /prompts/:orgId/:promptId/refresh-values
    return lastValueFrom(
      this.http.apiPost(
        PROMPT.GET +
          `${params.orgId}/${params.promptId}` +
          PROMPT.REFRESH_VALUES_SUFFIX,
        {
          organisation: params.orgId,
          datasourceId: params.datasourceId,
          promptId: params.promptId,
        },
      ),
    );
  }

  getAppearence(orgId: string, id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(PROMPT.GET + `${orgId}/${id}` + PROMPT.APPEARANCE_SUFFIX),
    );
  }
}
