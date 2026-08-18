import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostBinding,
  HostListener,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  LocaleService,
  SUPPORTED_LOCALES,
} from 'src/app/core/services/locale.service';
import { LoginService } from 'src/app/core/services/login.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { ThemePickerService } from 'src/app/core/services/theme-picker.service';
import { ThemeService } from 'src/app/core/services/theme.service';
import { ThemePreset } from 'src/app/modules/app-settings/services/theme-settings.service';
import {
  TourService,
  TourSidebarApi,
} from 'src/app/core/services/tour.service';
import { AddAnalysesActions } from 'src/app/modules/analyses/store';
import { GlobalSearchService } from 'src/app/shared/services/global-search.service';
import { NotificationModalService } from 'src/app/shared/services/notification-modal.service';
import { SIDEBAR_ITEMS_ROUTES } from './sidebar.constant';

interface MenuItem {
  label: string;
  value: string;
  status: boolean;
  icon: string;
  subPermissions?: MenuItem[];
  route?: string;
  /**
   * When true, routerLinkActive matches ONLY the exact URL (not as a prefix).
   * Set for nav routes that are a prefix of a sibling's route (e.g.
   * '/app/query-runner' vs '/app/query-runner/connections') so the parent
   * doesn't also highlight when a child route is active.
   */
  exact?: boolean;
}

/**
 * Settings "hub" module values. These modules keep their children in the
 * permission tree (role editor + "parent grants all tabs" model), but the
 * sidebar renders each as a SINGLE clickable hub link — the children are
 * TABS inside the hub screen, not sidebar sub-rows.
 */
const SETTINGS_HUB_VALUES = new Set<string>([
  PERMISSIONS.APP_SETTINGS,
  PERMISSIONS.SYSTEM_SETTINGS,
]);

/**
 * BE PermissionNode shape from buildSessionBootstrap.
 * Modules have no `level`; only leaf permissions do. We only render
 * a node as a clickable nav item when level >= 1 (or when the node
 * has children that themselves passed the filter).
 */
interface PermissionNode {
  id?: string;
  value: string;
  name?: string;
  icon?: string | null;
  sequence?: number;
  scope?: string;
  level?: number;
  children?: PermissionNode[];
  /** Legacy nested shape — older snapshots, still tolerated. */
  subPermissions?: PermissionNode[];
}

/**
 * The single layout chrome. Hosts:
 *   - top region: brand wordmark + search icon + chevron toggle
 *   - middle:     the permission-tree nav (scrollable)
 *   - bottom:     notification bell + avatar + profile menu (locale, sign out)
 *
 * Replaces the old <app-header> + <app-footer>. Everything they
 * carried — search trigger, notifications, locale picker, avatar
 * menu, logout — moved here verbatim. Translation keys reused as-is
 * (HEADER.*) so no copy work for the i18n vendor.
 */
