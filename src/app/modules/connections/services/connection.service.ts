import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { CONNECTIONS } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private _connections = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly connections = this._connections.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(CONNECTIONS.LIST, { params }),
      );
      if (res?.status) {
        this._connections.set(res.data.connections ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(CONNECTIONS.GET + id),
      );
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { datasource, name, description, dbUsername, dbPassword } =
        form.value;
      return await lastValueFrom(
        this.http.apiPost(CONNECTIONS.ADD, {
          datasource,
          name,
          description,
          dbUsername,
          dbPassword,
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
        name,
        description,
        datasource,
        status,
        dbUsername,
        dbPassword,
      } = form.getRawValue();
      return await lastValueFrom(
        this.http.apiPut(CONNECTIONS.UPDATE, {
          id,
          name,
          description,
          datasource,
          status: status ? 1 : 0,
          dbUsername,
          dbPassword,
          justification,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    return await lastValueFrom(
      this.http.apiDelete(CONNECTIONS.DELETE + id, {
        body: { justification },
      }),
    );
  }

  async bulkDelete(
    ids: string[],
    justification?: string,
  ): Promise<any> {
    return await lastValueFrom(
      this.http.apiPost(CONNECTIONS.BULK_DELETE, { ids, justification }),
    );
  }

  resetCurrent() {
    this._current.set(null);
  }

  // Legacy methods for external callers
  listConnection(params: any) {
    return lastValueFrom(this.http.apiGet(CONNECTIONS.LIST, { params }));
  }

  viewConnection(id: string) {
    return lastValueFrom(this.http.apiGet(CONNECTIONS.GET + id));
  }
}
