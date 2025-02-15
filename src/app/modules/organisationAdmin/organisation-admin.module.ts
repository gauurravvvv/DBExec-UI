import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from 'src/app/shared/shared.module';
// ... other imports

@NgModule({
  declarations: [
    // ... other components
  ],
  imports: [
    CommonModule,
    SharedModule,
    // ... other modules
  ],
})
export class OrganisationAdminModule {}
