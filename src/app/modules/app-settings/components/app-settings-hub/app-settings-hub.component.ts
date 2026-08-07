import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SettingsTabForm } from '../../settings-tab-form';
import { BrandingSettingsComponent } from '../branding-settings/branding-settings.component';

/**
 * App Settings hub — a single tabbed screen (p-tabView) that hosts the
 * org look-&-feel settings: Theme, Branding, Announcements. Replaces the
 * three former standalone sidebar routes. Gated on the parent `appSettings`
 * permission; holding it shows every tab (no per-tab gating).
 *
 * Theme is now a LIST screen (a preset library with its own add/edit/view
 * routed pages) — like Announcements, no hub Save. Only Branding is a
 * savable form; the hub header "Save" delegates to it and hides on the
 * Theme + Announcements tabs (activeForm() returns undefined there).
 *
 * The active tab is mirrored to a `?tab=` query param so a deep link / a
 * refresh lands on the same tab. Announcement add/edit/view still live at
 * their own child routes under this module and open as normal pages.
 *
 * Default change detection (not OnPush): the header Save button binds to
 * `activeForm()?.dirty/busy`, which flips on keystrokes inside the child
 * form. An OnPush hub wouldn't re-evaluate that on child input; default CD
 * re-reads the getter each tick so the button enables the moment the active
 * tab becomes dirty. Thin container, no perf-sensitive bindings.
 */
@Component({
  selector: 'app-app-settings-hub',
  templateUrl: './app-settings-hub.component.html',
  styleUrls: ['./app-settings-hub.component.scss'],
})
export class AppSettingsHubComponent implements OnInit {
  /** Tab order — index maps to the query-param slug. */
  readonly tabs = ['theme', 'branding', 'announcements'] as const;
  activeTab = 0;

  // Only Branding is a savable form; the Theme (list) + Announcements
  // (list) tabs have no ViewChild here → activeForm() undefined → hub
  // Save hides.
  @ViewChild(BrandingSettingsComponent)
  private branding?: BrandingSettingsComponent;

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

  /**
   * The currently-rendered savable tab, or undefined on Announcements (which
   * is a list, not a form). The hub Save button binds to this being defined.
   */
  activeForm(): SettingsTabForm | undefined {
    return this.branding;
  }

  /** Save the active tab through its own API. */
  save(): void {
    const form = this.activeForm();
    if (form && form.dirty && !form.busy) form.onSave();
  }
}
