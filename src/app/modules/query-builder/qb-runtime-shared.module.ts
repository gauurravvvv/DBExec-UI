/**
 * QbRuntimeSharedModule — the reusable tree->SQL runtime components, with NO
 * routes. Declared once here and exported so both QueryBuilderModule and
 * FormBuilderModule can render <qb-filter-tree>/<qb-condition-row>/etc. without
 * pulling QB's routes.
 *
 * QueryBuilderStore is provided per-component (in each runtime screen's
 * providers), not here, so every open composer gets its own tree instance; the
 * FormRuntimeStore extends it, so the same components drive the form composer.
 * QbRuntimeService is providedIn:'root'.
 */
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared';
import { ButtonComponent } from 'src/app/shared/components/button/button.component';
import { ChipComponent } from 'src/app/shared/components/chip/chip.component';
import { EmailChipsInputComponent } from 'src/app/shared/components/email-chips-input/email-chips-input.component';
import { QbConditionRowComponent } from './components/qb-condition-row/qb-condition-row.component';
import { QbFilterTreeComponent } from './components/qb-filter-tree/qb-filter-tree.component';
import { QbGroupNodeComponent } from './components/qb-group-node/qb-group-node.component';
import { QbSqlPreviewComponent } from './components/qb-sql-preview/qb-sql-preview.component';
import { QbSummaryComponent } from './components/qb-summary/qb-summary.component';
import { QbValueControlComponent } from './components/qb-value-control/qb-value-control.component';

@NgModule({
  declarations: [
    QbFilterTreeComponent,
    QbGroupNodeComponent,
    QbConditionRowComponent,
    QbValueControlComponent,
    QbSqlPreviewComponent,
    QbSummaryComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    AppPrimeNGModule,
    SharedModule,
    // Standalone shared controls the runtime tree renders.
    ButtonComponent,
    ChipComponent,
    EmailChipsInputComponent,
  ],
  exports: [
    QbFilterTreeComponent,
    QbGroupNodeComponent,
    QbConditionRowComponent,
    QbValueControlComponent,
    QbSqlPreviewComponent,
    QbSummaryComponent,
  ],
})
export class QbRuntimeSharedModule {}
