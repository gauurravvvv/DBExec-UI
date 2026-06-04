import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { LOGIN_PAGE_OPTIONS } from 'src/app/core/constants/global.constant';
import { BrandingService } from 'src/app/core/services/branding.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import { environment } from 'src/environments/environment';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

/**
 * Shared shell for every auth page (login, forgot, reset, set password).
 *
 * Renders the topbar, animated gradient background, optional features
 * column, glassy login card and footer. Pages project their form into the
 * default content slot and pass title + subtitle as inputs. Keeping this
 * shell in one place is what guarantees every auth page looks identical;
 * any future change to the chrome lives here, not in each page.
 */
@Component({
  selector: 'app-auth-shell',
  templateUrl: './auth-shell.component.html',
  styleUrls: ['./auth-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent implements OnInit {
  constructor(
    private themeService: ThemeService,
    private brandingService: BrandingService,
  ) {}

  /**
   * Auth screens are always rendered with the default DBExec palette
   * and never show the watermark, regardless of which org last had a
   * session in this tab. Clearing both signals here is belt-and-
   * braces — every logout path also calls clear(), but a direct visit
   * to /login (deep link, bookmark, history) skips those paths, so
   * the shell guarantees a clean slate.
   */
  ngOnInit(): void {
    this.themeService.clear();
    this.brandingService.clear();
  }

  /** Card title — e.g. "Welcome back". */
  @Input({ required: true }) cardTitle = '';

  /** Card subtitle — e.g. "Continue to DBExec". */
  @Input() cardSubtitle = '';

  /**
   * When true, render the marketing column. Defaults to true so the
   * login page keeps its hero, but reset/set-password can hide it for a
   * narrower, more focused form-only layout if needed.
   */
  @Input() showFeatures = true;

  /** Hero heading text in the features column. */
  @Input() heroTitle = 'Turn your databases into dashboards.';

  /** Lede paragraph under the hero heading. */
  @Input() heroLede =
    'Connect a datasource, drag the charts you need, and share the ' +
    'dashboard — all in one place, no SQL required.';

  /**
   * Feature list rendered as icon-chip + title + description rows.
   * Defaults to LOGIN_PAGE_OPTIONS so the four pages stay visually
   * identical; pages can override if they want a different stance.
   */
  @Input() features: Feature[] = LOGIN_PAGE_OPTIONS;

  readonly year = new Date().getFullYear();
  readonly environment = environment;

  trackByIndex(index: number): number {
    return index;
  }
}
