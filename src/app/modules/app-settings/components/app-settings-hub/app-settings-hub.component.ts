import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ANNOUNCEMENT,
  BRANDING_PRESET,
  THEME_PRESET,
} from 'src/app/core/constants/routes.constant';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { AppTab } from 'src/app/shared/components/tabs/tabs.component';

/** Per-tab Add-button metadata — one common header button whose label,
 *  target route and permission switch with the active tab. */
interface TabAdd {
  labelKey: string;
  route: string;
  permission: string;
}

/**
 * App Settings hub — a single tabbed screen hosting the org look-&-feel
 * settings: Theme, Branding, Announcements.
 *
 * Uses the shared `<app-tabs>` strip (themed, token-driven) for the tab
 * header; the active tab's LIST body is rendered below via `[ngSwitch]`.
 * All three tabs are list screens with their own add/edit/view routed
 * pages. The hub owns the page chrome (parity with list-role): a title
 * left and ONE common "Add" button top-right whose label + destination
 * follow the active tab. The active tab is mirrored to `?tab=` for deep
 * links.
 */
@Component({
  selector: 'app-app-settings-hub',
  templateUrl: './app-settings-hub.component.html',
  styleUrls: ['./app-settings-hub.component.scss'],
})
export class AppSettingsHubComponent implements OnInit {
  /** Tab strip model (also the source of order + the query-param slug). */
  readonly tabs: AppTab[] = [
    {
      value: 'theme',
      label: 'SIDEBAR.themeManagement',
      permission: PERMISSIONS.THEME_MANAGEMENT,
    },
    {
      value: 'branding',
      label: 'SIDEBAR.brandingManagement',
      permission: PERMISSIONS.BRANDING_MANAGEMENT,
    },
    {
      value: 'announcements',
      label: 'SIDEBAR.announcementManagement',
      permission: PERMISSIONS.ANNOUNCEMENT_MANAGEMENT,
    },
  ];

  /** Add-button config per tab value. */
  private readonly addByTab: Record<string, TabAdd> = {
    theme: {
      labelKey: 'COMMON.ADD',
      route: THEME_PRESET.NEW,
      permission: PERMISSIONS.THEME_MANAGEMENT,
    },
    branding: {
      labelKey: 'COMMON.ADD',
      route: BRANDING_PRESET.NEW,
      permission: PERMISSIONS.BRANDING_MANAGEMENT,
    },
    announcements: {
      labelKey: 'COMMON.ADD',
      route: ANNOUNCEMENT.ADD,
      permission: PERMISSIONS.ANNOUNCEMENT_MANAGEMENT,
    },
  };

  /** Active tab value (default: first tab). */
  activeTab = 'theme';

  get currentAdd(): TabAdd {
    return this.addByTab[this.activeTab];
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.queryParamMap.get('tab');
    if (slug && this.tabs.some(t => t.value === slug)) this.activeTab = slug;
  }

  onTabChange(value: string): void {
    this.activeTab = value;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Common Add — routes to the active tab's create page. */
  onAdd(): void {
    this.router.navigateByUrl(this.currentAdd.route);
  }
}
