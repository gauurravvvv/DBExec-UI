import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SettingsTabForm } from '../../settings-tab-form';
import { SsoSettingsComponent } from '../sso-settings/sso-settings.component';
import { EmailConfigurationComponent } from '../email-configuration/email-configuration.component';
import { SecurityPolicyComponent } from '../security-policy/security-policy.component';
import { AiFeaturesComponent } from '../ai-features/ai-features.component';

/**
 * System Settings hub — a single tabbed screen hosting SSO, Email, Security
 * Policy, and AI Features. One "Save" button lives in the hub header
 * (UltraSignal style) and delegates to the ACTIVE tab's own save/API — no
 * per-tab Save button. Each tab implements SettingsTabForm so the hub can
 * read `dirty`/`busy` and call `onSave()` on whichever child is rendered.
 *
 * The route gates on the `ssoConfiguration` LEAF permission (the
 * `systemSettings` module header carries no `level`). The active tab is
 * mirrored to a `?tab=` query param for deep links / refresh.
 *
 * Default change detection (not OnPush): the header Save button's
 * disabled/loading state binds to `activeForm()?.dirty/busy`, which flips on
 * keystrokes inside the *child* form. An OnPush hub wouldn't re-evaluate that
 * on child input; default CD re-reads the getter on every tick so the button
 * enables the moment the active tab becomes dirty. This is a thin container
 * with no perf-sensitive bindings, so default CD is the right trade.
 */
@Component({
  selector: 'app-system-settings-hub',
  templateUrl: './system-settings-hub.component.html',
  styleUrls: ['./system-settings-hub.component.scss'],
})
export class SystemSettingsHubComponent implements OnInit {
  readonly tabs = ['sso', 'email', 'security', 'ai'] as const;
  activeTab = 0;

  // Only the active tab is instantiated (*ngIf), so at most one of these is
  // defined at a time — activeForm() returns whichever it is.
  @ViewChild(SsoSettingsComponent) private sso?: SsoSettingsComponent;
  @ViewChild(EmailConfigurationComponent)
  private email?: EmailConfigurationComponent;
  @ViewChild(SecurityPolicyComponent) private security?: SecurityPolicyComponent;
  @ViewChild(AiFeaturesComponent) private ai?: AiFeaturesComponent;

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

  /** The currently-rendered tab (every System tab is a savable form). */
  activeForm(): SettingsTabForm | undefined {
    return this.sso ?? this.email ?? this.security ?? this.ai;
  }

  /** Save the active tab through its own API. */
  save(): void {
    const form = this.activeForm();
    if (form && form.dirty && !form.busy) form.onSave();
  }
}
