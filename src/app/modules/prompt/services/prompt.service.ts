import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { PROMPT } from 'src/app/core/constants/api.constant';
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

  async loadOne(id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(PROMPT.GET + id));
      if (res?.status) this._current.set(res.data);
    } catch {
      this._current.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async loadConfig(id: string): Promise<void> {
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(PROMPT.GET + id + PROMPT.CONFIG_SUFFIX),
      );
      if (res?.status) this._config.set(res.data);
    } catch {
      this._config.set(null);
    }
  }

  async add(promptForm: any): Promise<any> {
    this._saving.set(true);
    try {
      const { datasource, tab, prompts } = promptForm;
      return await lastValueFrom(
        this.http.apiPost(PROMPT.ADD, {
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
      const { id, datasource, tab, section, name, description, status } =
        form.value;
      // PUT /prompts/:promptId
      return await lastValueFrom(
        this.http.apiPut(PROMPT.UPDATE + id, {
          id,
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
      // POST /prompts/:promptId/config — body still carries
      // the full payload; the id is taken from the path.
      return await lastValueFrom(
        this.http.apiPost(PROMPT.GET + data.id + PROMPT.CONFIG_SUFFIX, data),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(PROMPT.DELETE + id, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(PROMPT.BULK_DELETE, { ids, justification }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async getPromptValuesBySQL(params: any): Promise<any> {
    // POST /prompts/:promptId/values
    return lastValueFrom(
      this.http.apiPost(PROMPT.GET + params.promptId + PROMPT.VALUES_SUFFIX, {
        datasourceId: params.datasourceId,
        query: params.query,
      }),
    );
  }

  async refreshPromptValues(params: any): Promise<any> {
    // POST /prompts/:promptId/refresh-values
    return lastValueFrom(
      this.http.apiPost(
        PROMPT.GET + params.promptId + PROMPT.REFRESH_VALUES_SUFFIX,
        {
          datasourceId: params.datasourceId,
          promptId: params.promptId,
        },
      ),
    );
  }

  async updateAppearance(params: any): Promise<any> {
    // PUT /prompts/:promptId/appearance
    return lastValueFrom(
      this.http.apiPut(PROMPT.GET + params.id + PROMPT.APPEARANCE_SUFFIX, {
        id: params.id,
        appearence: params.appearance,
      }),
    );
  }

  async getAppearance(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(PROMPT.GET + id + PROMPT.APPEARANCE_SUFFIX),
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

  deletePrompt(id: string, justification?: string): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(PROMPT.DELETE + id, {
        body: { justification },
      }),
    );
  }

  bulkDeletePrompt(ids: string[], justification?: string): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(PROMPT.BULK_DELETE, { ids, justification }),
    );
  }

  addPrompt(promptForm: any): Promise<any> {
    const { datasource, tab, prompts } = promptForm;
    return lastValueFrom(
      this.http.apiPost(PROMPT.ADD, { datasource, tab, prompts }),
    );
  }

  viewPrompt(id: string): Promise<any> {
    return lastValueFrom(this.http.apiGet(PROMPT.GET + id));
  }

  updatePrompt(promptForm: FormGroup, justification?: string): Promise<any> {
    const { id, datasource, tab, section, name, description, status } =
      promptForm.value;
    return lastValueFrom(
      this.http.apiPut(PROMPT.UPDATE + id, {
        id,
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

  getConfig(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(PROMPT.GET + id + PROMPT.CONFIG_SUFFIX),
    );
  }

  refreshPromptValuesBySQL(params: any): Promise<any> {
    // POST /prompts/:promptId/refresh-values
    return lastValueFrom(
      this.http.apiPost(
        PROMPT.GET + params.promptId + PROMPT.REFRESH_VALUES_SUFFIX,
        {
          datasourceId: params.datasourceId,
          promptId: params.promptId,
        },
      ),
    );
  }

  getAppearence(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(PROMPT.GET + id + PROMPT.APPEARANCE_SUFFIX),
    );
  }
}
