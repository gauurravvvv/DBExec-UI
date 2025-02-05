import { NgModule } from "@angular/core";
import { AppSharedModule } from "src/app/shared/modules/app-shared.module";

@NgModule({
  imports: [AppSharedModule],
  exports: [AppSharedModule],
  providers: [],
})
export class RootModule {}
