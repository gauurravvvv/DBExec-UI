import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import {
  ALERT_AGGREGATES,
  ALERT_JOINS,
  ALERT_LIMITS,
  ALERT_OPERATORS,
  ALERT_VALUE_TYPES,
  type AlertConditionMode,
  type AlertOperator,
  type AlertValueType,
} from 'src/app/shared/validators/alerts';
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/** A source field / formula the builder can reference on the LHS. */
export interface AlertFieldOption {
  /** Executable reference (column name / formula key). */
  ref: string;
  /** Human label. */
  label: string;
  /** 'field' (raw column) or 'formula' (custom-field expression). */
  kind: 'field' | 'formula';
  /** dataType from the dataset field, used to seed the RHS valueType. */
  dataType?: string;
}

/** Operators that take NO right-hand value. */
const NULLARY_OPERATORS: AlertOperator[] = ['is_null', 'is_not_null'];
/** Operators whose RHS is a [lo, hi] range. */
const RANGE_OPERATORS: AlertOperator[] = ['between', 'not_between'];

/** Require a non-empty RHS unless the operator is nullary / handled elsewhere. */
function predicateValueValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const group = control.parent as FormGroup | null;
  if (!group) return null;
  const op = group.get('operator')?.value as AlertOperator;
  if (NULLARY_OPERATORS.includes(op)) return null;
  const v = control.value;
  if (RANGE_OPERATORS.includes(op)) {
    if (
      !Array.isArray(v) ||
      v[0] === null ||
      v[0] === undefined ||
      v[0] === '' ||
      v[1] === null ||
      v[1] === undefined ||
      v[1] === ''
    ) {
      return { required: true };
    }
    return null;
  }
  if (v === null || v === undefined || v === '') return { required: true };
  return null;
}

/**
 * AlertConditionBuilder — the guided typed condition authoring surface plus the
 * advanced free-text expression escape hatch. Owns a self-contained
 * `conditionForm` with:
 *
 *   mode:        'builder' | 'expression'
 *   groups:      FormArray< { join, predicates: FormArray<predicate> } >
 *   expression:  free-text (expr-eval-parseable) string
 *
 * Each predicate row is `{ left: { kind, ref, aggregate }, operator, right }`
 * where the right-hand editor is the shared <app-typed-value-input>, its
 * valueType seeded from the chosen field's dataType. AND/OR is per-group (join);
 * multiple groups OR together at the top level.
 *
 * The parent (add / edit alert) supplies the available `fields` + a distinct-
 * values fetcher, listens to (conditionChange) for validity, and calls
 * getPayload() to serialise into the shape the mirrored validator expects.
 */
