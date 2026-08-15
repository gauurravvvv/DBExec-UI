import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { FORM_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import {
  UsListLoadParams,
  UsServerListAdapter,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import { FbAdminService } from '../../services/fb-admin.service';

/**
 * Form Builder list — an `<app-custom-table>` driven by a `UsServerListAdapter`
 * over `FbAdminService.listForms`. Toolbar "New Form" + per-row Open / Design /
 * Run / Delete. No bulk selection (matches the app-wide list convention).
 */
@Component({
  selector: 'app-list-form',
  templateUrl: './list-form.component.html',
  styleUrls: ['./list-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListFormComponent implements OnInit, OnDestroy {
  private readonly admin = inject(FbAdminService);
  private readonly router = inject(Router);
  private readonly global = inject(GlobalService);
  private readonly translate = inject(TranslateService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly routes = FORM_BUILDER;

  // Delete confirmation state.
  showDeleteConfirm = false;
  formToDelete: string | null = null;
  deleteJustification = '';

  cols: CustomTableColumn[] = [];
  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'name',
    showColumnFilters: true,
    gridKey: 'form-builder-list',
    height: 'flex',
    rowIdField: 'id',
  };

  adapter = new UsServerListAdapter<any>({
    load: (params: UsListLoadParams) => {
      const req: any = { page: params.page, limit: params.limit };
      if (params.sort) req.sort = params.sort;
      if (params.filter) req.filter = params.filter;
      return this.admin.listForms(req);
    },
    // BE returns `{ data: { forms: [], count } }`.
    unwrap: (res: any) => ({
      rows: res?.data?.forms ?? [],
      total: res?.data?.count ?? 0,
    }),
    initial: { page: 1, limit: 50 },
  });

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant(k);
    this.cols = [
      {
        colId: 'name',
        field: 'name',
        header: t('FORM_BUILDER.COL_NAME'),
        width: '260px',
        frozen: true,
        filter: 'text',
      },
      {
        colId: 'datasourceName',
        field: 'datasourceName',
        header: t('FORM_BUILDER.COL_DATASOURCE'),
        width: '220px',
        sortable: false,
      },
      {
        colId: 'status',
        field: 'publishedVersion',
        header: t('FORM_BUILDER.COL_STATUS'),
        width: '160px',
        sortable: false,
      },
      {
        colId: 'updatedAt',
        field: 'updatedAt',
        header: t('FORM_BUILDER.COL_UPDATED'),
        width: '192px',
        sortable: false,
      },
      {
        colId: 'actions',
        header: t('COMMON.ACTIONS'),
        width: '184px',
        sortable: false,
      },
    ];
  }

  ngOnDestroy(): void {
    this.adapter?.destroy();
  }

  refreshList(): void {
    this.adapter?.reload();
  }

  newForm(): void {
    this.router.navigate([FORM_BUILDER.NEW]);
  }

  onOpen(id: string): void {
    this.router.navigate([FORM_BUILDER.view(id)]);
  }
  onDesign(id: string): void {
    this.router.navigate([FORM_BUILDER.design(id)]);
  }
  onRun(id: string): void {
    this.router.navigate([FORM_BUILDER.compose(id)]);
  }

  confirmDelete(id: string): void {
    this.formToDelete = id;
    this.showDeleteConfirm = true;
  }
  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.formToDelete = null;
    this.deleteJustification = '';
  }
  proceedDelete(): void {
    const reason = this.deleteJustification.trim();
    if (!reason || !this.formToDelete) return;
    this.admin
      .deleteForm(this.formToDelete)
      .then(res => {
        if (this.global.handleSuccessService(res)) this.refreshList();
      })
      .catch(() => {})
      .finally(() => {
        this.cancelDelete();
        this.cdr.markForCheck();
      });
  }
}
