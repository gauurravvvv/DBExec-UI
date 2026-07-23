import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { QUERY_RUNNER } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import {
  QueryConnection,
  QueryRunnerService,
} from '../../services/query-runner.service';
import {
  SavedQueriesService,
  SavedQueryPayload,
} from '../../services/saved-queries.service';
import {
  addSavedQuerySchema,
  updateSavedQuerySchema,
} from 'src/app/shared/validators/savedQueries';

/**
 * AddSavedQueryComponent — create OR edit a saved query. Same add/edit
 * shell as the connection form (back header, vertical form with shared
 * app-custom-* controls, one control per row). Metadata only: the SQL
 * field here is a plain textarea — real SQL editing happens in the
 * standalone executor. Zod validates before submit; failures map to the
 * per-field error slots via applyZodErrors.
 *
 * EditSavedQueryComponent subclasses this (same template + logic); isEdit
 * is derived from the presence of an :id route param, so one class serves
 * both routes.
 */
@Component({
  selector: 'app-add-saved-query',
  templateUrl: './add-saved-query.component.html',
  styleUrls: ['./add-saved-query.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSavedQueryComponent implements OnInit, HasUnsavedChanges {
  protected cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  saving = false;
  isEdit = false;
  savedQueryId = '';

  // Per-field Zod error slots (translation-resolved messages).
  errors: Record<string, string> = {};

  // Connection dropdown — enabled options for the chosen datasource
  // (mirrors the launcher's connection filter).
  connectionOptions: { label: string; value: string }[] = [];
  private allConnections: QueryConnection[] = [];
  private connectionsLoaded = false;

  constructor(
    protected fb: FormBuilder,
    protected service: SavedQueriesService,
    protected connService: QueryRunnerService,
    protected datasourceService: DatasourceService,
    protected globalService: GlobalService,
    protected translate: TranslateService,
    protected route: ActivatedRoute,
    protected router: Router,
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required]],
      description: [''],
      datasourceId: ['', [Validators.required]],
      connectionId: ['', [Validators.required]],
      sql: ['', [Validators.required]],
      rowLimit: [null as number | null],
    });
  }

  ngOnInit(): void {
    this.savedQueryId = this.route.snapshot.paramMap.get('id') ?? '';
    this.isEdit = !!this.savedQueryId;
    // Preload connections so the connection dropdown can filter to the
    // chosen datasource (client-side, exactly like the launcher).
    this.loadConnections();
    if (this.isEdit) this.loadForEdit();
  }

  /** Server-mode fetcher for the datasource dropdown. */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (res?.status) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /** Resolve a single datasource so its name shows on the edit form. */
  resolveDatasource = async (id: string): Promise<any> => {
    try {
      const res: any = await this.datasourceService.loadOne(id);
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  private loadConnections(): void {
    this.connService
      .listConnections()
      .then(res => {
        this.allConnections = res?.status ? (res.data?.connections ?? []) : [];
        this.connectionsLoaded = true;
        this.refreshConnectionOptions();
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.allConnections = [];
        this.connectionsLoaded = true;
        this.cdr.markForCheck();
      });
  }

  /** Datasource changed → filter connections + clear/keep selection. */
  onDatasourceChange(dsId: string | null): void {
    this.form.get('datasourceId')?.setValue(dsId);
    this.form.get('datasourceId')?.markAsDirty();
    // Clear the connection when the datasource changes (it may no longer
    // belong to the new datasource). Preselect the default for the new one.
    this.form.get('connectionId')?.setValue(null);
    this.refreshConnectionOptions();
    const usable = this.usableConnectionsForDs(dsId);
    const def = usable.find(c => c.isDefault) ?? usable[0];
    if (def) this.form.get('connectionId')?.setValue(def.id);
    this.cdr.markForCheck();
  }

  private usableConnectionsForDs(dsId: string | null): QueryConnection[] {
    if (!dsId) return [];
    return this.allConnections
      .filter(c => c.datasourceId === dsId)
      .filter(c => c.enabled !== false);
  }

  private refreshConnectionOptions(): void {
    const dsId = this.form.get('datasourceId')?.value ?? null;
    const usable = this.usableConnectionsForDs(dsId);
    this.connectionOptions = usable.map(c => ({
      label: c.isDefault
        ? `★ ${c.name} — ${c.username}`
        : `${c.name} — ${c.username}`,
      value: c.id,
    }));
  }

  private loadForEdit(): void {
    this.service
      .getSavedQuery(this.savedQueryId)
      .then(res => {
        if (res?.status && res.data) {
          const d = res.data;
          this.form.patchValue({
            name: d.name,
            description: d.description ?? '',
            datasourceId: d.datasourceId,
            connectionId: d.connectionId,
            sql: d.sql,
            rowLimit: d.rowLimit ?? null,
          });
          // Rebuild the connection option list for the loaded datasource
          // once connections are available.
          if (this.connectionsLoaded) this.refreshConnectionOptions();
        } else {
          this.globalService.handleSuccessService(res);
          this.goBack();
        }
      })
      .catch(() => this.goBack())
      .finally(() => this.cdr.markForCheck());
  }

  private buildPayload(): SavedQueryPayload {
    const raw = this.form.getRawValue();
    const payload: SavedQueryPayload = {
      name: raw.name,
      sql: raw.sql,
      datasourceId: raw.datasourceId,
      connectionId: raw.connectionId,
    };
    if (raw.description && String(raw.description).trim())
      payload.description = raw.description;
    if (raw.rowLimit != null && raw.rowLimit !== '')
      payload.rowLimit = Number(raw.rowLimit);
    return payload;
  }

  private applyZodErrors(
    issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
  ): void {
    this.errors = {};
    for (const issue of issues) {
      const field = String(issue.path[0] ?? '');
      if (!field) continue;
      this.errors[field] = this.translate.instant(issue.message);
      this.form.get(field)?.markAsTouched();
    }
    this.cdr.markForCheck();
  }

  onSubmit(): void {
    if (this.saving) return;
    this.errors = {};
    const payload = this.buildPayload();
    const parsed = this.isEdit
      ? updateSavedQuerySchema.safeParse(payload)
      : addSavedQuerySchema.safeParse(payload);
    if (!parsed.success) {
      this.applyZodErrors(parsed.error.issues);
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.cdr.markForCheck();

    const done = (res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        this.form.markAsPristine();
        this.router.navigate([QUERY_RUNNER.SAVED_QUERIES_LIST]);
      }
    };

    const req = this.isEdit
      ? this.service.updateSavedQuery(this.savedQueryId, payload)
      : this.service.addSavedQuery(payload);

    req
      .then(done)
      .catch(() => {})
      .finally(() => {
        this.saving = false;
        this.cdr.markForCheck();
      });
  }

  onCancel(): void {
    this.goBack();
  }

  goBack(): void {
    this.router.navigate([QUERY_RUNNER.SAVED_QUERIES_LIST]);
  }

  /** HasUnsavedChanges contract — the guard prompts when this is true. */
  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving;
  }
}
