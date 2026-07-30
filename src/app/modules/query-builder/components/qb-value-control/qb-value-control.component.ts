/**
 * qb-value-control — renders the right input for a condition's value(s), chosen
 * by prompt type x operator arity (spec 6.6.3).
 *
 * arity 'none' renders no input. arity 'two' renders two controls. Otherwise a
 * single control appropriate to the prompt type. Every control is a shared
 * app-custom-* component, so the composer inherits the app's styling and a11y.
 */
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { QbSchemaPrompt } from '../../services/qb-runtime.service';

@Component({
  selector: 'qb-value-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-value-control.component.html',
  styleUrls: ['./qb-value-control.component.scss'],
})
export class QbValueControlComponent {
  @Input({ required: true }) prompt!: QbSchemaPrompt;
  /** Operator arity — drives which control (and how many) to render. */
  @Input({ required: true }) arity!: 'none' | 'one' | 'two' | 'many';
  @Input() values: any[] = [];
  @Input() invalid = false;

  @Output() valuesChange = new EventEmitter<any[]>();

  /** Options list for select-style controls, sorted per appearance. */
  get options(): { label: string; value: string }[] {
    const vs = this.prompt.valueSource;
    if (vs.kind === 'static') {
      const opts = vs.values.map(o => ({ label: o.display, value: o.value }));
      const sort = this.prompt.appearance?.sortValues;
      if (sort === 'asc') opts.sort((a, b) => a.label.localeCompare(b.label));
      if (sort === 'desc') opts.sort((a, b) => b.label.localeCompare(a.label));
      return opts;
    }
    return [];
  }

  /** Whether this prompt offers a curated option list. */
  get hasOptions(): boolean {
    return this.prompt.valueSource.kind === 'static';
  }

  /** The single-value control kind for arity one, from the prompt type. */
  get singleControl():
    | 'dropdown'
    | 'multiselect'
    | 'text'
    | 'number'
    | 'date'
    | 'calendar'
    | 'checkbox'
    | 'radio'
    | 'rangeslider' {
    return (this.prompt.type as any) ?? 'text';
  }

  get first(): any {
    return this.values?.[0] ?? null;
  }
  get second(): any {
    return this.values?.[1] ?? null;
  }

  emitSingle(v: any): void {
    this.valuesChange.emit(v == null || v === '' ? [] : [v]);
  }

  emitMany(v: any[]): void {
    this.valuesChange.emit(Array.isArray(v) ? v : []);
  }

  emitFirst(v: any): void {
    this.valuesChange.emit([v, this.second]);
  }
  emitSecond(v: any): void {
    this.valuesChange.emit([this.first, v]);
  }

  get appearance(): any {
    return this.prompt.appearance ?? {};
  }
}
