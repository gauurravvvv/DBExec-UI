import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PermissionService } from 'src/app/core/services/permission.service';

/** One tab in an app-tabs strip. `value` is the stable identity emitted on
 *  change (use it in your *ngSwitch / *ngIf). `label` is an i18n key
 *  (translated inside the component) unless `labelPlain` is set. */
export interface AppTab {
  /** Stable identity for this tab (emitted by activeChange). */
  value: string;
  /** i18n key for the tab label (run through | translate). */
  label: string;
  /** Optional leading PrimeIcon class (e.g. `pi pi-palette`). */
  icon?: string;
  /** Optional permission value — the tab hides unless the user holds it
   *  at read level (mirrors *hasPermission). Omit = always shown. */
  permission?: string;
  /** Optional trailing count badge. `null`/omitted = hidden. */
  count?: number | null;
  /** Disable this tab (not selectable). */
  disabled?: boolean;
}

/**
 * app-tabs — the single canonical tab strip for the whole app.
 *
 * Renders ONLY the themed tab header (no panels): a horizontal strip of
 * tab buttons with an active underline. Tab BODIES stay in the caller's
 * template, shown/hidden by the caller against the active `value` (e.g.
 * `[ngSwitch]="active"`). This keeps the shared component pure-CSS and
 * free of PrimeNG's `p-tabView` DOM/quirks, so every tabbed screen reads
 * one identical, fully theme-driven look (colours/spacing/typography all
 * come from the CSS custom properties in `_theme-variables.scss`, incl.
 * dark).
 *
 * Replaces the 4+ divergent hand-rolled `::ng-deep .p-tabview` overrides
 * scattered across modules (App Settings, System Settings, view-dataset,
 * view-alert), each of which had drifted on colour/size.
 *
 * Usage:
 *   <app-tabs
 *     [tabs]="tabs"
 *     [(active)]="activeTab"
 *     (activeChange)="onTabChange($event)">
 *   </app-tabs>
 *
 *   <ng-container [ngSwitch]="activeTab">
 *     <app-list-themes   *ngSwitchCase="'theme'"></app-list-themes>
 *     <app-list-branding *ngSwitchCase="'branding'"></app-list-branding>
 *   </ng-container>
 *
 * `tabs` is `AppTab[]`; per-tab `permission` gates visibility (read level).
 * `active` is two-way bindable and also emits `activeChange` on user click.
 */
@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabsComponent {
  private readonly permission = inject(PermissionService);

  /** Tabs to render, in order. */
  @Input() tabs: AppTab[] = [];

  /** The active tab's `value`. Two-way bindable via `[(active)]`. */
  @Input() active = '';
  @Output() activeChange = new EventEmitter<string>();

  /** Visual density: `default` (page hubs) or `compact` (dense detail views). */
  @Input() size: 'default' | 'compact' = 'default';

  /** Stretch tabs to fill the strip width (equal share) instead of hugging left. */
  @Input() fill = false;

  /** Tabs the current user may see (a `permission` value is checked at read
   *  level; tabs without one are always shown). */
  get visibleTabs(): AppTab[] {
    return this.tabs.filter(
      t => !t.permission || this.permission.canRead(t.permission),
    );
  }

  trackByValue(_i: number, t: AppTab): string {
    return t.value;
  }

  isActive(t: AppTab): boolean {
    return t.value === this.active;
  }

  select(t: AppTab): void {
    if (t.disabled || t.value === this.active) return;
    this.active = t.value;
    this.activeChange.emit(t.value);
  }

  hasCount(t: AppTab): boolean {
    return t.count !== null && t.count !== undefined;
  }
}
