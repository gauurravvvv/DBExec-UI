import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { SECTION } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class SectionService {
  private _sections = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly sections = this._sections.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(SECTION.LIST, { params }),
      );
      if (res?.status) {
        this._sections.set(res.data.sections ?? []);
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
        this.http.apiGet(SECTION.VIEW + `${orgId}/${id}`),
      );
      if (res?.status) this._current.set(res.data);
    } catch {
      this._current.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(this.http.apiPost(SECTION.ADD, payload));
    } finally {
      this._saving.set(false);
    }
  }

  async update(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(this.http.apiPut(SECTION.UPDATE, payload));
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
        this.http.apiDelete(SECTION.DELETE + `${orgId}/${id}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  resetCurrent(): void {
    this._current.set(null);
  }

  listSection(params: any) {
    return lastValueFrom(this.http.apiGet(SECTION.LIST, { params }));
  }

  deleteSection(orgId: string, id: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(SECTION.DELETE + `${orgId}/${id}`, {
        body: { justification },
      }),
    );
  }

  bulkDeleteSection(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ) {
    return lastValueFrom(
      this.http.apiDelete(SECTION.BULK_DELETE + orgId, {
        body: { ids, justification },
      }),
    );
  }

  addSection(formData: any) {
    const { organisation, datasource, sections } = formData;
    return lastValueFrom(
      this.http.apiPost(SECTION.ADD, { organisation, datasource, sections }),
    );
  }

  viewSection(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(SECTION.VIEW + `${orgId}/${id}`));
  }

  updateSection(sectionForm: FormGroup, justification?: string) {
    const { id, name, description, organisation, datasource, tab, status } =
      sectionForm.value;
    return lastValueFrom(
      this.http.apiPut(SECTION.UPDATE, {
        id,
        name,
        description,
        organisation,
        datasource,
        tab,
        status: status ? 1 : 0,
        justification,
      }),
    );
  }
}
