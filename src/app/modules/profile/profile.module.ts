import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { AppPrimeNGModule } from 'src/app/shared/modules/app-primeng.module';
import { SharedModule } from 'src/app/shared/shared.module';
import { ViewProfileComponent } from './components/view-profile/view-profile.component';
import { ProfileRoutingModule } from './profile-routing.module';

@NgModule({
  declarations: [ViewProfileComponent],
  imports: [CommonModule, AppPrimeNGModule, ProfileRoutingModule, SharedModule],
})
export class ProfileModule {}
