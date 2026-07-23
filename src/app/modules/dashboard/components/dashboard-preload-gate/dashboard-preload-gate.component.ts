import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from 'src/app/shared/shared.module';
import type {
  AnalysisParameter,
  ParameterValue,
} from 'src/app/modules/analyses/models/analysis-parameter.model';
import { parameterValueType } from 'src/app/modules/analyses/models/analysis-parameter.model';
import type { ValueType } from 'src/app/modules/analyses/utils/field-type.util';

/** The control a typed input resolves to — mirrors typed-value-input. */
export type GateControlKind =
  'dropdown' | 'number' | 'calendar' | 'toggle' | 'text';

/**
 * The values the gate emits on submit: resolved parameter values (feed
 * runQuery `paramValues`) and applied filter payloads (feed runQuery
 * `filters`, shaped exactly like analysis-filter-bar's output).
 */
export interface PreloadGateResult {
  paramValues: ParameterValue[];
  filterValues: any[];
}

/**
 * DashboardPreloadGate — the BLOCKING pre-load parameter/filter prompt
 * (Dashboard & Analysis v2, Track C3). Rendered by view-dashboard and
 * embed-dashboard when the render response sets `requiresPreloadGate`.
 *
 * While mounted it is the ONLY thing on screen: a centered card listing
 * every required parameter and every mandatory filter with a typed
 * control (date → calendar, number → numeric, enum → dropdown, boolean →
 * toggle, string → text). The mapping is the same one typed-value-input
 * uses; the controls are the shared `custom-*` house controls (exported
 * by SharedModule) so the dashboard module reuses them without depending
 * on the analyses module's internal declarations.
 *
 * The host does NOT run any query until the user fills every required
 * input and presses Load; the gate then emits `submitted` with the
 * resolved values and the host runs with them. An "Edit inputs"
 * affordance on the host re-opens the gate (seeded from the last
 * submitted values via [seededParamValues] / [seededFilterValues]).
 */
