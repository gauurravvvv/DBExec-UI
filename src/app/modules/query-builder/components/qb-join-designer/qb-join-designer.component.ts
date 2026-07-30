/**
 * qb-join-designer — admin CRUD over a builder's QueryBuilderJoin edges.
 *
 * A builder's base table plus zero or more join edges (spec §4.5/§8.4). Each
 * edge names the left alias+column and the right schema.table alias+column, the
 * join type and cardinality. The server resolves and de-duplicates these into
 * the FROM clause at compile time; here the admin just curates the set.
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { QbAdminService, QbJoin } from '../../services/qb-admin.service';

@Component({
  selector: 'qb-join-designer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-join-designer.component.html',
  styleUrls: ['./qb-join-designer.component.scss'],
})
export class QbJoinDesignerComponent implements OnInit {
  @Input({ required: true }) queryBuilderId!: string;

  private readonly admin = inject(QbAdminService);
  private readonly global = inject(GlobalService);
  private readonly translate = inject(TranslateService);

  readonly joins = signal<QbJoin[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly hasJoins = computed(() => this.joins().length > 0);

  readonly joinTypes = [
    { label: 'INNER', value: 'inner' },
    { label: 'LEFT', value: 'left' },
    { label: 'RIGHT', value: 'right' },
    { label: 'FULL', value: 'full' },
  ];

  // Pre-translate the cardinality labels — app-custom-dropdown renders
  // optionLabel verbatim, so the translate pipe can't run inside it.
  readonly cardinalities = [
    { key: 'QUERY_BUILDER.JOIN_ONE_TO_ONE', value: 'one_to_one' },
    { key: 'QUERY_BUILDER.JOIN_ONE_TO_MANY', value: 'one_to_many' },
    { key: 'QUERY_BUILDER.JOIN_MANY_TO_ONE', value: 'many_to_one' },
    { key: 'QUERY_BUILDER.JOIN_MANY_TO_MANY', value: 'many_to_many' },
  ].map(c => ({ label: this.translate.instant(c.key), value: c.value }));

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.getJoins(this.queryBuilderId);
      const rows = res?.data?.joins ?? res?.data ?? [];
      this.joins.set(
        (Array.isArray(rows) ? rows : []).map((j: any, i: number) =>
          this.normalize(j, i),
        ),
      );
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load joins');
    } finally {
      this.loading.set(false);
    }
  }

  private normalize(j: any, i: number): QbJoin {
    return {
      id: j.id,
      joinType: j.joinType ?? 'inner',
      leftAlias: j.leftAlias ?? '',
      leftColumn: j.leftColumn ?? '',
      rightSchema: j.rightSchema ?? '',
      rightTable: j.rightTable ?? '',
      rightAlias: j.rightAlias ?? '',
      rightColumn: j.rightColumn ?? '',
      cardinality: j.cardinality ?? 'many_to_one',
      sequence: j.sequence ?? i,
    };
  }

  addJoin(): void {
    this.joins.update(js => [
      ...js,
      this.normalize({}, js.length),
    ]);
  }

  removeJoin(index: number): void {
    this.joins.update(js => js.filter((_, i) => i !== index));
  }

  patch(index: number, key: keyof QbJoin, value: any): void {
    this.joins.update(js =>
      js.map((j, i) => (i === index ? { ...j, [key]: value } : j)),
    );
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const payload = this.joins().map((j, i) => ({ ...j, sequence: i }));
      const res = await this.admin.saveJoins(this.queryBuilderId, payload);
      this.global.handleAPIResponse(res);
    } catch (e: any) {
      this.applyErrors(e?.error);
    } finally {
      this.saving.set(false);
    }
  }

  private applyErrors(res: any): void {
    this.global.showWarn(res?.message || 'Save failed');
  }

  trackByIndex = (i: number) => i;
}
