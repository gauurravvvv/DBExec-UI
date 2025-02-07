import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AngularEditorModule } from '@kolkov/angular-editor';
import { IvyCarouselModule } from 'angular-responsive-carousel';
import { NgxSpinnerModule } from 'ngx-spinner';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { RippleModule } from 'primeng/ripple';
import { ToastModule } from 'primeng/toast';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MessageService } from 'primeng/api';
import { AppPrimeNGModule } from './shared/modules/app-primeng.module';
import { LoginComponent } from './modules/auth/components/login/login.component';
import { ForgotPasswordComponent } from './modules/auth/components/forgot-password/forgot-password.component';
import { HttpRequestInterceptor } from './core/interceptor/HttpRequestInterceptor';
import { EmptyRootComponent } from './modules/dashboard/empty-root/empty-root.component';
import { FooterComponent } from './modules/layout/footer/footer.component';
import { HeaderComponent } from './modules/layout/header/header.component';
import { HomeComponent } from './modules/layout/home/home.component';
import { SidebarComponent } from './modules/layout/sidebar/sidebar.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    ForgotPasswordComponent,
    HomeComponent,
    HeaderComponent,
    SidebarComponent,
    FooterComponent,
  ],
  imports: [
    AppRoutingModule,
    HttpClientModule,
    AngularEditorModule,
    ToastModule,
    RippleModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    ProgressSpinnerModule,
    IvyCarouselModule,
    NgxSpinnerModule,
    DropdownModule,
    InputTextareaModule,
    AppPrimeNGModule,
  ],

  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpRequestInterceptor,
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
