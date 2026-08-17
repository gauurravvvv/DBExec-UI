import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilderStore } from '../../services/form-builder-store';
import { ResolvedField } from '../../services/fb-types';
import {
  OperatorOption,
  operatorOptionsFallback,
  operatorOptionsFromCatalog,
} from '../../helpers/fb-operator-catalog';
import { isLayoutType } from '../../helpers/fb-prompt-type-icons';
import {
  ReferenceDataService,
  ReferenceRow,
} from 'src/app/core/services/reference-data.service';

/** Reference-data family holding the filter-operator catalog. */
const FILTER_OPERATOR_FAMILY = 'filter_operator';

/**
 * Placement property form (§5.3) — ALL presentation lives here: label/help/
 * placeholder overrides, mandatory/visible/read-only/locked flags, colSpan
 * (1–4, capped by the section columns), and the Allowed-operators multiselect.
 *
 * The Allowed-operators options are sourced from the LIVE `filter_operator`
 * reference-data catalog (via ReferenceDataService, which fetches the whole
 * reference-data map ONCE and caches it app-wide — so this per-field component
 * re-reads the cache, it does not re-fetch), filtered by the SAME applicability
 * rule the BE enforces. That keeps the persisted `allowedOperators` codes
 * identical to the seed (`neq`, not the stale `ne`), so a save can't 422.
 * Layout blocks show content + colSpan only.
 */
@Component({
  selector: 'fb-prop-field',
  templateUrl: './fb-prop-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbPropFieldComponent implements OnInit {
  // Backed by a signal so `operatorOptions` (a computed) recomputes when the
  // parent swaps the selected field onto the same component instance
  // (`*ngIf="selectedField() as f"` reuses the instance, only the input value
  // changes) — a plain @Input would leave the computed stale.
  private readonly _field = signal<ResolvedField | null>(null);
  @Input({ required: true }) set field(value: ResolvedField) {
    this._field.set(value);
  }
  get field(): ResolvedField {
    return this._field()!;
  }
  readonly store = inject(FormBuilderStore);
  private readonly referenceData = inject(ReferenceDataService);
  private readonly destroyRef = inject(DestroyRef);

  /** Live `filter_operator` catalog rows; null until the first emission. */
  private readonly operatorRows = signal<ReferenceRow[] | null>(null);

  ngOnInit(): void {
    // getFamily triggers the one-time reference-data load and then re-emits
    // from the app-level cache — never a per-field HTTP call.
    this.referenceData
      .getFamily(FILTER_OPERATOR_FAMILY)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(rows => this.operatorRows.set(rows));
  }

  get isLayout(): boolean {
    return !!this.field.blockType && isLayoutType(this.field.type);
  }

  /**
   * Operator options for the selected field's dataType. Primary source is the
   * live catalog (BE-mirrored filter); falls back to the corrected static map
   * only if the catalog is unavailable (fetch failed / empty), so the options —
   * and thus the saved codes — are always ones the BE accepts.
   */
  readonly operatorOptions = computed<OperatorOption[]>(() => {
    const rows = this.operatorRows();
    const dataType = this._field()?.dataType ?? null;
    if (rows === null) return []; // still loading — render empty, don't crash
    const fromCatalog = operatorOptionsFromCatalog(rows, dataType);
    if (fromCatalog.length > 0) return fromCatalog;
    // Empty catalog (or a shape we couldn't parse) → corrected fallback.
    return operatorOptionsFallback(dataType);
  });

  get colSpanOptions() {
    const max = this.store.selectedSection()?.columns ?? 4;
    return Array.from({ length: max }, (_, i) => ({
      label: `${i + 1}`,
      value: i + 1,
    }));
  }

  patch(p: Partial<ResolvedField>): void {
    this.store.updatePlacement(this.field.formFieldId, p);
  }
}
