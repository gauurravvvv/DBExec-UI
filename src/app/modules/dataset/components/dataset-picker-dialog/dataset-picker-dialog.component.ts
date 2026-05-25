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
import { ROLES } from 'src/app/core/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';

/**
 * Payload emitted when the user clicks Continue. Matches the
 * `?orgId=… &datasourceId=… &schema=…` query params the
 * add-dataset page expects, plus the raw datasource object so the
 * receiver can stash it in router state (avoids re-fetching it).
 */
export interface DatasetPickerResult {
  orgId: string | null;
  datasource: any;
  schema: string | null;
}

/**
 * Three-step picker dialog the user opens from the dataset list's
 * Add button. Pick an organisation (system admins only), then a
 * datasource within that org, then optionally a schema within the
 * datasource. Continue closes the dialog and emits a result the
 * parent uses to navigate to /datasets/new.
 *
 * Visual style mirrors save-analyses-dialog: title at top,
 * label-above-input rows, no floating labels, outlined Cancel +
 * filled primary Continue. SCSS duplicates the base layout from
 * that dialog (per-component view encapsulation prevents
 * inheriting across modules).
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

  /**
   * Pre-seed for the org dropdown. Used to default the popup to
   * the org the parent list is currently filtered by. System
   * admins can still override via the dropdown. Org-scoped users
   * never see the dropdown — they're locked to their JWT org.
   */
  @Input() initialOrg: any = null;

  /** Emitted on Continue with the picked org/datasource/schema,
   *  or on Cancel / Escape / backdrop click with `null`. */
  @Output() close = new EventEmitter<DatasetPickerResult | null>();

  private cdr = inject(ChangeDetectorRef);

  constructor(
    private translate: TranslateService,
    private globalService: GlobalService,
    private organisationService: OrganisationService,
    private datasourceService: DatasourceService,
  ) {}

  // ── Selection state ────────────────────────────────────────────────
  orgSelected: any = null;
  datasourceSelected: any = null;
  schemaSelected: any = null;

  // ── Preloaded option pages (priming the dropdowns) ─────────────────
  orgPreloaded: any[] | null = null;
  orgPreloadedTotal: number | null = null;
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

  /** System admin → org dropdown is visible. Org-scoped users
   *  skip it entirely. */
  showOrgDropdown = false;

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
   * Loads the org dropdown's page-1 list so the user sees options
   * the moment they open the panel, but does NOT auto-select an
   * org or auto-load datasources — the user picks the org first,
   * the cascade fires from `onOrgChange`. Org-scoped users skip the
   * org step entirely (the dropdown is hidden), so we still prime
   * datasources for them.
   */
  private resetState(): void {
    this.orgSelected = null;
    this.datasourceSelected = null;
    this.schemaSelected = null;
    this.orgPreloaded = null;
    this.orgPreloadedTotal = null;
    this.dsPreloaded = null;
    this.dsPreloadedTotal = null;
    this.schemaOptions = null;
    this.schemaError = null;
    this.schemaLoading = false;
    if (this.showOrgDropdown) {
      this.primeOrgs();
    } else {
      // Org-scoped user: no org choice, datasource list scoped to
      // their JWT org. Prime it so the dropdown opens with content.
      this.primeDatasources();
    }
  }

  /** Active org id used by both the datasource and schema fetches.
   *  For system admins this is the popup's local org pick; for
   *  org-scoped users it falls back to the parent-supplied JWT org
   *  (the dropdown is hidden but the id is still needed for the
   *  datasource fetch). */
  private get activeOrgId(): string | null {
    return this.orgSelected?.id || this.initialOrg?.id || null;
  }

  // ── Org dropdown ───────────────────────────────────────────────────

  /** Page-1 prime so the org dropdown opens with content. The
   *  server-mode fetcher takes over from here for search + paging. */
  private primeOrgs(): void {
    this.organisationService
      .listOrganisation({ page: 1, limit: 10 })
      .then((res: any) => {
        if (!this.globalService.handleSuccessService(res, false)) return;
        const orgs: any[] = res?.data?.orgs ?? [];
        this.orgPreloaded = orgs;
        this.orgPreloadedTotal = res?.data?.count ?? orgs.length;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.orgPreloaded = [];
        this.orgPreloadedTotal = 0;
        this.cdr.markForCheck();
      });
  }

  loadOrgsPage = async ({
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
      const res: any = await this.organisationService.listOrganisation(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.orgs ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /** Org change cascades: clear datasource + schema, re-prime the
   *  datasource list against the new org. */
  onOrgChange(): void {
    this.datasourceSelected = null;
    this.dsPreloaded = null;
    this.dsPreloadedTotal = null;
    this.schemaSelected = null;
    this.schemaOptions = null;
    this.schemaError = null;
    this.schemaLoading = false;
    this.schemaToken++;
    if (this.orgSelected?.id) this.primeDatasources();
    this.cdr.markForCheck();
  }

  // ── Datasource dropdown ────────────────────────────────────────────

  private primeDatasources(): void {
    const orgId = this.activeOrgId;
    if (!orgId) return;
    this.datasourceService
      .listDatasource({ orgId, page: 1, limit: 10 })
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
    const orgId = this.activeOrgId;
    if (!orgId) return { items: [], total: 0 };
    const params: any = { orgId, page, limit };
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
    const orgId = this.activeOrgId;
    if (!ds?.id || !orgId) {
      this.cdr.markForCheck();
      return;
    }
    this.loadSchemas(String(orgId), String(ds.id));
  }

  // ── Schema dropdown ────────────────────────────────────────────────

  private loadSchemas(orgId: string, datasourceId: string): void {
    const token = this.schemaToken;
    this.schemaLoading = true;
    this.schemaOptions = null;
    this.schemaError = null;
    this.cdr.markForCheck();
    this.datasourceService
      .listDatasourceSchemas({ orgId, datasourceId })
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
      orgId: this.activeOrgId,
      datasource: this.datasourceSelected,
      schema: this.schemaSelected?.name ?? null,
    });
  }
}
