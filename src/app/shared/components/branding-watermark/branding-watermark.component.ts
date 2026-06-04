import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { BrandingService } from 'src/app/core/services/branding.service';

/**
 * BrandingWatermarkComponent — bottom-right overlay shown on every
 * authenticated screen when the org has the watermark enabled in
 * their branding settings.
 *
 * Architecture:
 *  - Mounted ONCE at the app root (app.component.html) so it overlays
 *    every page automatically without per-route wiring.
 *  - Reads from BrandingService.branding() — a signal seeded by the
 *    login + refresh-token responses. When the signal is null
 *    (no auth / system admin / branding fetch failed) OR
 *    `showWatermark === false`, the template short-circuits and the
 *    host element produces no rendered surface. Auth screens are
 *    handled implicitly because the auth shell calls
 *    brandingService.clear() on mount, which nulls the signal.
 *  - `position: fixed` with `pointer-events: none` on the host so the
 *    overlay never reflows page content or intercepts clicks.
 *
 * Text rendering:
 *  - Persisted `watermarkText` (3-30 chars) is rendered LITERALLY.
 *    No `{orgName}` substitution — the org admin sees in the settings
 *    preview exactly what end users will see.
 *
 * Colour application:
 *  - watermarkBgColor / watermarkTextColor are bound via [style.*]
 *    on the pill itself. Keeping them out of injected CSS means
 *    disabling the watermark needs no DOM cleanup beyond clearing
 *    the signal.
 */
@Component({
  selector: 'app-branding-watermark',
  templateUrl: './branding-watermark.component.html',
  styleUrls: ['./branding-watermark.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandingWatermarkComponent {
  private readonly brandingService = inject(BrandingService);

  /** Resolved label to render. Returns null when nothing should show. */
  readonly label = computed<string | null>(() => {
    const branding = this.brandingService.branding();
    if (!branding || !branding.showWatermark) return null;
    const text = (branding.watermarkText || '').trim();
    return text || null;
  });

  /** Inline background colour for the pill. Falls back to undefined
   *  so the SCSS default (translucent white) wins when the BE didn't
   *  ship a colour. */
  readonly bg = computed<string | undefined>(() => {
    const branding = this.brandingService.branding();
    return branding?.showWatermark
      ? branding.watermarkBgColor ?? undefined
      : undefined;
  });

  /** Inline text colour for the pill. Same fallback rationale as bg. */
  readonly color = computed<string | undefined>(() => {
    const branding = this.brandingService.branding();
    return branding?.showWatermark
      ? branding.watermarkTextColor ?? undefined
      : undefined;
  });
}
