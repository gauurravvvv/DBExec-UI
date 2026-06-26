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
import { ThemeService } from 'src/app/core/services/theme.service';
import { AddAnalysesActions } from 'src/app/modules/analyses/store';
import { GlobalSearchService } from 'src/app/shared/services/global-search.service';
import { NotificationModalService } from 'src/app/shared/services/notification-modal.service';
import { SIDEBAR_ITEMS_ROUTES } from './sidebar.constant';

interface MenuItem {
  label: string;
  value: string;
  status: boolean;
  icon: string;
  isExpanded?: boolean;
  subPermissions?: MenuItem[];
  route?: string;
}

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
export class SidebarComponent implements OnInit {
  // ── Nav-tree state ──────────────────────────────────────────────
  // Hover-to-peek removed per UX call — sidebar now only opens on
  // explicit click of the chevron handle. `isExpanded` is just the
  // pinned-open state; the dead `isHoverPeeking`/`isPeekOverlay`
  // flags were removed alongside their handlers.
  isExpanded = false;
  @HostBinding('class.pinned-open') isPinnedOpen = false;
  @HostBinding('class.is-mobile') isMobile = false;
  menuItems: MenuItem[] = [];

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

  /** localStorage key for the user's expanded-branch set. */
  private static readonly EXPANDED_STORAGE_KEY = 'sidebar.expanded';

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
    public notificationService: NotificationService,
    private permissionService: PermissionService,
    private globalSearchService: GlobalSearchService,
    private notificationModalService: NotificationModalService,
  ) {
    const tree = this.readPermissionTree();
    this.menuItems = this.processMenuItems(tree);
    this.restoreExpandedState();
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
    this.isSystemAdmin = this.permissionService.canRead(
      PERMISSIONS.SYSTEM_ADMIN,
    );

    this.localeService.initFromToken();
    this.currentLocale = this.localeService.currentLocale;

    if (!this.isSystemAdmin) {
      // Notifications are per-org; the platform System Admin has no
      // org context so the BE would 401 on every poll. Service is
      // idempotent so re-mount is safe.
      this.notificationService.start();
    }

    // Re-run change detection when language changes (required for
    // OnPush + translate pipe).
    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());

    const resizeHandler = () => this.checkScreenSize();
    window.addEventListener('resize', resizeHandler);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', resizeHandler);
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
      const children = node.children ?? node.subPermissions ?? [];
      const processedChildren = this.processMenuItems(children, depth + 1);
      const hasGrant = typeof node.level === 'number' && node.level >= 1;

      if (!hasGrant && processedChildren.length === 0) continue;

      result.push({
        label: node.name ?? node.value,
        value: node.value,
        status: true,
        icon: node.icon ?? '',
        isExpanded: false,
        subPermissions:
          processedChildren.length > 0 ? processedChildren : undefined,
        route: this.appendRouteToMenu(node),
      });
    }
    return result;
  }

  appendRouteToMenu(node: PermissionNode | MenuItem): string {
    const route = SIDEBAR_ITEMS_ROUTES.find(
      ir => ir.value === node.value,
    )?.route;
    return route || '';
  }

  private expandMenuForCurrentRoute() {
    this.collapseAllMenus();
    const currentUrl = this.router.url;

    const expandParents = (items: MenuItem[]): boolean => {
      for (const item of items) {
        if (item.route && currentUrl.includes(item.route)) {
          item.isExpanded = true;
          return true;
        }
        if (item.subPermissions && expandParents(item.subPermissions)) {
          item.isExpanded = true;
          return true;
        }
      }
      return false;
    };

    expandParents(this.menuItems);
  }

  // ── Toggle / expand actions ──────────────────────────────────────
  toggleSidebar() {
    this.isPinnedOpen = !this.isPinnedOpen;
    if (this.isPinnedOpen) {
      this.expandMenuForCurrentRoute();
    } else {
      this.collapseAllMenus();
    }
    this.recomputeExpanded();
  }

  toggleSidebarAndCollapseAll() {
    this.toggleSidebar();
  }

  collapseAllMenus() {
    this.menuItems.forEach(item => {
      item.isExpanded = false;
      if (item.subPermissions) {
        item.subPermissions.forEach(subItem => {
          subItem.isExpanded = false;
          if (subItem.subPermissions) {
            subItem.subPermissions.forEach(nestedItem => {
              nestedItem.isExpanded = false;
            });
          }
        });
      }
    });
  }

  toggleSubmenuAndExpand(item: MenuItem) {
    if (!this.isExpanded) {
      this.isPinnedOpen = true;
      this.recomputeExpanded();
      setTimeout(() => {
        item.isExpanded = true;
        this.persistExpandedState();
        this.cdr.markForCheck();
      }, 100);
      return;
    }
    const opening = !item.isExpanded;
    item.isExpanded = opening;
    if (!opening) this.collapseDescendants(item);
    this.persistExpandedState();
    this.cdr.markForCheck();
  }

  private persistExpandedState(): void {
    try {
      const open: string[] = [];
      const collect = (items: MenuItem[]) => {
        for (const i of items) {
          if (i.isExpanded && i.value) open.push(i.value);
          if (i.subPermissions?.length) collect(i.subPermissions);
        }
      };
      collect(this.menuItems);
      localStorage.setItem(
        SidebarComponent.EXPANDED_STORAGE_KEY,
        JSON.stringify(open),
      );
    } catch {
      // localStorage may be unavailable; persistence is a nicety.
    }
  }

  private restoreExpandedState(): void {
    try {
      const raw = localStorage.getItem(SidebarComponent.EXPANDED_STORAGE_KEY);
      if (!raw) return;
      const set = new Set<string>(JSON.parse(raw) as string[]);
      const apply = (items: MenuItem[]) => {
        for (const i of items) {
          if (i.value && set.has(i.value)) i.isExpanded = true;
          if (i.subPermissions?.length) apply(i.subPermissions);
        }
      };
      apply(this.menuItems);
    } catch {
      // ignore malformed payload
    }
  }

  private collapseDescendants(item: MenuItem) {
    if (!item.subPermissions) return;
    for (const child of item.subPermissions) {
      child.isExpanded = false;
      this.collapseDescendants(child);
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

  getIndentation(level: number): string {
    const baseIndentation = 16;
    return `${level * baseIndentation}px`;
  }

  private checkScreenSize() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth <= 768;

    if (!wasMobile && this.isMobile) {
      this.menuItems.forEach(item => {
        if (item.isExpanded) {
          item.isExpanded = false;
          if (item.subPermissions) {
            item.subPermissions.forEach(subItem => {
              if (subItem.isExpanded) {
                subItem.isExpanded = false;
                if (subItem.subPermissions) {
                  subItem.subPermissions.forEach(nestedItem => {
                    nestedItem.isExpanded = false;
                  });
                }
              }
            });
          }
        }
      });
      this.isPinnedOpen = false;
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
    this.notificationModalService.open();
  }

  toggleProfileMenu(event: Event): void {
    event.stopPropagation();
    this.showProfileMenu = !this.showProfileMenu;
    // Closing the profile menu also closes any open Language flyout.
    if (!this.showProfileMenu) this.showLanguageFlyout = false;
  }

  /**
   * Click the Language row in the profile menu. Click-toggles the
   * flyout (in addition to the hover-driven open/close on the row
   * itself). stopPropagation so the menu's outside-click handler
   * doesn't immediately close everything.
   */
  toggleLanguageFlyout(event: Event): void {
    event.stopPropagation();
    this.showLanguageFlyout = !this.showLanguageFlyout;
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
    const target = event.target as HTMLElement;
    if (
      !target.closest('.user-profile') &&
      !target.closest('.profile-menu') &&
      !target.closest('.language-flyout')
    ) {
      this.showProfileMenu = false;
      this.showLanguageFlyout = false;
    }
  }
}
