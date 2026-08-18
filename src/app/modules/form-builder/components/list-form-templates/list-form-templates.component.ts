/**
 * ListFormTemplatesComponent — the org's reusable form templates, with a Clone
 * action that creates a NEW family + draft from a template's payload and
 * navigates to it. Read on init; clone is WRITE (gated by formBuilderScreen).
 *
 * Renders through the shared <app-custom-table> so it looks identical to every
 * other listing. Templates are few, so the adapter loads them all in one call
 * (no real server paging) and reports total from the array length.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { FORM_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import {
  FormPortabilityService,
  FormTemplateRow,
} from '../../services/form-portability.service';

@Component({
  selector: 'app-list-form-templates',
  templateUrl: './list-form-templates.component.html',
  styleUrls: ['./list-form-templates.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListFormTemplatesComponent implements OnInit, OnDestroy {
  private readonly portability = inject(FormPortabilityService);
  private readonly global = inject(GlobalService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly routes = FORM_BUILDER;
  /** id of the template a clone is in flight for (per-row spinner). */
  readonly cloningId = signal<string | null>(null);

  cols: CustomTableColumn[] = [];
  tableConfig: CustomTableConfig = {
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'name',
    gridKey: 'form-templates-list',
    height: 'flex',
    rowIdField: 'id',
  };

  // Templates are few — load them all in one call and report total from the
  // returned array. `listTemplates()` resolves to a bare FormTemplateRow[].
  adapter = new UsServerListAdapter<any>({
    load: () => this.portability.listTemplates(),
    unwrap: (res: unknown) => {
      const rows = (res as FormTemplateRow[]) ?? [];
      return { rows, total: rows.length };
    },
    initial: { page: 1, limit: 50 },
  });

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant(k);
    this.cols = [
      {
        colId: 'name',
        field: 'name',
        header: t('COMMON.NAME'),
        width: '260px',
        frozen: true,
      },
      {
        colId: 'description',
        field: 'description',
        header: t('COMMON.DESCRIPTION'),
        width: '320px',
        sortable: false,
      },
      {
        colId: 'sourceVersion',
        field: 'sourceVersionNo',
        header: t('FORM_BUILDER.PORTABILITY.SOURCE_VERSION'),
        width: '160px',
        sortable: false,
      },
      {
        colId: 'updated',
        field: 'createdOn',
        header: t('FORM_BUILDER.COL_UPDATED'),
        width: '200px',
        sortable: false,
      },
      {
        colId: 'actions',
        header: t('COMMON.ACTIONS'),
        width: '160px',
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

  async onClone(template: FormTemplateRow): Promise<void> {
    if (this.cloningId()) return;
    this.cloningId.set(template.id);
    try {
      const result = await this.portability.cloneTemplate(template.id);
      this.global.showInfo(
        this.translate.instant('FORM_BUILDER.PORTABILITY.CLONED'),
      );
      this.router.navigateByUrl(this.routes.view(result.formId));
    } catch (e: any) {
      const key = e?.message || 'FORM_BUILDER.PORTABILITY.CLONE_FAILED';
      this.global.showWarn(this.translate.instant(key));
    } finally {
      this.cloningId.set(null);
    }
  }
}
