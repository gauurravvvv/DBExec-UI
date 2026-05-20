import {
  HttpBackend,
  HttpClient,
  HttpClientModule,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { isDevMode, NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { EffectsModule } from '@ngrx/effects';
import { StoreModule } from '@ngrx/store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { NgxSpinnerModule } from 'ngx-spinner';
import { MessageService } from 'primeng/api';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { RippleModule } from 'primeng/ripple';
import { ToastModule } from 'primeng/toast';
/**
 * Build the TranslateHttpLoader against an isolated `HttpClient` that
 * sits directly on top of `HttpBackend` — bypassing the
 * `HTTP_INTERCEPTORS` chain entirely.
 *
 * Two reasons:
 *
 *   1. Static i18n assets under /assets/i18n/*.json don't need auth
 *      headers, loading spinners, or session-expired handling. Running
 *      them through the auth interceptor adds work for no benefit.
 *
 *   2. The old factory pulled `HttpClient` from root, which is itself
 *      built from `HTTP_INTERCEPTORS`. Since our HttpRequestInterceptor
 *      injects `TranslateService` (for the JWT-locale claim's error
 *      messages), that closes a DI cycle (NG0200):
 *
 *        HTTP_INTERCEPTORS
 *          -> HttpRequestInterceptor
 *            -> TranslateService          (constructor)
 *              -> TranslateLoader factory
 *                -> HttpClient            (root, awaits HTTP_INTERCEPTORS)
 *                  -> HTTP_INTERCEPTORS   (cycle)
 *
 * Using HttpBackend cuts the cycle: `new HttpClient(handler)` against
 * the raw backend never asks for `HTTP_INTERCEPTORS`, so TranslateService
 * can finish constructing without the interceptor chain being resolved.
 */
export function HttpLoaderFactory(handler: HttpBackend) {
  const http = new HttpClient(handler);
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HttpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { HttpRequestInterceptor } from './core/interceptors/http-request.interceptor';
import { FooterComponent } from './core/layout/footer/footer.component';
import { HeaderComponent } from './core/layout/header/header.component';
import { HomeComponent } from './core/layout/home/home.component';
import { SidebarComponent } from './core/layout/sidebar/sidebar.component';
import { AuthModule } from './modules/auth/auth.module';
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
        deps: [HttpBackend],
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
