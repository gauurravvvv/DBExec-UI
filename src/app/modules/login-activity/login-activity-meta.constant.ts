/**
 * Presentation metadata for the login-activity list — mirrors the BE
 * `LOGIN_EVENTS` enum (DBExec-API/src/shared/constants/audit.constants.ts).
 * Event → { icon, labelKey, cssClass }. Colour comes from theme tokens in the
 * component SCSS via the cssClass; nothing is hard-coded here.
 */

export interface EventMeta {
  icon: string;
  labelKey: string;
  cssClass: string;
}

export const EVENT_FALLBACK: EventMeta = {
  icon: 'pi pi-circle',
  labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.GENERIC',
  cssClass: 'ev-default',
};

export const EVENT_META: Record<string, EventMeta> = {
  LOGIN_SUCCESS: {
    icon: 'pi pi-sign-in',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.LOGIN_SUCCESS',
    cssClass: 'ev-success',
  },
  LOGIN_FAILED: {
    icon: 'pi pi-times-circle',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.LOGIN_FAILED',
    cssClass: 'ev-failed',
  },
  LOGOUT: {
    icon: 'pi pi-sign-out',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.LOGOUT',
    cssClass: 'ev-logout',
  },
  TOKEN_REFRESH: {
    icon: 'pi pi-refresh',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.TOKEN_REFRESH',
    cssClass: 'ev-refresh',
  },
  PASSWORD_RESET: {
    icon: 'pi pi-key',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.PASSWORD_RESET',
    cssClass: 'ev-warning',
  },
  PASSWORD_SET: {
    icon: 'pi pi-key',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.PASSWORD_SET',
    cssClass: 'ev-warning',
  },
  SETUP_LINK_RESENT: {
    icon: 'pi pi-envelope',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.SETUP_LINK_RESENT',
    cssClass: 'ev-refresh',
  },
  OTP_GENERATED: {
    icon: 'pi pi-hashtag',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.OTP_GENERATED',
    cssClass: 'ev-refresh',
  },
  SESSION_EXPIRED: {
    icon: 'pi pi-clock',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.SESSION_EXPIRED',
    cssClass: 'ev-warning',
  },
  ACCOUNT_LOCKED: {
    icon: 'pi pi-lock',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.ACCOUNT_LOCKED',
    cssClass: 'ev-failed',
  },
  ACCOUNT_UNLOCKED: {
    icon: 'pi pi-lock-open',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.ACCOUNT_UNLOCKED',
    cssClass: 'ev-success',
  },
  SESSION_BOOTSTRAP_FAILED: {
    icon: 'pi pi-exclamation-triangle',
    labelKey: 'LOGIN_ACTIVITY.EVENT_LABEL.SESSION_BOOTSTRAP_FAILED',
    cssClass: 'ev-failed',
  },
};

/** Options for the Event filter dropdown (value = BE eventType, label = i18n). */
export const EVENT_FILTER_ORDER: string[] = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'PASSWORD_RESET',
  'PASSWORD_SET',
  'TOKEN_REFRESH',
  'SESSION_EXPIRED',
  'OTP_GENERATED',
  'SETUP_LINK_RESENT',
  'SESSION_BOOTSTRAP_FAILED',
];

export const EVENT_FILTER_OPTIONS = EVENT_FILTER_ORDER.map(value => ({
  value,
  labelKey: EVENT_META[value]?.labelKey ?? EVENT_FALLBACK.labelKey,
}));