@Component({
  selector: 'app-dashboard-preload-gate',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, SharedModule],
  templateUrl: './dashboard-preload-gate.component.html',
  styleUrls: ['./dashboard-preload-gate.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPreloadGateComponent implements OnChanges {
  private cdr = inject(ChangeDetectorRef);

  /** Parameters (from render `parameters`); only required ones gate. */
  @Input() parameters: AnalysisParameter[] = [];

  /** Mandatory filters (from render `mandatoryFilters`). */
  @Input() mandatoryFilters: any[] = [];

  /** Optional seed for a re-open ("Edit inputs") — last param values. */
  @Input() seededParamValues: ParameterValue[] | null = null;
  /** Optional seed for a re-open — last raw filter input values by id. */
  @Input() seededFilterValues: Record<string, any> | null = null;

  /** Emitted once, when the user submits valid required inputs. */
  @Output() submitted = new EventEmitter<PreloadGateResult>();

  /** Current parameter values keyed by parameter key. */
  paramValues: Record<string, any> = {};
  /** Current mandatory-filter raw input values keyed by filter id. */
  filterValues: Record<string, any> = {};

  /** Only required parameters gate the load (defensive filter). */
  get requiredParameters(): AnalysisParameter[] {
    return (this.parameters || []).filter(p => p.isRequired);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['parameters'] ||
      changes['mandatoryFilters'] ||
      changes['seededParamValues'] ||
      changes['seededFilterValues']
    ) {
      this.seed();
    }
  }

  private seed(): void {
    const seededParams: Record<string, any> = {};
    if (Array.isArray(this.seededParamValues)) {
      for (const pv of this.seededParamValues) seededParams[pv.key] = pv.value;
    }
    const nextParams: Record<string, any> = {};
    for (const p of this.requiredParameters) {
      nextParams[p.key] =
        seededParams[p.key] !== undefined
          ? seededParams[p.key]
          : (p.defaultValue ?? null);
    }
    this.paramValues = nextParams;

    const nextFilters: Record<string, any> = {};
    for (const f of this.mandatoryFilters || []) {
      const seeded = this.seededFilterValues?.[f.id];
      nextFilters[f.id] = seeded !== undefined ? seeded : null;
    }
    this.filterValues = nextFilters;
    this.cdr.markForCheck();
  }

  // ── control resolution (parameters) ─────────────────────────────────

  private valueTypeToKind(vt: ValueType, isEnum: boolean): GateControlKind {
    if (isEnum) return 'dropdown';
    switch (vt) {
      case 'number':
        return 'number';
      case 'date':
        return 'calendar';
      case 'boolean':
        return 'toggle';
      default:
        return 'text';
    }
  }

  paramControl(p: AnalysisParameter): GateControlKind {
    return this.valueTypeToKind(parameterValueType(p), p.dataType === 'enum');
  }

  paramOptions(p: AnalysisParameter): { label: string; value: any }[] {
    if (p.dataType !== 'enum' || !Array.isArray(p.allowedValues)) return [];
    return p.allowedValues.map(o => ({ label: o.label, value: o.value }));
  }

  onParamChange(p: AnalysisParameter, value: any): void {
    // Calendar emits a Date; store an ISO string so the payload is portable.
    this.paramValues[p.key] =
      value instanceof Date ? value.toISOString() : value;
  }

  trackParam(_i: number, p: AnalysisParameter): string {
    return p.id ?? p.key;
  }

  // ── control resolution (mandatory filters) ──────────────────────────

  /**
   * Map a filter's `filterType` to the typed control:
   *   category   → dropdown (falls back to text; distinct values unresolved here)
   *   numeric_*  → number
   *   time_*     → calendar
   *   boolean    → toggle
   */
  filterControl(f: any): GateControlKind {
    switch (f?.filterType) {
      case 'numeric_equality':
      case 'numeric_range':
        return 'number';
      case 'time_equality':
      case 'time_range':
        return 'calendar';
      case 'boolean':
        return 'toggle';
      case 'category':
      default:
        return 'text';
    }
  }

  onFilterChange(f: any, value: any): void {
    this.filterValues[f.id] =
      value instanceof Date ? value.toISOString() : value;
  }

  trackFilter(_i: number, f: any): string {
    return f.id;
  }

  // ── validity + submit ───────────────────────────────────────────────

  private isEmpty(v: any): boolean {
    if (v === null || v === undefined || v === '') return true;
    if (Array.isArray(v)) {
      if (v.length === 0) return true;
      return v.some(x => x === null || x === undefined || x === '');
    }
    return false;
  }

  /** Every required parameter + every mandatory filter must have a value. */
  get isValid(): boolean {
    for (const p of this.requiredParameters) {
      if (this.isEmpty(this.paramValues[p.key])) return false;
    }
    for (const f of this.mandatoryFilters || []) {
      if (this.isEmpty(this.filterValues[f.id])) return false;
    }
    return true;
  }

  /** True when there is at least one input to fill. */
  get hasInputs(): boolean {
    return (
      this.requiredParameters.length > 0 ||
      (this.mandatoryFilters?.length ?? 0) > 0
    );
  }

  submit(): void {
    if (!this.isValid) return;

    const paramValues: ParameterValue[] = this.requiredParameters.map(p => ({
      key: p.key,
      value: this.paramValues[p.key] ?? null,
    }));

    const filterValues = (this.mandatoryFilters || [])
      .map(f => this.buildFilterPayload(f, this.filterValues[f.id]))
      .filter(b => b && !b._skip);

    this.submitted.emit({ paramValues, filterValues });
  }

  /**
   * Build a run-query filter payload from a mandatory filter + its raw
   * input value — mirrors analysis-filter-bar.applyFilters() so the BE
   * filterEngine consumes it identically.
   */
  private buildFilterPayload(f: any, val: any): any {
    const base: any = {
      filterId: f.id,
      columnName: f.columnName,
      filterType: f.filterType,
      operator: f.config?.matchOperator || this.defaultOperator(f.filterType),
      nullOption: f.nullOption || 'ALL_VALUES',
    };

    if (f.filterType === 'category') {
      base.values = Array.isArray(val) ? val : [val];
    } else if (
      f.filterType === 'numeric_range' ||
      f.filterType === 'numeric_equality'
    ) {
      if (Array.isArray(val) && val.length === 2) {
        base.rangeMin = val[0];
        base.rangeMax = val[1];
        base.operator = 'BETWEEN';
      } else {
        base.values = [val];
      }
    } else if (
      f.filterType === 'time_range' ||
      f.filterType === 'time_equality'
    ) {
      if (
        Array.isArray(val) &&
        val.length === 2 &&
        val[0] != null &&
        val[1] != null
      ) {
        base.dateRangeStart =
          val[0] instanceof Date ? val[0].toISOString() : val[0];
        base.dateRangeEnd =
          val[1] instanceof Date ? val[1].toISOString() : val[1];
        base.operator = 'BETWEEN';
      } else if (!Array.isArray(val) && val != null && val !== '') {
        base.values = [val instanceof Date ? val.toISOString() : val];
      } else {
        base._skip = true;
      }
    } else {
      base.values = Array.isArray(val) ? val : [val];
    }
    return base;
  }

  private defaultOperator(filterType: string): string {
    switch (filterType) {
      case 'numeric_range':
      case 'time_range':
        return 'BETWEEN';
      default:
        return 'EQUALS';
    }
  }
}
