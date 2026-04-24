import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { PROMPT } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class PromptService {
  constructor(private http: HttpClientService) {}

  listPrompt(params: any) {
    return lastValueFrom(this.http.apiGet(PROMPT.LIST, { params }));
  }

  deletePrompt(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(PROMPT.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  bulkDeletePrompt(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(PROMPT.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  addPrompt(promptForm: any) {
    const { organisation, datasource, tab, prompts } = promptForm;
    return lastValueFrom(this.http.apiPost(PROMPT.ADD, { organisation, datasource, tab, prompts }));
  }

  viewPrompt(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(PROMPT.VIEW + `${orgId}/${id}`));
  }

  updatePrompt(promptForm: FormGroup, justification?: string) {
    const { id, organisation, datasource, tab, section, name, description, status } = promptForm.value;
    return lastValueFrom(this.http.apiPut(PROMPT.UPDATE, {
      id, organisation, datasource, tab, section, name, description,
      status: status ? 1 : 0,
      justification,
    }));
  }

  configPrompt(promptConfigData: any) {
    const {
      id, organisation, schema, tables, columns,
      promptJoin, promptWhere, promptValues, promptSql, promptValueSQL,
    } = promptConfigData;
    return lastValueFrom(this.http.apiPost(PROMPT.CONFIG, {
      id, organisation, schema, tables, columns,
      promptJoin, promptWhere, promptValues, promptSql, promptValueSQL,
    }));
  }

  getConfig(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(PROMPT.GET_CONFIG + `${orgId}/${id}`));
  }

  getPromptValuesBySQL(params: any) {
    return lastValueFrom(this.http.apiPost(PROMPT.GET_PROMPT_VALUES_BY_SQL, {
      orgId: params.orgId,
      datasourceId: params.datasourceId,
      query: params.query,
    }));
  }

  refreshPromptValuesBySQL(params: any) {
    return lastValueFrom(this.http.apiPut(PROMPT.REFRSH_PROMPT_VALUES_BY_SQL, {
      organisation: params.orgId,
      datasourceId: params.datasourceId,
      promptId: params.promptId,
    }));
  }

  updateAppearance(params: any) {
    return lastValueFrom(this.http.apiPut(PROMPT.UPDATE_APPEARANCE, {
      id: params.id,
      organisation: params.orgId,
      appearence: params.appearance,
    }));
  }

  getAppearence(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(PROMPT.GET_APPEARANCE + `${orgId}/${id}`));
  }
}
