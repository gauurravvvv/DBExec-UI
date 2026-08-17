/**
 * FormPortabilityService — the Phase 8 portability HTTP client for the Form
 * Builder: export a version to a downloaded JSON document, import a document
 * into a new family + draft, save a version as a reusable org template, list /
 * clone templates. Signal-based busy state so buttons spin without the global
 * overlay.
 *
 * Export streams a FILE DOWNLOAD (not the `{status,code,message,data}`
 * envelope), so — exactly like MigrationService — we request the response as a
 * Blob and read the filename from Content-Disposition. A FAILED export returns
 * the envelope as a JSON Blob; we detect the non-OK envelope and surface its
 * `message`. The request interceptor only unwraps envelope codes 440/501/503,
 * so a genuine bundle Blob passes through untouched (no interceptor widening).
 */
import { HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FORM_BUILDER } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { downloadBlob } from 'src/app/modules/migration/utils/migration-file.util';

/** The import/clone result the BE returns (importFormDocument → ImportResult). */
export interface FormImportResult {
  formId: string;
  version: number;
  state: string;
  counts: {
    tabs: number;
    sections: number;
    fields: number;
    rules: number;
    permissions: number;
  };
  warnings: string[];
}

/** A template list row (no payload — kept light). */
export interface FormTemplateRow {
  id: string;
  name: string;
  description: string | null;
  sourceFormId: string | null;
  sourceVersionNo: number | null;
  schemaVersion: string | null;
  createdOn: string;
}

@Injectable({ providedIn: 'root' })
export class FormPortabilityService {
  private readonly http = inject(HttpClientService);

  private _exporting = signal(false);
  private _importing = signal(false);
  private _saving = signal(false);
  private _loadingTemplates = signal(false);
  private _cloning = signal(false);

  readonly exporting = this._exporting.asReadonly();
  readonly importing = this._importing.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly loadingTemplates = this._loadingTemplates.asReadonly();
  readonly cloning = this._cloning.asReadonly();

  /**
   * Export one version to a downloaded `.form.json` file. Rejects with an Error
   * whose message is the BE `message` (or a generic key) on failure.
   */
  async exportVersion(formId: string, version: number): Promise<void> {
    this._exporting.set(true);
    try {
      const res = await lastValueFrom(
        this.http.apiGet<HttpResponse<Blob>>(
          FORM_BUILDER.exportVersion(formId, version),
          { responseType: 'blob', observe: 'response', skipLoader: true },
        ),
      );

      const body = res.body;
      const contentType = res.headers.get('content-type') || '';

      // A FAILED export returns the standard envelope as a JSON blob even
      // though we asked for a file. Detect the non-OK envelope + surface it.
      if (body && contentType.includes('application/json')) {
        const text = await body.text();
        let envelope: any = null;
        try {
          envelope = JSON.parse(text);
        } catch {
          /* not an envelope — treat as the file below */
        }
        if (
          envelope &&
          typeof envelope === 'object' &&
          'status' in envelope &&
          envelope.status === false
        ) {
          throw new Error(envelope.message || 'FORM_BUILDER.PORTABILITY.EXPORT_FAILED');
        }
        // Otherwise it IS the document (Content-Type application/json) — download.
      }

      if (!body) {
        throw new Error('FORM_BUILDER.PORTABILITY.EXPORT_FAILED');
      }

      downloadBlob(body, this.filenameFor(res, formId, version));
    } finally {
      this._exporting.set(false);
    }
  }

  /**
   * Import an already-parsed document into a NEW family + draft. Returns the
   * import summary (counts + warnings). On a BE envelope error the interceptor
   * re-emits it on the success channel, so we read `status` and throw.
   */
  async importDocument(
    document: unknown,
    code?: string,
    name?: string,
  ): Promise<FormImportResult> {
    this._importing.set(true);
    try {
      const body: Record<string, unknown> = { document };
      if (code) body['code'] = code;
      if (name) body['name'] = name;
      const res: any = await lastValueFrom(
        this.http.apiPost(FORM_BUILDER.IMPORT, body, { skipLoader: true }),
      );
      if (!res?.status) {
        throw new Error(res?.message || 'FORM_BUILDER.PORTABILITY.IMPORT_FAILED');
      }
      return res.data as FormImportResult;
    } finally {
      this._importing.set(false);
    }
  }

  /** Save a version as a reusable org template. Returns the new template id. */
  async saveAsTemplate(
    formId: string,
    version: number,
    name: string,
    description?: string | null,
  ): Promise<string> {
    this._saving.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(
          FORM_BUILDER.saveAsTemplate(formId, version),
          { name, description: description ?? null },
          { skipLoader: true },
        ),
      );
      if (!res?.status) {
        throw new Error(res?.message || 'FORM_BUILDER.PORTABILITY.SAVE_FAILED');
      }
      return res.data?.templateId as string;
    } finally {
      this._saving.set(false);
    }
  }

  /** List the org's active templates (payload omitted — light rows). */
  async listTemplates(): Promise<FormTemplateRow[]> {
    this._loadingTemplates.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(FORM_BUILDER.TEMPLATES, { skipLoader: true }),
      );
      return (res?.data?.templates ?? []) as FormTemplateRow[];
    } finally {
      this._loadingTemplates.set(false);
    }
  }

  /** Clone a template into a NEW family + draft. Returns the import summary. */
  async cloneTemplate(templateId: string): Promise<FormImportResult> {
    this._cloning.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(
          FORM_BUILDER.cloneTemplate(templateId),
          {},
          { skipLoader: true },
        ),
      );
      if (!res?.status) {
        throw new Error(res?.message || 'FORM_BUILDER.PORTABILITY.CLONE_FAILED');
      }
      return res.data as FormImportResult;
    } finally {
      this._cloning.set(false);
    }
  }

  /**
   * Resolve the download filename: prefer the server's Content-Disposition,
   * else a client-side fallback matching the BE naming.
   */
  private filenameFor(
    res: HttpResponse<Blob>,
    formId: string,
    version: number,
  ): string {
    const cd = res.headers.get('content-disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd) ?? null;
    const fromHeader = match?.[1]?.trim();
    if (fromHeader) return fromHeader;
    return `dbexec-form-${formId}-v${version}.form.json`;
  }
}
