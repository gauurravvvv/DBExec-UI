import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * App Settings hub — a single tabbed screen (p-tabView) that hosts the
 * org look-&-feel settings: Theme, Branding, Announcements. Replaces the
 * three former standalone sidebar routes. Gated on the parent `appSettings`
 * permission; holding it shows every tab (no per-tab gating).
 *
 * The active tab is mirrored to a `?tab=` query param so a deep link / a
 * refresh lands on the same tab. Announcement add/edit/view still live at
 * their own child routes under this module and open as normal pages.
 */
@Component({
  selector: 'app-app-settings-hub',
  templateUrl: './app-settings-hub.component.html',
  styleUrls: ['./app-settings-hub.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppSettingsHubComponent implements OnInit {
  /** Tab order — index maps to the query-param slug. */
  readonly tabs = ['theme', 'branding', 'announcements'] as const;
  activeTab = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.queryParamMap.get('tab');
    const idx = this.tabs.indexOf((slug ?? '') as (typeof this.tabs)[number]);
    if (idx >= 0) this.activeTab = idx;
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: this.tabs[index] },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
