import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { CALCULATED_FIELD } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import type {
  AddCalculatedFieldInput,
  CalcFieldDataType,
  UpdateCalculatedFieldInput,
  ValidateCalculatedFieldInput,
} from 'src/app/shared/validators/calculatedFields';

/**
 * A calculated field as returned by the BE. `expression` is the raw
 * whitelisted formula; `dataType` is the declared result type (optional
 * — the BE infers when omitted). The field surfaces back as a usable
 * dataset field once created.
 */
export interface CalculatedField {
  id: string;
  datasetId: string;
  name: string;
  expression: string;
  dataType?: CalcFieldDataType | null;
  [key: string]: unknown;
}

/** Result of the compile-only /validate preview. */
export interface CalcFieldValidateResult {
  valid: boolean;
  message: string;
}

/**
 * CalculatedFieldsService — CRUD + compile-only validate for the
 * safe-expression calculated-field REST surface
 * (POST/GET/PUT/DELETE /calculated-fields...). Mirrors the
 * DatasetService loading-state convention: `loading` for the list read,
 * `saving` for writes, `validating` for the compile preview. All calls
 * pass `{ skipLoader: true }` so the caller drives button spinners
 * instead of the global blocker.
 *
 * The `expression` grammar accepted by the BE (surfaced as helper text
 * in the editor): arithmetic + - * / %, comparisons, AND/OR/NOT, CASE
 * WHEN, CAST, and the functions
 * ABS/ROUND/FLOOR/CEIL/COALESCE/LENGTH/UPPER/LOWER/TRIM/CONCAT plus bare
 * column names. Shape validation (name pattern, length caps) is enforced
 * client-side by the mirrored zod schemas in
 * shared/validators/calculatedFields.ts; the heavy compile against the
 * dataset column list happens server-side.
 */
@Injectable({
  providedIn: 'root',
})
export class CalculatedFieldsService {
  private _loading = signal(false);
  private _saving = signal(false);
  private _validating = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly validating = this._validating.asReadonly();
  readonly deleting = this._deleting.asReadonly();

  isDeleting(id: string): boolean {
    return !!this._deleting()[id];
  }
  private setDeleting(id: string, on: boolean): void {
    const map = { ...this._deleting() };
    if (on) map[id] = true;
    else delete map[id];
    this._deleting.set(map);
  }

  constructor(private http: HttpClientService) {}

  /** GET /calculated-fields/dataset/:datasetId — all calc fields for a dataset. */
  async listForDataset(datasetId: string): Promise<any> {
    this._loading.set(true);
    try {
      return await lastValueFrom(
        this.http.apiGet(CALCULATED_FIELD.LIST_FOR_DATASET_PREFIX + datasetId, {
          skipLoader: true,
        }),
      );
    } finally {
      this._loading.set(false);
    }
  }

  /** POST /calculated-fields — create a calc field. */
  async add(payload: AddCalculatedFieldInput): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(CALCULATED_FIELD.ADD, payload, { skipLoader: true }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /** PUT /calculated-fields/:id — update a calc field. */
  async update(payload: UpdateCalculatedFieldInput): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(CALCULATED_FIELD.UPDATE + payload.id, payload, {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * POST /calculated-fields/validate — compile-only preview. Does not
   * persist; returns the compile error (or ✓) so the editor can show a
   * pre-flight validation banner before Save.
   */
  async validate(payload: ValidateCalculatedFieldInput): Promise<any> {
    this._validating.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(CALCULATED_FIELD.VALIDATE, payload, {
          skipLoader: true,
        }),
      );
    } finally {
      this._validating.set(false);
    }
  }

  /** DELETE /calculated-fields/:id — remove a calc field. */
  async delete(id: string): Promise<any> {
    this.setDeleting(id, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(CALCULATED_FIELD.DELETE + id, {
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(id, false);
    }
  }
}
