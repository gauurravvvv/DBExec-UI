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
import type {
  AnalysisParameter,
  ParameterValue,
} from '../../models/analysis-parameter.model';
import { parameterValueType } from '../../models/analysis-parameter.model';
import type { ValueType } from '../../utils/field-type.util';

/**
 * AnalysisParameterBar — surfaces an analysis's typed parameters (spec
 * §4.1 / §6) as a compact row of controls above the canvas. Each
 * parameter renders through the shared TypedValueInput so its `dataType`
 * deterministically selects the control (number → numeric, date →
 * calendar, string/enum → dropdown, boolean → toggle).
 *
 * The bar owns only the in-flight values; it emits `apply` with the
 * resolved `{ key, value }[]` when the user commits, and the host feeds
 * those into runAnalysisQuery({ parameters }). Values are seeded from
 * each parameter's `defaultValue` on load so the first run has sane
 * inputs. Required parameters gate the Apply button.
 */
@Component({
  selector: 'app-analysis-parameter-bar',
  templateUrl: './analysis-parameter-bar.component.html',
  styleUrls: ['./analysis-parameter-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisParameterBarComponent implements OnChanges {
  private cdr = inject(ChangeDetectorRef);

  /** Parameters to render (ordered by sequence upstream). */
  @Input() parameters: AnalysisParameter[] = [];

  /** Emitted when the user applies parameter values (or on auto-apply). */
  @Output() apply = new EventEmitter<ParameterValue[]>();

  /** Current value per parameter key. */
  values: Record<string, any> = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['parameters']) {
      this.seedDefaults();
    }
  }

  /** Seed each parameter's value from its defaultValue (once, on load). */
  private seedDefaults(): void {
    const next: Record<string, any> = {};
    for (const p of this.parameters || []) {
      // Preserve any value the user already set for a key that survived
      // a parameters refresh; otherwise fall back to the default.
      next[p.key] =
        this.values[p.key] !== undefined
          ? this.values[p.key]
          : (p.defaultValue ?? null);
    }
    this.values = next;
    this.cdr.markForCheck();
  }

  /** Value type for a parameter → drives the TypedValueInput control. */
  valueTypeFor(p: AnalysisParameter): ValueType {
    return parameterValueType(p);
  }

  /** Options for the string/enum control. */
  optionsFor(p: AnalysisParameter): { label: string; value: any }[] {
    if (p.dataType !== 'enum' || !Array.isArray(p.allowedValues)) return [];
    return p.allowedValues.map(o => ({ label: o.label, value: o.value }));
  }

  /** enum parameters constrain to the allowed list — no free-text. */
  allowCustomFor(p: AnalysisParameter): boolean {
    return p.dataType !== 'enum';
  }

  onValueChange(p: AnalysisParameter, value: any): void {
    this.values[p.key] = value;
  }

  /** A required parameter with no value blocks Apply. */
  get hasMissingRequired(): boolean {
    return (this.parameters || []).some(p => {
      if (!p.isRequired) return false;
      const v = this.values[p.key];
      return v === null || v === undefined || v === '';
    });
  }

  applyValues(): void {
    const resolved: ParameterValue[] = (this.parameters || []).map(p => ({
      key: p.key,
      value: this.values[p.key] ?? null,
    }));
    this.apply.emit(resolved);
  }

  /** Reset every parameter to its default and re-apply. */
  resetValues(): void {
    this.values = {};
    this.seedDefaults();
    this.applyValues();
  }

  trackByKey(_i: number, p: AnalysisParameter): string {
    return p.key;
  }
}