@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnInit, TourSidebarApi {
  // ── Nav-tree state ──────────────────────────────────────────────
  // Hover-to-peek removed per UX call — sidebar now only opens on
  // explicit click of the chevron handle. `isExpanded` is just the
  // pinned-open state; the dead `isHoverPeeking`/`isPeekOverlay`
  // flags were removed alongside their handlers.
  isExpanded = false;
  @HostBinding('class.pinned-open') isPinnedOpen = false;
  @HostBinding('class.is-mobile') isMobile = false;
  menuItems: MenuItem[] = [];

  /**
   * Collapsed-rail children flyout. The nav is a flat, always-open tree when
   * the rail is expanded, so there's no per-group accordion state. When the
   * rail is COLLAPSED the children are hidden and a group's icon opens a
   * flyout listing them — this holds the value of the group whose flyout is
   * open (null = none). Same hover/click idiom as the profile Language/Theme
   * flyouts. A short close delay lets the pointer travel the gap to the panel.
   */
  activeFlyoutValue: string | null = null;
  /** Viewport-relative top (px) for the open flyout, aligned to the clicked
   *  group's icon. The flyout is `position: fixed` so it escapes the nav's
   *  `overflow-y: auto` scroll clip; that means we position it against the
   *  viewport and set its top from the group row's bounding rect. */
  flyoutTop = 0;

  // ── Identity / header chrome (moved from HeaderComponent) ────────
  organisationName = '';
  userInitials = '';
  userName = '';
  /** JWT `email` claim — surfaced as the quiet identifier row at the
   *  top of the avatar menu (Claude pattern). Falls back to the
   *  `username` claim when email is missing from the token. */
  userEmail = '';
  isSystemAdmin = false;
  showProfileMenu = false;
  /** True while the Language flyout next to the profile menu is open. */
  showLanguageFlyout = false;
  locales = [...SUPPORTED_LOCALES];
  currentLocale = 'en';
  changingLocale = false;

  /** True while the Theme flyout next to the profile menu is open. */
  showThemeFlyout = false;
  /** Org theme presets the user may pick from (empty for System Admins). */
  themes: ThemePreset[] = [];
  /** The preset id the user is currently on (JWT claim, else org default). */
  currentThemeId: string | null = null;
  changingTheme = false;

  /** Snapshot of the pinned-open state before the tour forced it open, so
   *  we can restore exactly what the user had after the tour ends. */
  private prePinnedOpen: boolean | null = null;

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  constructor(
    private globalService: GlobalService,
    public router: Router,
    private translate: TranslateService,
    private store: Store,
    private loginService: LoginService,
    private localeService: LocaleService,
    private themeService: ThemeService,
    private themePickerService: ThemePickerService,
    public notificationService: NotificationService,
    private permissionService: PermissionService,
    private globalSearchService: GlobalSearchService,
    private notificationModalService: NotificationModalService,
    private tourService: TourService,
  ) {
    const tree = this.readPermissionTree();
    this.menuItems = this.processMenuItems(tree);
  }

  ngOnInit() {
    this.checkScreenSize();

    // Identity bootstrap (was in HeaderComponent.ngOnInit)
    this.organisationName =
      this.globalService.getTokenDetails('organisationName');
    const userFullName = this.globalService.getTokenDetails('name');
    this.userName = userFullName;
    this.userInitials = this.globalService.chipNameProvider(userFullName);
    // Prefer email — it's the unique identifier users recognise.
    // Fall back to username when email isn't in the token (older JWTs).
    this.userEmail =
      this.globalService.getTokenDetails('email') ??
      this.globalService.getTokenDetails('username') ??
      '';
    // "Platform operator" discriminator — the master-DB System user has no
    // org context. The retired `systemAdmin` permission is replaced by the
    // System-RBAC set; holding any of them marks a platform operator. Use
    // systemUserManagement as the sentinel (the seeded Administrator role
    // carries all three).
    this.isSystemAdmin = this.permissionService.canRead(
      PERMISSIONS.SYSTEM_USER_MANAGEMENT,
    );

    this.localeService.initFromToken();
    this.currentLocale = this.localeService.currentLocale;

    if (!this.isSystemAdmin) {
      // Notifications are per-org; the platform System Admin has no
      // org context so the BE would 401 on every poll. Service is
      // idempotent so re-mount is safe.
      this.notificationService.start();

      // Load the org theme library for the sidebar theme picker. Per-org
      // only — System Admins have no theme storage (the BE returns []).
      void this.themePickerService.loadThemes().then(() => {
        this.themes = this.themePickerService.themes();
        this.currentThemeId = this.themePickerService.currentThemeId();
        this.cdr.markForCheck();
      });
    }

    // Re-run change detection when language changes (required for
    // OnPush + translate pipe).
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());

    const resizeHandler = () => this.checkScreenSize();
    window.addEventListener('resize', resizeHandler);

    // Register with the guided tour so it can pin the sidebar open and
    // drive the account menu / language flyout during its chrome steps.
    this.tourService.registerSidebar(this);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', resizeHandler);
      this.tourService.unregisterSidebar(this);
    });
  }

  /** Single source of truth — open iff pinned by the chevron click. */
  private recomputeExpanded(): void {
    this.isExpanded = this.isPinnedOpen;
    this.cdr.markForCheck();
  }

  // ── Permission tree → menu shape ─────────────────────────────────
  private readPermissionTree(): PermissionNode[] {
    const raw = StorageService.get(StorageType.PERMISSION_TREE);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PermissionNode[]) : [];
    } catch {
      return [];
    }
  }

  processMenuItems(items: PermissionNode[], depth = 0): MenuItem[] {
    if (!Array.isArray(items)) return [];

    const result: MenuItem[] = [];
    for (const node of items) {
      // Settings hubs (App Settings / System Settings) keep their children
      // in the permission tree (needed for the role-editor grid + the
      // "parent grants all tabs" model), but the sidebar renders them as a
      // SINGLE clickable hub link — the children are TABS inside the hub,
      // not sidebar sub-rows. So don't descend into their children here.
      const isLeafHub = SETTINGS_HUB_VALUES.has(node.value);

      const children = isLeafHub
        ? []
        : (node.children ?? node.subPermissions ?? []);
      const processedChildren = this.processMenuItems(children, depth + 1);
      const hasGrant = typeof node.level === 'number' && node.level >= 1;

      // A hub is shown when the user holds the parent grant OR holds any of
      // its (tab) children — mirror the "parent grants all" intent by
      // surfacing the hub if any child grant is present.
      const hasChildGrant = isLeafHub ? this.anyDescendantGranted(node) : false;

      if (!hasGrant && !hasChildGrant && processedChildren.length === 0)
        continue;

      result.push({
        label: node.name ?? node.value,
        value: node.value,
        status: true,
        icon: node.icon ?? '',
        subPermissions:
          processedChildren.length > 0 ? processedChildren : undefined,
        route: this.appendRouteToMenu(node),
        exact: this.exactRouteMatch(node),
      });
    }
    return result;
  }

  /** True if the node itself, or any descendant, carries a grant (level >= 1).
   *  Used so a settings hub renders when the admin holds either the parent
   *  grant or any of its tab-child grants. */
  private anyDescendantGranted(node: PermissionNode): boolean {
    if (typeof node.level === 'number' && node.level >= 1) return true;
    const kids = node.children ?? node.subPermissions ?? [];
    return kids.some(k => this.anyDescendantGranted(k));
  }

  appendRouteToMenu(node: PermissionNode | MenuItem): string {
    const route = SIDEBAR_ITEMS_ROUTES.find(
      ir => ir.value === node.value,
    )?.route;
    return route || '';
  }

  /** Whether this nav entry should match its route exactly (see MenuItem.exact). */
  exactRouteMatch(node: PermissionNode | MenuItem): boolean {
    return (
      SIDEBAR_ITEMS_ROUTES.find(ir => ir.value === node.value)?.exact === true
    );
  }

  // ── Toggle / expand actions ──────────────────────────────────────
  // The nav is a flat, always-open tree: there is no per-group accordion to
  // open/close. Toggling the rail only changes width (icon-only ↔ full). Any
  // open collapsed-rail flyout is dismissed on toggle.
  toggleSidebar() {
    this.isPinnedOpen = !this.isPinnedOpen;
    this.closeFlyout();
    this.recomputeExpanded();
  }

  toggleSidebarAndCollapseAll() {
    this.toggleSidebar();
  }

  // ── Collapsed-rail children flyout (CLICK only) ──────────────────
  // When the rail is collapsed, group children are hidden; CLICKING a group
  // icon toggles a flyout listing them. Click (not hover) so simply moving the
  // pointer across the rail never spawns unwanted popovers. Dismissed by
  // clicking the group again, clicking a child, or clicking outside (see
  // handleClickOutside).

  /** Toggle this group's flyout. Expanded rail: inert (children already
   *  visible). Collapsed rail: open this group (aligned to the clicked row),
   *  or close it if it was already open. */
  onGroupHeaderClick(item: MenuItem, event?: Event): void {
    if (this.isExpanded) return;
    const opening = this.activeFlyoutValue !== item.value;
    if (opening && event) this.positionFlyout(event);
    this.activeFlyoutValue = opening ? item.value : null;
    this.cdr.markForCheck();
  }

  /** Align the fixed flyout's top to the clicked group's header rect, clamped
   *  so a group low in the rail doesn't push the panel off-screen. The flyout
   *  is `position: fixed` (to escape the nav's overflow clip), so it's placed
   *  against the viewport from the row's bounding rect. */
  private positionFlyout(event: Event): void {
    const el = event.currentTarget as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const desired = rect.top - 6; // title sits level with the icon
    const maxTop = window.innerHeight - 8;
    this.flyoutTop = Math.max(8, Math.min(desired, maxTop));
  }

  /** Dismiss any open flyout (called after navigating from a flyout link). */
  closeFlyout(): void {
    if (this.activeFlyoutValue !== null) {
      this.activeFlyoutValue = null;
      this.cdr.markForCheck();
    }
  }

  isRouteActive(route: string | undefined): boolean {
    if (!route) return false;
    return this.router.url.includes(route);
  }

  hasActiveDescendant(item: MenuItem): boolean {
    if (!item.subPermissions?.length) return false;
    for (const child of item.subPermissions) {
      if (this.isRouteActive(child.route)) return true;
      if (this.hasActiveDescendant(child)) return true;
    }
    return false;
  }

  private checkScreenSize() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth <= 768;

    // Crossing into mobile un-pins the rail (it becomes a drawer). Any open
    // collapsed-rail flyout is dismissed. The nav itself is flat, so there's
    // no per-group accordion state to reset.
    if (!wasMobile && this.isMobile) {
      this.isPinnedOpen = false;
      this.closeFlyout();
    }

    this.recomputeExpanded();
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackById(_index: number, item: any): any {
    return item.id;
  }

  collapseAllAndToggle() {
    this.toggleSidebar();
  }

  // ─────────────────────────────────────────────────────────────────
  // Guided-tour API (TourSidebarApi) — driven by TourService only.
  // ─────────────────────────────────────────────────────────────────

  /** Pin the sidebar open so every top-level nav row (group header or leaf) is
   *  visible + anchorable. The nav is flat/always-open, so pinning open renders
   *  the group headers the tour anchors on (it targets those parents only, not
   *  the individual children). Remembers prior pinned state. */
  forceExpandForTour(): void {
    if (this.prePinnedOpen === null) this.prePinnedOpen = this.isPinnedOpen;
    this.isPinnedOpen = true;
    this.recomputeExpanded();
    this.cdr.markForCheck();
  }

  /** Restore whatever pinned state the user had before the tour, and close
   *  any tour-opened popovers. */
  restoreAfterTour(): void {
    if (this.prePinnedOpen !== null) {
      this.isPinnedOpen = this.prePinnedOpen;
      this.prePinnedOpen = null;
    }
    this.showProfileMenu = false;
    this.showLanguageFlyout = false;
    this.recomputeExpanded();
    this.cdr.markForCheck();
  }

  /** Top-level sidebar rows to tour — one per parent (group or top-level
   *  leaf), in display order. Already permission-filtered by processMenuItems. */
  getTourModuleTargets(): { value: string }[] {
    return this.menuItems.filter(i => !!i.value).map(i => ({ value: i.value }));
  }

  /** Open the account (avatar) menu for the logout / language tour steps. */
  openAccountMenuForTour(): void {
    this.showProfileMenu = true;
    this.showLanguageFlyout = false;
    this.showThemeFlyout = false;
    this.cdr.markForCheck();
  }

  /** Open the account menu AND the language flyout for the language step. */
  openLanguageFlyoutForTour(): void {
    this.showProfileMenu = true;
    this.showLanguageFlyout = true;
    this.showThemeFlyout = false;
    this.cdr.markForCheck();
  }

  /** Close the account menu + flyouts (tour leaving those steps). */
  closeTourPopovers(): void {
    this.showProfileMenu = false;
    this.showLanguageFlyout = false;
    this.showThemeFlyout = false;
    this.cdr.markForCheck();
  }

  // ─────────────────────────────────────────────────────────────────
  // Header chrome (moved from HeaderComponent)
  // ─────────────────────────────────────────────────────────────────

  /** Open the global search modal (rendered in the home shell). */
  openSearchModal(): void {
    this.globalSearchService.openSearch();
  }

  /**
   * Notifications are a per-org concept; the platform System Admin
   * has no org binding so the bell is hidden entirely for them.
   */
  get showNotificationBell(): boolean {
    return !this.isSystemAdmin;
  }

  /**
   * Bell click — open the notification command-modal. The modal
   * subscribes to NotificationModalService.open$ and on open will
   * itself call notificationService.openBell() (fetch feed +
   * mark-as-read). The sidebar just fires the trigger.
   */
  openNotificationModal(): void {
    // Close any other sidebar popovers so the modal owns the focus.
    this.showProfileMenu = false;
    this.showLanguageFlyout = false;
    this.showThemeFlyout = false;
    this.notificationModalService.open();
  }

  toggleProfileMenu(event: Event): void {
    event.stopPropagation();
    this.showProfileMenu = !this.showProfileMenu;
    // Closing the profile menu also closes any open flyouts.
    if (!this.showProfileMenu) {
      this.showLanguageFlyout = false;
      this.showThemeFlyout = false;
    }
  }

  /**
   * Click the Language row in the profile menu. Click-toggles the
   * flyout (in addition to the hover-driven open/close on the row
   * itself). stopPropagation so the menu's outside-click handler
   * doesn't immediately close everything. Opening it closes the Theme
   * flyout so only one flyout shows at a time.
   */
  toggleLanguageFlyout(event: Event): void {
    event.stopPropagation();
    this.showLanguageFlyout = !this.showLanguageFlyout;
    if (this.showLanguageFlyout) this.showThemeFlyout = false;
  }

  /**
   * Click the Theme row in the profile menu — same idiom as the
   * Language flyout. Opening it closes the Language flyout.
   */
  toggleThemeFlyout(event: Event): void {
    event.stopPropagation();
    this.showThemeFlyout = !this.showThemeFlyout;
    if (this.showThemeFlyout) this.showLanguageFlyout = false;
  }

  /**
   * Theme list inside the avatar menu. Delegates to ThemePickerService
   * (apply instantly → persist → refresh JWT), mirroring onLocaleChange.
   */
  async onThemeChange(presetId: string): Promise<void> {
    if (this.changingTheme || presetId === this.currentThemeId) return;
    this.changingTheme = true;
    await this.themePickerService.changeTheme(presetId);
    this.currentThemeId = this.themePickerService.currentThemeId();
    this.changingTheme = false;
    this.cdr.markForCheck();
  }

  viewProfile(): void {
    this.showProfileMenu = false;
    this.router.navigate(['/app/profile']);
  }

  /**
   * Locale list inside the avatar menu. Calling LocaleService applies
   * the locale; if the user landed via `?locale=` we strip the temp
   * preview param so a future reload doesn't clobber the persisted
   * choice (matches what the header dropdown did).
   */
  async onLocaleChange(localeCode: string): Promise<void> {
    if (this.changingLocale || localeCode === this.currentLocale) return;
    this.changingLocale = true;
    await this.localeService.changeLocale(localeCode);
    this.currentLocale = localeCode;

    const currentTree = this.router.parseUrl(this.router.url);
    if (currentTree.queryParams['locale'] !== undefined) {
      const { locale: _drop, ...keep } = currentTree.queryParams;
      const path =
        currentTree.root.children['primary']?.segments
          .map(s => '/' + s.path)
          .join('') || '/';
      this.router.navigate([path], { queryParams: keep, replaceUrl: true });
    }

    this.changingLocale = false;
    this.cdr.markForCheck();
  }

  logout(): void {
    this.loginService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.clearSessionAndNavigate(),
        error: () => this.clearSessionAndNavigate(),
      });
  }

  private clearSessionAndNavigate(): void {
    this.store.dispatch(AddAnalysesActions.clearAllDatasets());
    StorageService.clear();
    // Drop the injected org theme so the login page paints with
    // default DBExec palette.
    this.themeService.clear();
    // Drop the PermissionService cache so the next user's bootstrap
    // hydrates a clean tree.
    this.permissionService.reset();
    this.router.navigate(['/login']);
  }

  /**
   * Click-outside handler — close the avatar menu (and its language
   * flyout) when the user clicks anywhere that's not the avatar
   * trigger or one of the menus themselves. The notification panel
   * is now its own modal with its own dismiss logic, so it's not
   * handled here.
   */
  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event): void {
    // While the guided tour is running it owns the account menu / language
    // flyout (opening them for the logout/language steps). A click on the
    // driver.js overlay or popover would otherwise fall through here and
    // slam them shut mid-step, so ignore outside-clicks during the tour.
    if (this.tourService.running()) return;
    const target = event.target as HTMLElement;
    if (
      !target.closest('.user-profile') &&
      !target.closest('.profile-menu') &&
      !target.closest('.language-flyout') &&
      !target.closest('.theme-flyout')
    ) {
      this.showProfileMenu = false;
      this.showLanguageFlyout = false;
      this.showThemeFlyout = false;
    }
    // Close the collapsed-rail children flyout on any click that isn't the
    // group header that opened it or the flyout itself. (Clicking a flyout
    // link closes it via closeFlyout on the link; this handles clicks
    // anywhere else on the page.)
    if (
      this.activeFlyoutValue !== null &&
      !target.closest('.nav-group-header') &&
      !target.closest('.nav-flyout')
    ) {
      this.closeFlyout();
    }
  }
}
