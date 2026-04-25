import {
  HTTP_INTERCEPTORS,
  HttpClientModule,
} from '@angular/common/http';
import { NgModule, isDevMode } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgxSpinnerModule } from 'ngx-spinner';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { RippleModule } from 'primeng/ripple';
import { ToastModule } from 'primeng/toast';
import { StoreModule } from '@ngrx/store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { EffectsModule } from '@ngrx/effects';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MessageService } from 'primeng/api';
import { AppPrimeNGModule } from './shared/modules/app-primeng.module';
import { LoginComponent } from './modules/auth/components/login/login.component';
import { ForgotPasswordComponent } from './modules/auth/components/forgot-password/forgot-password.component';
import { HttpRequestInterceptor } from './core/interceptor/HttpRequestInterceptor';
import { HttpErrorInterceptor } from './core/interceptor/HttpErrorInterceptor';
import { FooterComponent } from './shared/components/layout/footer/footer.component';
import { HeaderComponent } from './shared/components/layout/header/header.component';
import { HomeComponent } from './shared/components/layout/home/home.component';
import { SidebarComponent } from './shared/components/layout/sidebar/sidebar.component';
import { ResetPasswordComponent } from './modules/auth/components/reset-password/reset-password.component';
import { SetPasswordComponent } from './modules/auth/components/set-password/set-password.component';
import { CliAuthComponent } from './modules/auth/components/cli-auth/cli-auth.component';
import { SharedModule } from './shared/shared.module';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    SetPasswordComponent,
    CliAuthComponent,
    HomeComponent,
    HeaderComponent,
    SidebarComponent,
    FooterComponent,
  ],
  imports: [
    AppRoutingModule,
    HttpClientModule,
    ToastModule,
    RippleModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    ProgressSpinnerModule,
    NgxSpinnerModule,
    DropdownModule,
    InputTextareaModule,
    AppPrimeNGModule,
    SharedModule,
    // NgRx Store
    StoreModule.forRoot({}),
    EffectsModule.forRoot([]),
    ...(isDevMode() ? [StoreDevtoolsModule.instrument({ maxAge: 25 })] : []),
  ],

  providers: [
    // Outermost: catches errors that bubble up from inner interceptors
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpErrorInterceptor,
      multi: true,
    },
    // Innermost: handles auth headers, session refresh (440), loader
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpRequestInterceptor,
      multi: true,
    },

    MessageService,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
