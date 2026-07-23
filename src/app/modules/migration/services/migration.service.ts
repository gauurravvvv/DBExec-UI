import { HttpResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { MIGRATION } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import {
  DbExecMigrationBundle,
  ExportItem,
  MigrationFormat,
} from 'src/app/shared/validators/migration';
import { downloadBlob } from '../utils/migration-file.util';

/** One asset the import created, echoed back for the success summary. */
export interface CreatedAsset {
  type: string;
  id: string;
  name: string;
}

/** A datasource the import auto-created. `status: 0` = needs credentials. */
export interface NewDatasource {
  id: string;
  name: string;
  status: number;
}

/** Shape of `data` returned by POST /migration/import. */
export interface ImportResult {
  createdAssets: CreatedAsset[];
  newDatasources: NewDatasource[];
}

/**
 * MigrationService — export the picked dataset(s) / analysis(es) /
 * dashboard(s) to a portable `.dbexec.json` file, and import such a file into
 * the caller's org. Signal-based state (mirrors asset-shares.service): reads
 * expose `exporting` / `importing` so buttons can spin.
 *
 * Export streams a FILE DOWNLOAD (not the usual `{status,code,message,data}`
 * envelope), so we request the response as a Blob and read the filename from
 * the `Content-Disposition` header (falling back to a timestamped name if the
 * header isn't readable — CORS/interceptors may strip it). A FAILED export
 * still returns the envelope, which — because we asked for a Blob — arrives as
 * a JSON Blob; we detect the non-OK envelope and surface its `message`.
 *
 * Import posts the already-validated bundle and returns the `data` summary.
 */
@Injectable({ providedIn: 'root' })
export class MigrationService {
  private _exporting = signal(false);
  private _importing = signal(false);

  readonly exporting = this._exporting.asReadonly();
  readonly importing = this._importing.asReadonly();

  constructor(private http: HttpClientService) {}

  /**
   * Export one or more assets to a downloaded `.dbexec.json` file. Shows the
   * global loader (export can take a moment). Resolves once the download has
   * been triggered; rejects with an Error whose message is the BE `message`
   * (or a generic key) on failure.
   */
  async exportAssets(
    items: ExportItem[],
    format: MigrationFormat = 'json',
  ): Promise<void> {
    this._exporting.set(true);
    try {
      const res = await lastValueFrom(
        this.http.apiPost<HttpResponse<Blob>>(
          MIGRATION.EXPORT,
          { items, format },
          {
            responseType: 'blob',
            observe: 'response',
            // Show the global loader — export can take a moment.
            skipLoader: false,
          },
        ),
      );

      const body = res.body;
      const contentType = res.headers.get('content-type') || '';

      // A FAILED export returns the standard envelope as a JSON blob even
      // though we asked for a file. Detect it and surface the message.
      if (body && contentType.includes('application/json')) {
        const text = await body.text();
        let envelope: any = null;
        try {
          envelope = JSON.parse(text);
        } catch {
          /* not an envelope — treat as the file below */
        }
        // Only treat as an error when it's actually our envelope AND not OK.
        if (
          envelope &&
          typeof envelope === 'object' &&
          'status' in envelope &&
          envelope.status === false
        ) {
          throw new Error(envelope.message || 'MIGRATION.IMPORT_FAILED');
        }
        // Otherwise it IS the bundle file (Content-Type is application/json) —
        // fall through and download it.
      }

      if (!body) {
        throw new Error('MIGRATION.IMPORT_FAILED');
      }

      downloadBlob(body, this.filenameFor(res, format));
    } finally {
      this._exporting.set(false);
    }
  }

  /**
   * Import an already-parsed + validated bundle. Returns the summary
   * (`createdAssets` + `newDatasources`) on success. On a BE envelope error
   * the interceptor re-emits it on the success channel, so we read `status`
   * and throw the `message` for the caller to toast.
   */
  async importBundle(bundle: DbExecMigrationBundle): Promise<ImportResult> {
    this._importing.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiPost(MIGRATION.IMPORT, bundle, { skipLoader: true }),
      );
      if (!res?.status) {
        throw new Error(res?.message || 'MIGRATION.IMPORT_FAILED');
      }
      return {
        createdAssets: res.data?.createdAssets ?? [],
        newDatasources: res.data?.newDatasources ?? [],
      };
    } finally {
      this._importing.set(false);
    }
  }

  /**
   * Resolve the download filename: prefer the server's Content-Disposition
   * (`attachment; filename="…"`), else a client-side timestamped fallback.
   */
  private filenameFor(
    res: HttpResponse<Blob>,
    format: MigrationFormat,
  ): string {
    const cd = res.headers.get('content-disposition') || '';
    // filename*="…"  or  filename="…"  (quoted or bare).
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd) ?? null;
    const fromHeader = match?.[1]?.trim();
    if (fromHeader) return fromHeader;
    const ext = format === 'yaml' ? 'yaml' : 'json';
    return `dbexec-export-${this.timestamp()}.dbexec.${ext}`;
  }

  /** Compact local timestamp `YYYYMMDD_HHMMSS` for the fallback filename. */
  private timestamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_` +
      `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
  }
}
