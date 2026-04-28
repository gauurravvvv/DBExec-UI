import { HttpClient, HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { isDevMode, NgModule } from '@angular/core';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { NgxSpinnerModule } from 'ngx-spinner';
import { MessageService } from 'primeng/api';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { RippleModule } from 'primeng/ripple';
import { ToastModule } from 'primeng/toast';
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HttpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { HttpRequestInterceptor } from './core/interceptors/http-request.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { FooterComponent } from './shared/components/layout/footer/footer.component';
import { HeaderComponent } from './shared/components/layout/header/header.component';
import { HomeComponent } from './shared/components/layout/home/home.component';
import { SidebarComponent } from './shared/components/layout/sidebar/sidebar.component';
import { AppPrimeNGModule } from './shared/modules/app-primeng.module';
import { SharedModule } from './shared/shared.module';

@NgModule({
  declarations: [
    AppComponent,
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
    AuthModule,
    // i18n
    TranslateModule.forRoot({
      defaultLanguage: 'en',
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),
    // NgRx Store
    StoreModule.forRoot({}),
    EffectsModule.forRoot([]),
    StoreDevtoolsModule.instrument({
      maxAge: 25,
      logOnly: !isDevMode(),
    }),
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
