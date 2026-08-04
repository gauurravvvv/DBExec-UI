import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DATASET, QUERY_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetFieldsStore } from '../../services/dataset-fields.store';
import { DatasetService } from '../../services/dataset.service';
import { dataTypeIcon } from 'src/app/shared/helpers/data-type-icon';

@Component({
  selector: 'app-view-dataset',
  templateUrl: './view-dataset.component.html',
  styleUrls: ['./view-dataset.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewDatasetComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.datasetService.cancelReads();
  }

  datasetData: any;
  showDeleteConfirm = false;
  deleteJustification = '';
  showShareDialog = false;
  showDeleteFieldConfirm = false;
  showEditFieldsDialog = false;
  showEditCustomFieldDialog = false;
  showAddCustomFieldDialog = false;
  selectedField: any = null;
  selectedFieldIndex: number = -1;
  fieldToDelete: any = null;
  isLoadingField = false;

  // ── Trust surface (slice 5) ────────────────────────────────────────
  // Freshness header stats. `null` until the GET resolves; `hasFreshness`
  // stays false when the dataset has never run (all fields null).
  freshness: {
    lastRunAt: string | null;
    lastRunBy: string | null;
    rowsReturned: number | null;
    source: string | null;
    hadError: boolean | null;
  } | null = null;
  freshnessLoading = false;
  freshnessLoaded = false;

  // Delete dependency guard. Populated from the lineage endpoint before
  // the justification step is shown; when totalConsumers > 0 the confirm
  // dialog surfaces the counts and requires an explicit acknowledgement.
  lineage: {
    analyses: any[];
    dashboards: any[];
    rlsRules: any[];
    totalConsumers: number;
  } | null = null;
  checkingLineage = false;
  // Explicit acknowledgement the user ticks when the dataset has
  // downstream consumers — gates the delete button in that case.
  acknowledgeConsumers = false;

  saving = this.datasetService.saving;
  // Drives the skeleton card on initial GET + per-id delete spinner.
  loading = this.datasetService.loading;
  isDeleting = (id: string): boolean => this.datasetService.isDeleting(id);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private fieldsStore: DatasetFieldsStore,
  ) {}

  isArray = Array.isArray;

  trackById(index: number, item: any): any {
    return item.id;
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  trackByIndex(index: number): number {
    return index;
  }

  /**
   * Format prompt value for display.
   * Handles enriched {id, value} objects, plain arrays, and scalars.
   */
  /** Delegates to the shared vocabulary; see shared/helpers/data-type-icon.ts. */
  getDataTypeIcon(dataType: string): string {
    return dataTypeIcon(dataType);
  }

  getDataTypeLabel(dataType: string): string {
    if (!dataType) return '';
    const t = dataType.toLowerCase();
    if (t.includes('int') || t.includes('serial')) return 'Integer';
    if (
      t.includes('numeric') ||
      t.includes('decimal') ||
      t.includes('float') ||
      t.includes('double') ||
      t.includes('real') ||
      t.includes('money')
    )
      return 'Decimal';
    if (t.includes('bool')) return 'Boolean';
    if (t.includes('timestamp')) return 'Date & Time';
    if (t.includes('date') || t.includes('time') || t.includes('interval'))
      return 'Date';
    if (t.includes('json')) return 'JSON';
    if (
      t.includes('char') ||
      t.includes('text') ||
      t.includes('string') ||
      t.includes('citext') ||
      t.includes('name')
    )
      return 'Text';
    if (t.includes('uuid')) return 'UUID';
    if (t.includes('array') || t.includes('[]')) return 'Array';
    return dataType;
  }

  formatPromptValue(prompt: any): string {
    if (prompt.isRange) {
      return `${prompt.startValue ?? '-'} to ${prompt.endValue ?? '-'}`;
    }
    if (prompt.value == null) return '-';
    if (Array.isArray(prompt.value)) {
      return prompt.value
        .map((v: any) =>
          typeof v === 'object' && v?.value != null ? v.value : v,
        )
        .join(', ');
    }
    if (typeof prompt.value === 'object' && prompt.value?.value != null) {
      return prompt.value.value;
    }
    return String(prompt.value);
  }

  ngOnInit() {
    this.loadDatasetData();
  }

  async loadDatasetData() {
    const datasetId = this.route.snapshot.params['id'];
    // Use the signal-based loadOne — drives the skeleton card via
    // the service's `loading` signal (no global blocker).
    const response: any = await this.datasetService.loadOne(datasetId);
    if (this.globalService.handleSuccessService(response, false)) {
      this.datasetData = this.datasetService.current();
      // Seed the live field store. From here on, saving a field patches the
      // store rather than refetching, so the sidebar and the formula editor's
      // {field} completions stay current with no reload.
      this.fieldsStore.setAll(
        this.datasetData?.datasetFields ?? [],
        this.datasetData?.id ?? null,
      );
      // Kick off the freshness fetch once we know the dataset exists.
      // Fire-and-forget: the header renders "loading" then fills in.
      this.loadFreshness(datasetId);
    }
    this.cdr.markForCheck();
  }

  /**
   * Fetch point-in-time freshness stats for the header. Failures are
   * swallowed silently — the header simply won't show the trust chip
   * rather than blocking the whole detail view. `freshnessLoaded`
   * flips regardless so the template can stop showing the spinner.
   */
  private async loadFreshness(datasetId: string) {
    this.freshnessLoading = true;
    this.freshnessLoaded = false;
    try {
      const res: any = await this.datasetService.getFreshness(datasetId);
      if (res?.status && res.data) {
        this.freshness = res.data;
      } else {
        this.freshness = null;
      }
    } catch {
      this.freshness = null;
    } finally {
      this.freshnessLoading = false;
      this.freshnessLoaded = true;
      this.cdr.markForCheck();
    }
  }

  /**
   * Whether the dataset has ever been run. The BE returns all-null
   * fields when it hasn't; we treat a present lastRunAt as the signal.
   */
  get hasEverRun(): boolean {
    return !!this.freshness && this.freshness.lastRunAt != null;
  }

  /**
   * Render a field's formatHint human-readably, e.g.
   *   { kind: 'currency', currency: 'USD', decimals: 2 }
   *     -> "Currency · USD · 2dp"
   * Accepts either a structured object or a pre-formatted string.
   * Returns '' when there's nothing to show.
   */
  formatHintLabel(hint: any): string {
    if (hint == null) return '';
    if (typeof hint === 'string') return hint;
    if (typeof hint !== 'object') return String(hint);

    const parts: string[] = [];
    const kind = hint.kind ?? hint.type ?? hint.format;
    if (kind) {
      const k = String(kind);
      parts.push(k.charAt(0).toUpperCase() + k.slice(1));
    }
    const currency = hint.currency ?? hint.currencyCode;
    if (currency) parts.push(String(currency));
    const decimals = hint.decimals ?? hint.decimalPlaces ?? hint.precision;
    if (decimals != null) parts.push(`${decimals}dp`);
    if (hint.percent === true || kind === 'percent') {
      if (!parts.length) parts.push('Percent');
    }

    return parts.join(' · ');
  }

  /**
   * Resolve a custom field's `used_field_ids` (numeric ids of sibling
   * fields it references) into human-readable column names for a
   * "Depends on: colA, colB" line. Returns [] when the payload carries
   * no dependency info so the template can skip the line gracefully.
   */
  dependencyNames(field: any): string[] {
    if (!field) return [];
    // Prefer explicit referenced source columns if the BE surfaced them.
    const explicit =
      field.referencedColumns ?? field.usedFieldColumns ?? field.dependsOn;
    if (Array.isArray(explicit) && explicit.length) {
      return explicit.map((c: any) =>
        typeof c === 'string' ? c : (c?.columnToView ?? c?.name ?? String(c)),
      );
    }

    const ids = field.used_field_ids ?? field.usedFieldIds;
    if (!Array.isArray(ids) || !ids.length) return [];
    const all = this.datasetData?.datasetFields ?? [];
    const names: string[] = [];
    for (const id of ids) {
      const match = all.find((f: any) => f.id === id);
      if (match) {
        names.push(match.columnToView || match.columnToUse || String(id));
      }
    }
    return names;
  }

  goBack() {
    this.router.navigate([DATASET.LIST]);
  }

  onShare(): void {
    this.showShareDialog = true;
  }

  onShareClosed(): void {
    this.showShareDialog = false;
  }

  onEdit() {
    if (this.datasetData.type === 2 && this.datasetData.queryBuilderId) {
      // Type 2 (Prompt-based): open the v2 composer in edit mode
      this.router.navigate(
        [QUERY_BUILDER.compose(this.datasetData.queryBuilderId)],
        {
          queryParams: {
            editDatasetId: this.datasetData.id,
            editDatasetName: this.datasetData.name,
          },
        },
      );
    } else {
      // Type 1 (SQL-based): navigate to standard edit
      this.router.navigate([DATASET.edit(this.datasetData.id)]);
    }
  }

  async confirmDelete() {
    // Dependency guard: consult lineage before opening the delete
    // dialog so we can warn about downstream consumers. A failed
    // lineage lookup must not block deletion — fall through with no
    // guard rather than trapping the user.
    this.lineage = null;
    this.acknowledgeConsumers = false;
    this.checkingLineage = true;
    this.showDeleteConfirm = true;
    try {
      const res: any = await this.datasetService.getLineage(
        this.datasetData.id,
      );
      if (res?.status && res.data) {
        this.lineage = {
          analyses: res.data.analyses ?? [],
          dashboards: res.data.dashboards ?? [],
          rlsRules: res.data.rlsRules ?? [],
          totalConsumers:
            res.data.totalConsumers ??
            (res.data.analyses?.length ?? 0) +
              (res.data.dashboards?.length ?? 0) +
              (res.data.rlsRules?.length ?? 0),
        };
      }
    } catch {
      this.lineage = null;
    } finally {
      this.checkingLineage = false;
      this.cdr.markForCheck();
    }
  }

  /** True when lineage reported at least one downstream consumer. */
  get hasConsumers(): boolean {
    return !!this.lineage && this.lineage.totalConsumers > 0;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
    this.lineage = null;
    this.checkingLineage = false;
    this.acknowledgeConsumers = false;
  }

  proceedDelete() {
    if (this.deleteJustification.trim()) {
      this.datasetService
        .deleteDataset(this.datasetData.id, this.deleteJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.deleteJustification = '';
            this.lineage = null;
            this.acknowledgeConsumers = false;
            this.router.navigate([DATASET.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }

  // Delete field methods
  confirmDeleteField(field: any, index: number): void {
    this.fieldToDelete = field;
    this.showDeleteFieldConfirm = true;
  }

  cancelDeleteField(): void {
    this.fieldToDelete = null;
    this.showDeleteFieldConfirm = false;
  }

  proceedDeleteField(): void {
    if (!this.fieldToDelete) return;

    this.datasetService
      .deleteDatasetField(this.datasetData.id, this.fieldToDelete.id)
      .then((response: any) => {
        this.showDeleteFieldConfirm = false;
        if (this.globalService.handleSuccessService(response, true)) {
          this.fieldToDelete = null;
          // Reload dataset data from API
          this.loadDatasetData();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.showDeleteFieldConfirm = false;
        this.fieldToDelete = null;
        this.cdr.markForCheck();
      });
  }

  copySQLToClipboard(): void {
    navigator.clipboard.writeText(this.datasetData.sql);
  }

  downloadSQL(): void {
    const datasetName = this.datasetData.name || 'dataset';
    const fileName = `${datasetName}_query.sql`;

    const blob = new Blob([this.datasetData.sql], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  openEditFieldDialog(field: any, index: number): void {
    if (this.isLoadingField) return;

    this.isLoadingField = true;
    this.selectedFieldIndex = index;

    // Call API to get field details first
    this.datasetService
      .viewDatasetField(this.datasetData.id, field.id)
      .then((response: any) => {
        this.isLoadingField = false;
        if (this.globalService.handleSuccessService(response, false)) {
          this.selectedField = response.data;

          // Open appropriate dialog based on field type
          if (response.data.type === 2) {
            // CUSTOM field - open custom field dialog in edit mode
            this.showEditCustomFieldDialog = true;
          } else {
            // DEFAULT field (type === 1) - open regular edit dialog
            this.showEditFieldsDialog = true;
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingField = false;
        this.cdr.markForCheck();
      });
  }

  onEditFieldDialogClose(data: any): void {
    this.showEditFieldsDialog = false;
    this.applySavedField(data);
    this.selectedField = null;
    this.selectedFieldIndex = -1;
  }

  onEditCustomFieldDialogClose(data: any): void {
    this.showEditCustomFieldDialog = false;
    this.applySavedField(data);
    this.selectedField = null;
    this.selectedFieldIndex = -1;
  }

  openAddCustomFieldDialog(): void {
    this.showAddCustomFieldDialog = true;
  }

  onAddCustomFieldDialogClose(data: any): void {
    this.showAddCustomFieldDialog = false;
    this.applySavedField(data);
  }

  /**
   * Patch the live field store instead of refetching the dataset.
   *
   * This is what makes create -> pick -> create seamless: the sidebar list, the
   * Monaco {field} completions and the dependency picker all read the same
   * signal, so a field saved a moment ago is immediately referenceable in the
   * next formula with no reload. Previously every dialog close called
   * loadDatasetData() and rebuilt the whole screen.
   */
  private applySavedField(payload: any): void {
    const field = payload?.field ?? payload;
    if (!field) return;

    this.fieldsStore.upsert(field);

    // Keep the locally-rendered dataset object in step so the field count and
    // table reflect the change without a round-trip.
    if (this.datasetData) {
      const rows: any[] = this.datasetData.datasetFields ?? [];
      const key = field.id ?? field.columnToUse;
      const index = rows.findIndex(
        (r: any) =>
          (field.id && r.id === field.id) ||
          (!!key && r.columnToUse === field.columnToUse),
      );
      this.datasetData.datasetFields =
        index === -1
          ? [...rows, field]
          : rows.map((r: any, i: number) => (i === index ? field : r));
    }
  }
}
