import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * System Settings hub — a single tabbed screen (p-tabView) hosting the
 * platform/security configuration: SSO, Email, Security Policy, and AI
 * Features (placeholder). Sibling of the App Settings hub; reached from
 * the sidebar's System Settings entry at /app/settings/system.
 *
 * The route gates on the `ssoConfiguration` LEAF permission rather than
 * the `systemSettings` module header — the header carries no `level` in
 * the permission tree, so canRead(header) resolves to false even for an
 * admin who holds every child leaf (see the routing module for the full
 * rationale). Holding it shows every tab (no per-tab gating).
 *
 * The active tab is mirrored to a `?tab=` query param so a deep link / a
 * refresh lands on the same tab.
 */
@Component({
  selector: 'app-system-settings-hub',
  templateUrl: './system-settings-hub.component.html',
  styleUrls: ['./system-settings-hub.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemSettingsHubComponent implements OnInit {
  /** Tab order — index maps to the query-param slug. */
  readonly tabs = ['sso', 'email', 'security', 'ai'] as const;
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
