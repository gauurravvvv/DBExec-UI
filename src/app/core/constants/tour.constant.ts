/**
 * Tour step catalog — the full set of steps the guided application tour can
 * show. TourService filters this against the logged-in user's permission
 * tree so each user is walked only through the modules they can actually
 * see (plus the always-on chrome steps).
 *
 * Anchors are `data-tour="<value>"` attributes on existing elements. Module
 * steps target the sidebar nav rows, keyed `nav-<permissionValue>` — the
 * same `value` the sidebar binds per item. Chrome steps target the sidebar
 * search/bell/account controls and the profile-menu language/logout rows.
 *
 * Order mirrors the sidebar (SIDEBAR_ITEMS_ROUTES sequence): the tour reads
 * welcome → search → notifications → [permitted module steps] → language →
 * logout → done.
 *
 * i18n: title/description resolve at build time from
 *   TOUR.STEPS.<key>.TITLE / TOUR.STEPS.<key>.DESC
 * except the two element-less bookends which use TOUR.WELCOME.* / TOUR.DONE.*.
 */
import { PERMISSIONS } from './permissions.constant';

/** Which live overlay a chrome step should open while it is highlighted. */
export type TourChrome = 'search' | 'notifications' | 'language' | 'logout';

export interface TourStepDef {
  /** Stable id — also the i18n key segment (TOUR.STEPS.<key>.*). */
  key: string;
  /**
   * CSS selector for the anchored element, or undefined for the centered
   * element-less bookends (welcome / done).
   */
  anchor?: string;
  /** Permission value that must be granted (READ+) for a MODULE step to show.
   *  Omitted for chrome + bookend steps (always eligible). */
  permission?: string;
  /** Live overlay to drive while this step is active (chrome steps only). */
  chrome?: TourChrome;
  /** Preferred popover side / alignment (driver.js may flip to fit). */
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** True for the centered, element-less welcome/done cards. */
  bookend?: boolean;
}

/** Element-less opening card. */
export const TOUR_WELCOME: TourStepDef = {
  key: 'welcome',
  bookend: true,
  align: 'center',
};

/** Element-less closing card. */
export const TOUR_DONE: TourStepDef = {
  key: 'done',
  bookend: true,
  align: 'center',
};

/**
 * Chrome steps shown BEFORE the module steps. The search/notifications
 * anchors are absent for the platform System Admin (no per-org bell/search);
 * driver.js skips missing elements and TourService drops them from the built
 * list so the progress count stays accurate.
 */
export const TOUR_CHROME_LEADING: TourStepDef[] = [
  {
    key: 'search',
    anchor: '[data-tour="search"]',
    chrome: 'search',
    side: 'right',
    align: 'start',
  },
  {
    key: 'notifications',
    anchor: '[data-tour="notifications"]',
    chrome: 'notifications',
    side: 'right',
    align: 'start',
  },
];

/**
 * Chrome steps shown AFTER the module steps. Both anchor to the account area
 * / profile menu; the tour opens the account menu (and, for language, the
 * language flyout) while they are active.
 */
export const TOUR_CHROME_TRAILING: TourStepDef[] = [
  {
    key: 'language',
    anchor: '[data-tour="language"]',
    chrome: 'language',
    // 'top' (not 'right'): the language flyout opens to the RIGHT of the
    // profile menu, exactly where a right-side popover would land — they
    // overlapped. Placing the card above the menu keeps it clear of the
    // opened language chooser.
    side: 'top',
    align: 'start',
  },
  {
    key: 'logout',
    anchor: '[data-tour="logout"]',
    chrome: 'logout',
    // 'top' too, for consistency with the language step and to stay clear of
    // the account menu which floats at the bottom-left edge.
    side: 'top',
    align: 'start',
  },
];

/**
 * Module steps — one per sidebar module, each gated by its permission value.
 * `key` doubles as the permission value and the anchor suffix
 * (`[data-tour="nav-<key>"]`). Order mirrors SIDEBAR_ITEMS_ROUTES.
 *
 * The Settings hubs (appSettings / systemSettings) render as single sidebar
 * rows, so they get one step each. Nested query-builder children each render
 * their own row and get their own step.
 */
export const TOUR_MODULE_STEPS: TourStepDef[] = [
  { key: PERMISSIONS.SYSTEM_ADMIN }, // 'systemAdmin'
  { key: PERMISSIONS.ORG_MANAGEMENT }, // 'orgManagement'
  { key: PERMISSIONS.SYSTEM_ROLE_MANAGEMENT },
  { key: PERMISSIONS.SYSTEM_GROUP_MANAGEMENT },
  { key: PERMISSIONS.SYSTEM_USER_MANAGEMENT },
  { key: 'home' },
  { key: PERMISSIONS.USER_MANAGEMENT },
  { key: PERMISSIONS.ROLE_MANAGEMENT },
  { key: PERMISSIONS.USER_GROUP }, // 'groupManagement'
  { key: PERMISSIONS.SETUP_DB },
  { key: PERMISSIONS.DB_ROLES },
  { key: PERMISSIONS.DB_PRIVILEGES },
  { key: PERMISSIONS.CONNECTION_MANAGER },
  { key: PERMISSIONS.QUERY_RUNNER },
  { key: 'queryBuilderTab' },
  { key: 'queryBuilderSection' },
  { key: PERMISSIONS.QB_PROMPT }, // 'queryBuilderPrompt'
  { key: PERMISSIONS.QB_SCREEN }, // 'queryBuilderScreen'
  { key: PERMISSIONS.DATASET }, // 'datasetManager'
  { key: PERMISSIONS.ANALYSES },
  { key: PERMISSIONS.DASHBOARD },
  { key: PERMISSIONS.RLS_RULES },
  { key: PERMISSIONS.ALERTS }, // 'alertManagement'
  { key: PERMISSIONS.AUDIT_LOGS },
  { key: PERMISSIONS.LOGIN_ACTIVITY },
  { key: PERMISSIONS.APP_SETTINGS },
  { key: PERMISSIONS.SYSTEM_SETTINGS },
].map(
  (s): TourStepDef => ({
    key: s.key,
    anchor: `[data-tour="nav-${s.key}"]`,
    permission: s.key,
    side: 'right',
    align: 'center',
  }),
);

/** sessionStorage key: suppresses re-trigger within the same tab session
 *  once the user has reached the closing card (belt-and-suspenders alongside
 *  the persisted showTour flag). */
export const TOUR_SESSION_SEEN_KEY = 'tour.completedThisSession';
