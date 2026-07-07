import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ChangeSummaryDialogComponent } from './components/change-summary-dialog/change-summary-dialog.component';
import { DatasourcePickerComponent } from './shared/datasource-picker/datasource-picker.component';

/**
 * DbAccessSharedModule — the common spine imported by the three DB-access
 * feature modules (DbUsers / DbRoles / DbPrivileges). It declares and
 * exports the shared UI (datasource picker + change-summary confirm gate)
 * and re-exports the Angular / PrimeNG / app SharedModule pieces every
 * screen needs, so each feature module imports one thing.
 *
 * The stateful services (DbAccessService, DbAccessContextService) are
 * providedIn:'root', so they are singletons shared across all three
 * sections automatically — the datasource selection + introspection cache
 * persist as the user moves between the sidebar sections.
 */
@NgModule({
  declarations: [DatasourcePickerComponent, ChangeSummaryDialogComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    AppPrimeNGModule,
    SharedModule,
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    AppPrimeNGModule,
    SharedModule,
    DatasourcePickerComponent,
    ChangeSummaryDialogComponent,
  ],
})
export class DbAccessSharedModule {}
