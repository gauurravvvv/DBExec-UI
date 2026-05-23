/**
 * cellFormat — pure Angular pipe wrapping
 * `formatCellValue` so the result-popup template can render
 * a typed cell with one expression.
 *
 * The pipe is pure (default), which means Angular re-evaluates
 * it only when one of the inputs changes by reference. Combined
 * with the OnPush change-detection strategy on add-dataset, this
 * keeps the per-row formatting cost bounded — we don't recompute
 * cells for rows that haven't changed.
 */
import { Pipe, PipeTransform } from '@angular/core';
import {
  FormattedCell,
  formatCellValue,
} from '../helpers/cell-formatter.helper';

@Pipe({ name: 'cellFormat', pure: true })
export class CellFormatPipe implements PipeTransform {
  transform(value: unknown, type?: string): FormattedCell {
    return formatCellValue(value, type);
  }
}
