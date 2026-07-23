import { NotificationRow } from 'src/app/core/services/notification.service';

/**
 * Presentation layer shared by the notification bell panel
 * (notification-modal) and the full notifications page
 * (list-notifications). Owns the type → icon / accent-colour /
 * i18n-key maps and the body interpolation params, so a new
 * notification type is wired in ONE place and both surfaces render it
 * consistently.
 *
 * Colours are theme tokens (never hard-coded hex) so the tint tracks
 * light/dark. Unknown types fall back to a neutral bell.
 */

/** type → PrimeNG icon class for the row leading icon. */
const TYPE_ICON: Record<string, string> = {
  group_added: 'pi-user-plus',
  group_removed: 'pi-user-minus',
  asset_shared: 'pi-share-alt',
  asset_unshared: 'pi-ban',
  alert_fired: 'pi-bell',
  dashboard_delivered: 'pi-chart-bar',
};

/**
 * type → CSS custom property that colours the row's icon chip. Each is
 * a semantic theme token so the accent is meaningful (success/info/
 * warning/danger) and theme-aware. The helper returns the raw
 * `var(--…)` string so templates can bind it to `color` / `background`.
 */
const TYPE_ACCENT_VAR: Record<string, string> = {
  group_added: '--success-color',
  group_removed: '--warning-color',
  asset_shared: '--primary-color',
  asset_unshared: '--error-color',
  alert_fired: '--warning-color',
  dashboard_delivered: '--secondary-color',
};

const DEFAULT_ACCENT_VAR = '--secondary-color';

/** type → i18n title key. Unknown types fall back to a generic key. */
const TYPE_TITLE_KEY: Record<string, string> = {
  group_added: 'NOTIFICATION.GROUP_ADDED_TITLE',
  group_removed: 'NOTIFICATION.GROUP_REMOVED_TITLE',
  asset_shared: 'NOTIFICATION.ASSET_SHARED_TITLE',
  asset_unshared: 'NOTIFICATION.ASSET_UNSHARED_TITLE',
  alert_fired: 'NOTIFICATION.ALERT_FIRED_TITLE',
  dashboard_delivered: 'NOTIFICATION.DASHBOARD_DELIVERED_TITLE',
};

/** type → i18n body key (interpolated with `meta`). */
const TYPE_BODY_KEY: Record<string, string> = {
  group_added: 'NOTIFICATION.GROUP_ADDED_BODY',
  group_removed: 'NOTIFICATION.GROUP_REMOVED_BODY',
  asset_shared: 'NOTIFICATION.ASSET_SHARED_BODY',
  asset_unshared: 'NOTIFICATION.ASSET_UNSHARED_BODY',
  alert_fired: 'NOTIFICATION.ALERT_FIRED_BODY',
  dashboard_delivered: 'NOTIFICATION.DASHBOARD_DELIVERED_BODY',
};

/** Leading PrimeNG icon class (without the `pi ` prefix). */
export function notificationIcon(type: string): string {
  return TYPE_ICON[type] ?? 'pi-bell';
}

/** `var(--token)` for the row's icon accent colour. */
export function notificationAccent(type: string): string {
  return `var(${TYPE_ACCENT_VAR[type] ?? DEFAULT_ACCENT_VAR})`;
}

/** i18n key for the row's title. */
export function notificationTitleKey(n: NotificationRow): string {
  return TYPE_TITLE_KEY[n.type] ?? 'NOTIFICATION.GENERIC_TITLE';
}

/** i18n key for the row's body. */
export function notificationBodyKey(n: NotificationRow): string {
  return TYPE_BODY_KEY[n.type] ?? 'NOTIFICATION.GENERIC_BODY';
}

/**
 * Interpolation params for the body i18n template — every meta field a
 * body key might reference, defaulted to '' so a missing field renders
 * empty rather than the literal "undefined".
 */
export function notificationBodyParams(
  n: NotificationRow,
): Record<string, string> {
  const m = n.meta ?? {};
  return {
    groupName: m.groupName ?? '',
    assetName: m.assetName ?? '',
    assetType: m.assetType ?? '',
    alertName: m.alertName ?? '',
    dashboardName: m.dashboardName ?? '',
    actorName: m.actorName ?? '',
    permission: m.permission ?? '',
  };
}

/** The known notification types, in a stable order for filter menus. */
export const NOTIFICATION_TYPE_KEYS = [
  'group_added',
  'group_removed',
  'asset_shared',
  'asset_unshared',
  'alert_fired',
  'dashboard_delivered',
] as const;
