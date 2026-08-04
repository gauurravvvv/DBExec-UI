/**
 * qb-join-designer — READ-ONLY view of a builder's materialised joins.
 *
 * Joins are no longer hand-authored here. Each placed prompt declares (in the
 * Prompt module, via the FK join picker) the related table its column needs;
 * when the prompt is placed on a builder the server materialises the concrete
 * QueryBuilderJoin rows automatically. This screen just shows what was
 * materialised so the admin can see the FROM shape — "QB configures nothing
 * about a prompt."
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
import { GlobalService } from 'src/app/core/services/global.service';
import { QbAdminService } from '../../services/qb-admin.service';

interface JoinView {
  joinType: string;
  rightSchema: string;
  rightTable: string;
  rightAlias: string;
  onClause: string;
  cardinality: string;
}

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

  readonly joins = signal<JoinView[]>([]);
  readonly loading = signal(true);

  readonly hasJoins = computed(() => this.joins().length > 0);

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.getJoins(this.queryBuilderId);
      const rows = res?.data?.joins ?? res?.data ?? [];
      this.joins.set(
        (Array.isArray(rows) ? rows : []).map((j: any) => this.normalize(j)),
      );
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load joins');
    } finally {
      this.loading.set(false);
    }
  }

  private normalize(j: any): JoinView {
    return {
      joinType: j.joinType ?? 'LEFT',
      // The BE QueryBuilderJoin uses target*; tolerate the legacy right* too.
      rightSchema: j.targetSchema ?? j.rightSchema ?? '',
      rightTable: j.targetTable ?? j.rightTable ?? '',
      rightAlias: j.targetAlias ?? j.rightAlias ?? '',
      onClause: j.onClause ?? '',
      cardinality: j.cardinality ?? '',
    };
  }

  trackByIndex = (i: number) => i;
}