@Component({
  selector: 'app-alert-condition-builder',
  templateUrl: './alert-condition-builder.component.html',
  styleUrls: ['./alert-condition-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertConditionBuilderComponent implements OnChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private translate = inject(TranslateService);
  private referenceData = inject(ReferenceDataService);

  /** Fields / formulas selectable on the LHS. */
  @Input() fields: AlertFieldOption[] = [];

  /** Distinct-value fetcher for string RHS dropdowns (per field ref). */
  @Input() distinctValuesFetcher:
    ((ref: string) => Promise<{ label: string; value: string }[]>) | null =
    null;

  /** Emits the current condition payload + validity on every change. */
  @Output() conditionChange = new EventEmitter<{
    valid: boolean;
    mode: AlertConditionMode;
    conditionBuilder: any;
    conditionExpression: string | null;
  }>();

  conditionForm: FormGroup = this.fb.group({
    mode: ['builder'],
    groups: this.fb.array([this.createGroup()]),
    expression: [''],
  });

  /** distinct-value cache keyed by field ref. */
  valuesCache: Record<string, { label: string; value: string }[]> = {};
  loadingValues: Record<string, boolean> = {};

  /* ── select option lists ───────────────────────────────────────── */

  aggregateOptions = ALERT_AGGREGATES.map(a => ({
    value: a,
    label: this.translate.instant('ALERTS.AGGREGATE.' + a.toUpperCase()),
  }));

  // Operators + value types are DB-driven (families: alert_operator,
  // value_type). Seeded from the mirrored-validator enums (translated) so
  // the dropdown is never empty on first paint / a failed fetch, then
  // overwritten with the DB rows (label + order) once they resolve.
  operatorOptions: { value: string; label: string }[] = ALERT_OPERATORS.map(
    o => ({
      value: o,
      label: this.translate.instant('ALERTS.OPERATOR.' + o.toUpperCase()),
    }),
  );

  valueTypeOptions: { value: string; label: string }[] = ALERT_VALUE_TYPES.map(
    v => ({
      value: v,
      label: this.translate.instant('ALERTS.VALUE_TYPE.' + v.toUpperCase()),
    }),
  );

  joinOptions = ALERT_JOINS.map(j => ({ value: j, label: j }));

  readonly maxPredicates = ALERT_LIMITS.MAX_PREDICATES;

  constructor() {
    this.conditionForm.valueChanges.subscribe(() => this.emit());
    this.loadReferenceOptions();
  }

  /**
   * Pull the operator + value-type option lists from the DB-driven
   * reference-data service. On empty (family absent / fetch failed) we
   * keep the validator-seeded fallback so the builder still renders.
   */
  private loadReferenceOptions(): void {
    this.referenceData
      .getFamily('alert_operator')
      .pipe(takeUntilDestroyed())
      .subscribe(rows => {
        if (rows.length) {
          this.operatorOptions = rows.map(r => ({
            value: r.code,
            label: r.label,
          }));
          this.cdr.markForCheck();
        }
      });
    this.referenceData
      .getFamily('value_type')
      .pipe(takeUntilDestroyed())
      .subscribe(rows => {
        if (rows.length) {
          this.valueTypeOptions = rows.map(r => ({
            value: r.code,
            label: r.label,
          }));
          this.cdr.markForCheck();
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fields']) {
      // A source change invalidates cached distinct values.
      this.valuesCache = {};
      this.loadingValues = {};
    }
  }

  /* ── form-array accessors ───────────────────────────────────────── */

  get mode(): AlertConditionMode {
    return this.conditionForm.get('mode')?.value;
  }

  get groups(): FormArray {
    return this.conditionForm.get('groups') as FormArray;
  }

  predicates(group: AbstractControl): FormArray {
    return group.get('predicates') as FormArray;
  }

  createGroup(): FormGroup {
    return this.fb.group({
      join: ['AND'],
      predicates: this.fb.array([this.createPredicate()]),
    });
  }

  createPredicate(): FormGroup {
    return this.fb.group({
      left: this.fb.group({
        kind: ['field', Validators.required],
        ref: ['', Validators.required],
        aggregate: ['none'],
      }),
      operator: ['gt' as AlertOperator, Validators.required],
      right: this.fb.group({
        value: [null, predicateValueValidator],
        valueType: ['number' as AlertValueType],
      }),
    });
  }

  /* ── mode toggle ────────────────────────────────────────────────── */

  setMode(mode: AlertConditionMode): void {
    this.conditionForm.get('mode')?.setValue(mode);
  }

  /* ── group / predicate mutations ────────────────────────────────── */

  addGroup(): void {
    this.groups.push(this.createGroup());
  }

  removeGroup(gi: number): void {
    if (this.groups.length > 1) this.groups.removeAt(gi);
  }

  addPredicate(group: AbstractControl): void {
    const arr = this.predicates(group);
    if (arr.length < this.maxPredicates) arr.push(this.createPredicate());
  }

  removePredicate(group: AbstractControl, pi: number): void {
    const arr = this.predicates(group);
    if (arr.length > 1) arr.removeAt(pi);
  }

  /* ── per-row reactive behaviour ─────────────────────────────────── */

  /** When a field is chosen, seed the RHS valueType from its dataType and, for
   *  string fields, kick off a distinct-value fetch for the dropdown. */
  onFieldChange(predicate: AbstractControl, ref: string): void {
    const field = this.fields.find(f => f.ref === ref);
    predicate.get('left.kind')?.setValue(field?.kind ?? 'field', {
      emitEvent: false,
    });
    const vt = this.dataTypeToValueType(field?.dataType);
    predicate.get('right.valueType')?.setValue(vt);
    predicate.get('right.value')?.reset(this.defaultValueFor(predicate));
    if (vt === 'string') this.loadDistinctValues(ref);
  }

  onOperatorChange(predicate: AbstractControl): void {
    // Reset the value when switching operator families (single ↔ range ↔ none).
    predicate.get('right.value')?.reset(this.defaultValueFor(predicate));
  }

  onValueTypeChange(predicate: AbstractControl): void {
    predicate.get('right.value')?.reset(this.defaultValueFor(predicate));
  }

  /** Set the RHS value type (the control lives on right.valueType) and reset
   *  the value so it matches the new editor. */
  setPredicateValueType(
    predicate: AbstractControl,
    valueType: AlertValueType,
  ): void {
    predicate.get('right.valueType')?.setValue(valueType);
    this.onValueTypeChange(predicate);
  }

  isRangeOperator(op: AlertOperator): boolean {
    return RANGE_OPERATORS.includes(op);
  }

  isNullaryOperator(op: AlertOperator): boolean {
    return NULLARY_OPERATORS.includes(op);
  }

  getPredicateValueType(predicate: AbstractControl): AlertValueType {
    return predicate.get('right.valueType')?.value ?? 'number';
  }

  getPredicateOperator(predicate: AbstractControl): AlertOperator {
    return predicate.get('operator')?.value ?? 'gt';
  }

  getValueOptions(
    predicate: AbstractControl,
  ): { label: string; value: string }[] {
    const ref = predicate.get('left.ref')?.value;
    return ref ? (this.valuesCache[ref] ?? []) : [];
  }

  private defaultValueFor(predicate: AbstractControl): any {
    const op = this.getPredicateOperator(predicate);
    if (RANGE_OPERATORS.includes(op)) return [null, null];
    if (this.getPredicateValueType(predicate) === 'boolean') return false;
    return null;
  }

  private dataTypeToValueType(dataType?: string): AlertValueType {
    switch ((dataType ?? '').toLowerCase()) {
      case 'number':
      case 'numeric':
      case 'integer':
      case 'int':
      case 'float':
      case 'double':
      case 'decimal':
        return 'number';
      case 'date':
      case 'datetime':
      case 'timestamp':
      case 'time':
        return 'date';
      case 'boolean':
      case 'bool':
        return 'boolean';
      default:
        return 'string';
    }
  }

  private async loadDistinctValues(ref: string): Promise<void> {
    if (!ref || this.valuesCache[ref] || !this.distinctValuesFetcher) return;
    this.loadingValues[ref] = true;
    try {
      this.valuesCache[ref] = await this.distinctValuesFetcher(ref);
    } catch {
      this.valuesCache[ref] = [];
    } finally {
      this.loadingValues[ref] = false;
      this.cdr.markForCheck();
    }
  }

  /* ── (de)serialisation ──────────────────────────────────────────── */

  /** Serialise into the shape the mirrored addAlertSchema expects. */
  getPayload(): {
    mode: AlertConditionMode;
    conditionBuilder: any;
    conditionExpression: string | null;
  } {
    const raw = this.conditionForm.value;
    if (raw.mode === 'expression') {
      return {
        mode: 'expression',
        conditionBuilder: undefined,
        conditionExpression: (raw.expression ?? '').trim() || null,
      };
    }
    const groups = (raw.groups ?? []).map((g: any) => ({
      join: g.join,
      predicates: (g.predicates ?? []).map((p: any) => ({
        left: {
          kind: p.left.kind,
          ref: p.left.ref,
          aggregate: p.left.aggregate ?? 'none',
        },
        operator: p.operator,
        right: {
          value: NULLARY_OPERATORS.includes(p.operator)
            ? undefined
            : p.right.value,
          valueType: p.right.valueType,
        },
      })),
    }));
    return {
      mode: 'builder',
      conditionBuilder: { groups },
      conditionExpression: null,
    };
  }

  /** Hydrate the form from a saved rule (edit page). */
  patch(rule: {
    conditionMode?: AlertConditionMode;
    conditionBuilder?: any;
    conditionExpression?: string | null;
  }): void {
    const mode: AlertConditionMode = rule.conditionMode ?? 'builder';
    this.conditionForm.get('mode')?.setValue(mode, { emitEvent: false });
    this.conditionForm
      .get('expression')
      ?.setValue(rule.conditionExpression ?? '', { emitEvent: false });

    this.groups.clear();
    const savedGroups: any[] = rule.conditionBuilder?.groups ?? [];
    if (savedGroups.length === 0) {
      this.groups.push(this.createGroup());
    } else {
      savedGroups.forEach(g => {
        const predicates = this.fb.array<FormGroup>([]);
        (g.predicates ?? []).forEach((p: any) => {
          const pg = this.createPredicate();
          pg.get('left.kind')?.setValue(p.left?.kind ?? 'field', {
            emitEvent: false,
          });
          pg.get('left.ref')?.setValue(p.left?.ref ?? '', { emitEvent: false });
          pg.get('left.aggregate')?.setValue(p.left?.aggregate ?? 'none', {
            emitEvent: false,
          });
          pg.get('operator')?.setValue(p.operator ?? 'gt', {
            emitEvent: false,
          });
          pg.get('right.valueType')?.setValue(p.right?.valueType ?? 'number', {
            emitEvent: false,
          });
          pg.get('right.value')?.setValue(p.right?.value ?? null, {
            emitEvent: false,
          });
          predicates.push(pg);
          if ((p.right?.valueType ?? 'number') === 'string' && p.left?.ref) {
            this.loadDistinctValues(p.left.ref);
          }
        });
        if (predicates.length === 0) predicates.push(this.createPredicate());
        this.groups.push(
          this.fb.group({ join: [g.join ?? 'AND'], predicates }),
        );
      });
    }
    this.conditionForm.updateValueAndValidity();
    this.cdr.markForCheck();
  }

  get valid(): boolean {
    if (this.mode === 'expression') {
      const expr = (this.conditionForm.get('expression')?.value ?? '').trim();
      return expr.length > 0;
    }
    return this.groups.valid;
  }

  private emit(): void {
    const payload = this.getPayload();
    this.conditionChange.emit({ valid: this.valid, ...payload });
  }

  trackByIndex(index: number): number {
    return index;
  }
}
