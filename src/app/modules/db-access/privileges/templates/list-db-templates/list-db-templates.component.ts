import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import { DbTemplateService } from '../../../services/db-template.service';

/**
 * ListDbTemplatesComponent — manage the org's reusable role/privilege
 * templates (PDM D10). Server-paged `app-custom-table`; built-ins show a
 * read-only badge and hide Edit/Delete. Reached from the Privileges header
 * ("Templates"); no new sidebar entry.
 */
@Component({
  selector: 'app-list-db-templates',
  templateUrl: './list-db-templates.component.html',
  styleUrls: ['./list-db-templates.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDbTemplatesComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private tpl = inject(DbTemplateService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private globalService = inject(GlobalService);

  /** Embedded in the Privileges hub — hide this list's own header (back button
   *  + title + subtitle); the hub owns the title. The Add + row-edit actions
   *  still navigate to the templates sub-pages. */
  @Input() embedded = false;

  loading = this.tpl.loading;
  saving = this.tpl.saving;

  rows: any[] = [];
  cols: CustomTableColumn[] = [];
  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'search',
    showColumnFilters: false,
    enableExport: false,
    gridKey: 'db-templates-list',
    height: 'flex',
    rowIdField: 'id',
  };
  adapter: UsServerListAdapter<Record<string, unknown>> | undefined;

  // Delete confirm.
  showDelete = false;
  deleteTarget: any = null;

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant(k);
    this.cols = [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '260px', frozen: true },
      { colId: 'scope', field: 'scope', header: t('DB_ACCESS.SCOPE'), width: '160px', sortable: false },
      { colId: 'builtIn', field: 'builtIn', header: t('DB_ACCESS.TYPE'), width: '130px', sortable: false },
      { colId: 'description', field: 'description', header: t('COMMON.DESCRIPTION'), width: '360px', sortable: false },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '140px', sortable: false },
    ];
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: t('DB_ACCESS.SEARCH_TEMPLATES_PLACEHOLDER'),
    };
    this.buildAdapter();
  }

  ngOnDestroy(): void {
    this.adapter?.destroy();
  }

  private buildAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<Record<string, unknown>>({
      load: p => {
        const filter = p.filter ? JSON.parse(p.filter) : {};
        return this.tpl
          .list({
            search: filter.search,
            page: p.page,
            limit: p.limit,
          })
          .then(res => {
            const items = res?.status ? (res.data?.items ?? []) : [];
            this.rows = items;
            return { rows: items, total: res?.data?.count ?? items.length };
          });
      },
      unwrap: (res: any) => ({ rows: res.rows, total: res.total }),
      initial: { page: 1, limit: 50 },
    });
  }

  scopeLabel(row: any): string {
    return row.datasourceId
      ? this.translate.instant('DB_ACCESS.SCOPE_DATASOURCE')
      : this.translate.instant('DB_ACCESS.SCOPE_ORG_WIDE');
  }

  onAdd(): void {
    this.router.navigate([DB_ACCESS.templateNew()]);
  }
  onEdit(row: any): void {
    if (row.isBuiltIn) return;
    this.router.navigate([DB_ACCESS.templateEdit(row.id)]);
  }

  openDelete(row: any): void {
    if (row.isBuiltIn) return;
    this.deleteTarget = row;
    this.showDelete = true;
  }
  cancelDelete(): void {
    this.showDelete = false;
    this.deleteTarget = null;
  }
  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.tpl
      .bulkDelete([this.deleteTarget.id])
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showDelete = false;
          this.deleteTarget = null;
          this.adapter?.reload();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.PRIVILEGES_LIST]);
  }
}
