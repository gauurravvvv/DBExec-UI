/**
 * view-query-builder — read-only detail for a builder.
 *
 * Query Builder v2: this is a lean metadata + actions screen. The old
 * tab/section prompt-preview tree is gone — running a builder is the v2
 * composer (Run → :id/compose) and configuring it is the design shell
 * (Design → :id/design). This screen shows name/description/datasource/status
 * and the Run / Design / Share / Edit / Delete actions.
 */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { QUERY_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { QueryBuilderService } from '../../services/query-builder.service';

@Component({
  selector: 'app-view-query-builder',
  templateUrl: './view-query-builder.component.html',
  styleUrls: ['./view-query-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewQueryBuilderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly globalService = inject(GlobalService);
  private readonly queryBuilderService = inject(QueryBuilderService);
  private readonly cdr = inject(ChangeDetectorRef);

  queryBuilderId = '';
  queryBuilderName = '';
  description = '';
  datasourceId = '';
  datasourceName = '';
  status = 1;
  loading = true;

  // Delete confirmation (shared .confirmation-popup pattern)
  showDeleteConfirm = false;
  deleteJustification = '';

  // Sharing (asset-share-dialog reuse, 'querybuilder' asset type)
  showShareDialog = false;

  constructor() {
    this.queryBuilderId = this.route.snapshot.params['id'];
  }

  ngOnInit(): void {
    this.loadQueryBuilderDetails();
  }

  private loadQueryBuilderDetails(): void {
    this.queryBuilderService
      .viewQueryBuilder(this.queryBuilderId)
      .then((response: any) => {
        if (response.status && response.data) {
          const b = response.data;
          this.queryBuilderName = b.name || '';
          this.description = b.description || '';
          this.datasourceId = String(b.datasourceId || '');
          this.datasourceName = b.datasourceName || b.datasource || '';
          this.status = b.status ?? 1;
        }
      })
      .catch(() => {})
      .finally(() => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  onCompose(): void {
    // Query Builder v2 — open the business-user composer (tree filters + run).
    this.router.navigate([QUERY_BUILDER.compose(this.queryBuilderId)]);
  }

  onDesign(): void {
    // Query Builder v2 — open the admin design shell.
    this.router.navigate([QUERY_BUILDER.design(this.queryBuilderId)]);
  }

  onShare(): void {
    this.showShareDialog = true;
  }

  onShareClosed(): void {
    this.showShareDialog = false;
  }

  onEdit(): void {
    this.router.navigate([QUERY_BUILDER.edit(this.queryBuilderId)]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    if (!this.deleteJustification.trim()) return;
    this.queryBuilderService
      .delete(this.queryBuilderId, this.deleteJustification.trim())
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([QUERY_BUILDER.LIST]);
        }
      })
      .catch(() => {})
      .finally(() => {
        this.showDeleteConfirm = false;
        this.deleteJustification = '';
        this.cdr.markForCheck();
      });
  }

  goBack(): void {
    this.router.navigate([QUERY_BUILDER.LIST]);
  }
}
