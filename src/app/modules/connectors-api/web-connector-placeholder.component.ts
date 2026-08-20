import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Placeholder screen for Web/REST connectors (permission `connectorsApi`).
 * The real Postman-style API Studio workspace is not built yet; this keeps
 * the Connectors → Web/REST sidebar entry navigable and the permission
 * grantable end-to-end. Replaced by the API Studio module when that feature
 * lands.
 */
@Component({
  selector: 'app-web-connector-placeholder',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wc-wrapper">
      <div class="wc-card">
        <i class="ti ti-api wc-icon"></i>
        <h1>{{ 'CONNECTORS_API.TITLE' | translate }}</h1>
        <p>{{ 'CONNECTORS_API.COMING_SOON' | translate }}</p>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .wc-wrapper {
        min-height: calc(100vh - 140px);
        display: grid;
        place-items: center;
        padding: var(--space-8);
      }
      .wc-card {
        text-align: center;
        max-width: 460px;
        background: var(--card-background);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        padding: var(--space-10) var(--space-9);
      }
      .wc-icon {
        font-size: 48px;
        color: var(--primary-color);
        display: block;
        margin-bottom: var(--space-6);
      }
      .wc-card h1 {
        font-size: var(--fs-h1);
        margin: 0 0 var(--space-4);
        color: var(--text-color);
      }
      .wc-card p {
        font-size: var(--fs-body);
        color: var(--text-color-secondary);
        margin: 0;
      }
    `,
  ],
})
export class WebConnectorPlaceholderComponent {}
