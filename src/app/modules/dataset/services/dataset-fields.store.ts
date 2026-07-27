/**
 * DatasetFieldsStore — one live source of a dataset's fields.
 *
 * This is what makes field authoring seamless: creating a field patches this
 * signal instead of refetching the dataset, and every consumer updates at once —
 * the sidebar list, Monaco's `{field}` completions, and the formula dependency
 * picker. So a field created a moment ago is immediately usable in the next
 * formula with no page reload.
 *
 * Before this, each dialog close called `loadDatasetData()`, which round-tripped
 * the whole dataset and rebuilt the screen.
 */
import { Injectable, computed, signal } from '@angular/core';
import { FormulaStage } from './formula-catalog.service';

export interface DatasetFieldVm {
  id: string;
  /** Column / output name — what a formula references as {name}. */
  name: string;
  /** Display label, when it differs from the name. */
  label: string;
  /** Formula source for a derived field; null for an introspected column. */
  formula: string | null;
  dataType: string | null;
  /** Resolved execution tier for a derived field. */
  stage: FormulaStage | null;
  /**
   * Whether the field is computed at the data source (so it is filterable,
   * sortable and aggregatable) rather than after the query.
   */
  pushdownable: boolean | null;
  isCustom: boolean;
}

/** Map an API dataset-field row onto the view model. */
export function toFieldVm(row: any): DatasetFieldVm {
  const name = (row?.columnToUse || row?.columnToView || '').trim();
  return {
    id: row?.id ?? name,
    name,
    label: (row?.columnToView || name || '').trim(),
    formula: row?.customLogic ?? null,
    dataType: row?.typeOverride ?? row?.dataType ?? null,
    stage: (row?.stage as FormulaStage) ?? null,
    pushdownable: row?.pushdownable ?? null,
    isCustom: !!row?.customLogic,
  };
}

@Injectable({ providedIn: 'root' })
export class DatasetFieldsStore {
  private _fields = signal<DatasetFieldVm[]>([]);
  private _datasetId = signal<string | null>(null);

  readonly fields = this._fields.asReadonly();
  readonly datasetId = this._datasetId.asReadonly();

  /** Names a formula may reference. Feeds Monaco's field completions. */
  readonly names = computed<string[]>(() =>
    this._fields()
      .map(f => f.name)
      .filter(Boolean),
  );

  readonly customFields = computed<DatasetFieldVm[]>(() =>
    this._fields().filter(f => f.isCustom),
  );

  readonly baseFields = computed<DatasetFieldVm[]>(() =>
    this._fields().filter(f => !f.isCustom),
  );

  /** Seed from a dataset load. */
  setAll(rows: any[], datasetId?: string | null): void {
    this._fields.set((rows ?? []).map(toFieldVm).filter(f => !!f.name));
    if (datasetId !== undefined) this._datasetId.set(datasetId);
  }

  /**
   * Insert or replace one field. Matches on id first, then on name, because a
   * create response carries a new id while an edit keeps it.
   */
  upsert(row: any): void {
    const vm = toFieldVm(row);
    if (!vm.name) return;

    this._fields.update(list => {
      const index = list.findIndex(
        f => (vm.id && f.id === vm.id) || f.name === vm.name,
      );
      if (index === -1) return [...list, vm];
      const next = [...list];
      next[index] = vm;
      return next;
    });
  }

  remove(idOrName: string): void {
    this._fields.update(list =>
      list.filter(f => f.id !== idOrName && f.name !== idOrName),
    );
  }

  clear(): void {
    this._fields.set([]);
    this._datasetId.set(null);
  }
}
