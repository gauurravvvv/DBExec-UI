import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';

/**
 * Payload emitted when the user clicks Continue.
 */
export interface DatasetPickerResult {
  datasource: any;
  schema: string | null;
}

/**
 * Two-step picker dialog the user opens from the dataset list's
 * Add button. Pick a datasource, then optionally a schema within
 * the datasource. Continue closes the dialog and emits a result the
 * parent uses to navigate to /datasets/new.
 *
 * Stale-response guard: an internal token bumps on every
 * datasource change. The schema fetcher captures the token and
 * discards its response if it changed — avoids the "picked A,
 * switched to B, A's schema list arrives" race.
 */
@Component({
  selector: 'app-dataset-picker-dialog',
  templateUrl: './dataset-picker-dialog.component.html',
  styleUrls: ['./dataset-picker-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetPickerDialogComponent implements OnChanges {
  /** Show/hide the dialog. Two-way via parent's `*ngIf`. */
  @Input() visible = false;

  /** Emitted on Continue with the picked datasource/schema,
   *  or on Cancel / Escape / backdrop click with `null`. */
  @Output() close = new EventEmitter<DatasetPickerResult | null>();

  private cdr = inject(ChangeDetectorRef);

  constructor(
    private translate: TranslateService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
  ) {}

  // ── Selection state ────────────────────────────────────────────────
  datasourceSelected: any = null;
  schemaSelected: any = null;

  // ── Preloaded option pages (priming the dropdowns) ─────────────────
  dsPreloaded: any[] | null = null;
  dsPreloadedTotal: number | null = null;

  // ── Schema list state ──────────────────────────────────────────────
  schemaOptions: { name: string }[] | null = null;
  schemaLoading = false;
  schemaError: string | null = null;

  /** Bumped on every datasource change so a slow schema fetch
   *  for an old datasource can be discarded when its response
   *  arrives. */
  private schemaToken = 0;

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: KeyboardEvent): void {
    if (this.visible) this.onCancel();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.resetState();
    }
  }

  /**
   * Reset selection + option state every time the dialog opens.
   */
  private resetState(): void {
    this.datasourceSelected = null;
    this.schemaSelected = null;
    this.dsPreloaded = null;
    this.dsPreloadedTotal = null;
    this.schemaOptions = null;
    this.schemaError = null;
    this.schemaLoading = false;
    this.primeDatasources();
  }

  // ── Datasource dropdown ────────────────────────────────────────────

  private primeDatasources(): void {
    this.datasourceService
      .listDatasource({ page: 1, limit: 10 })
      .then((res: any) => {
        if (!this.globalService.handleSuccessService(res, false)) return;
        this.dsPreloaded = res?.data?.datasources ?? [];
        this.dsPreloadedTotal =
          res?.data?.count ?? this.dsPreloaded?.length ?? 0;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.dsPreloaded = [];
        this.dsPreloadedTotal = 0;
        this.cdr.markForCheck();
      });
  }

  loadDsPage = async ({
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
      if (this.globalService.handleSuccessService(res, false)) {
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

  /** Datasource change cascades: clear schema, re-fetch the schema
   *  list against the new datasource. */
  onDatasourceChange(): void {
    this.schemaToken++;
    this.schemaSelected = null;
    this.schemaOptions = null;
    this.schemaError = null;
    this.schemaLoading = false;
    const ds = this.datasourceSelected;
    if (!ds?.id) {
      this.cdr.markForCheck();
      return;
    }
    this.loadSchemas(String(ds.id));
  }

  // ── Schema dropdown ────────────────────────────────────────────────

  private loadSchemas(datasourceId: string): void {
    const token = this.schemaToken;
    this.schemaLoading = true;
    this.schemaOptions = null;
    this.schemaError = null;
    this.cdr.markForCheck();
    this.datasourceService
      .listDatasourceSchemas({ datasourceId })
      .then((res: any) => {
        if (token !== this.schemaToken) return; // stale; user switched
        if (this.globalService.handleSuccessService(res, false)) {
          const rows = res?.data ?? [];
          this.schemaOptions = rows
            .map((r: any) => ({ name: r.schema_name }))
            .filter((s: any) => !!s.name);
        } else {
          this.schemaOptions = [];
          this.schemaError =
            res?.message ||
            this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
        }
        this.schemaLoading = false;
        this.cdr.markForCheck();
      })
      .catch((err: any) => {
        if (token !== this.schemaToken) return;
        this.schemaOptions = [];
        this.schemaError =
          err?.message ||
          this.translate.instant('DATASET.FAILED_TO_LOAD_SCHEMA');
        this.schemaLoading = false;
        this.cdr.markForCheck();
      });
  }

  clearSchema(): void {
    this.schemaSelected = null;
  }

  // ── Result + dismissal ─────────────────────────────────────────────

  onCancel(): void {
    this.close.emit(null);
  }

  /** Backdrop click closes only when the click target IS the
   *  backdrop. Inside the dialog body, dropdowns + buttons handle
   *  their own clicks. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onCancel();
  }

  /** Continue emits the payload. Datasource is required; schema
   *  is optional. The parent translates this into a router
   *  navigate with query params. */
  onContinue(): void {
    if (!this.datasourceSelected?.id) return;
    this.close.emit({
      datasource: this.datasourceSelected,
      schema: this.schemaSelected?.name ?? null,
    });
  }
}
