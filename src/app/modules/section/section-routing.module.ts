import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { unsavedChangesGuard } from 'src/app/core/guards/unsaved-changes.guard';
import { AddSectionComponent } from './components/add-section/add-section.component';
import { EditSectionComponent } from './components/edit-section/edit-section.component';
import { ListSectionComponent } from './components/list-section/list-section.component';
import { ViewSectionComponent } from './components/view-section/view-section.component';

const routes: Routes = [
  {
    path: '',
    component: ListSectionComponent,
  },
  {
    path: 'add',
    component: AddSectionComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'view/:orgId/:id', component: ViewSectionComponent },
  {
    path: 'edit/:orgId/:id',
    component: EditSectionComponent,
    canDeactivate: [unsavedChangesGuard],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SectionRoutingModule {}
