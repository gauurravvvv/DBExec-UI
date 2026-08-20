/**
 * qb-design — the admin design shell for a builder (route :id/design).
 *
 * Loads the builder to learn its datasource, then hosts the four design
 * surfaces as tabs: Form Designer (placements + groups), Joins, Output Columns
 * and Settings. Each tab is its own component; this shell only owns navigation
 * and the shared id/datasource context.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { QUERY_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { QueryBuilderService } from '../../services/query-builder.service';

type DesignTab = 'form' | 'joins' | 'columns' | 'settings';

@Component({
  selector: 'app-qb-design',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-design.component.html',
  styleUrls: ['./qb-design.component.scss'],
})
export class QbDesignComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly qbService = inject(QueryBuilderService);
  private readonly global = inject(GlobalService);

  readonly queryBuilderId = signal<string>('');
  readonly connectorId = signal<string>('');
  readonly name = signal<string>('');
  readonly loading = signal(true);
  readonly activeTab = signal<DesignTab>('form');

  readonly tabs: { key: DesignTab; label: string; icon: string }[] = [
    { key: 'form', label: 'QUERY_BUILDER.TAB_FORM', icon: 'pi pi-th-large' },
    { key: 'joins', label: 'QUERY_BUILDER.TAB_JOINS', icon: 'pi pi-sitemap' },
    {
      key: 'columns',
      label: 'QUERY_BUILDER.TAB_COLUMNS',
      icon: 'pi pi-list',
    },
    {
      key: 'settings',
      label: 'QUERY_BUILDER.TAB_SETTINGS',
      icon: 'pi pi-cog',
    },
  ];

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.queryBuilderId.set(id);
    if (!id) {
      this.loading.set(false);
      return;
    }
    try {
      const res = await this.qbService.viewQueryBuilder(id);
      const b = res?.data;
      if (b) {
        this.connectorId.set(b.connectorId ?? b.datasource ?? '');
        this.name.set(b.name ?? '');
      }
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load the builder');
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: DesignTab): void {
    this.activeTab.set(tab);
  }

  goBack(): void {
    this.router.navigate([QUERY_BUILDER.LIST]);
  }
}
