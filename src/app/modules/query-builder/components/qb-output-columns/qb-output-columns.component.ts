/**
 * qb-output-columns — admin editor for a builder's ordered SELECT columns.
 *
 * Output columns are independent of filters (spec §5/§10.2): what the query
 * returns, in order. Each row is an expression + alias; the list is reorderable
 * by drag. Persisted via QbAdminService.saveOutputColumns.
 */
import {
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { QbAdminService, QbOutputColumn } from '../../services/qb-admin.service';

@Component({
  selector: 'qb-output-columns',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-output-columns.component.html',
  styleUrls: ['./qb-output-columns.component.scss'],
})
export class QbOutputColumnsComponent implements OnInit {
  @Input({ required: true }) queryBuilderId!: string;

  private readonly admin = inject(QbAdminService);
  private readonly global = inject(GlobalService);

  readonly columns = signal<QbOutputColumn[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly hasColumns = computed(() => this.columns().length > 0);

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.getOutputColumns(this.queryBuilderId);
      const cols = res?.data?.outputColumns ?? res?.data ?? [];
      this.columns.set(
        (Array.isArray(cols) ? cols : []).map((c: any, i: number) => ({
          expr: c.expr ?? '',
          alias: c.alias ?? '',
          sequence: c.sequence ?? i,
        })),
      );
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load output columns');
    } finally {
      this.loading.set(false);
    }
  }

  addColumn(): void {
    this.columns.update(cols => [
      ...cols,
      { expr: '', alias: '', sequence: cols.length },
    ]);
  }

  removeColumn(index: number): void {
    this.columns.update(cols => cols.filter((_, i) => i !== index));
  }

  setExpr(index: number, expr: string): void {
    this.columns.update(cols =>
      cols.map((c, i) => (i === index ? { ...c, expr } : c)),
    );
  }

  setAlias(index: number, alias: string): void {
    this.columns.update(cols =>
      cols.map((c, i) => (i === index ? { ...c, alias } : c)),
    );
  }

  drop(event: CdkDragDrop<QbOutputColumn[]>): void {
    this.columns.update(cols => {
      const next = [...cols];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const payload = this.columns().map((c, i) => ({ ...c, sequence: i }));
      const res = await this.admin.saveOutputColumns(
        this.queryBuilderId,
        payload,
      );
      this.global.handleAPIResponse(res);
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  trackByIndex = (i: number) => i;
}
