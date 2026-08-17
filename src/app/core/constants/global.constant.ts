// Marketing bullets on the auth shell. title/description are i18n keys
// (resolved with the translate pipe in auth-shell.component.html) so the
// login/reset/set-password chrome is fully localized.
export const LOGIN_PAGE_OPTIONS = [
  {
    icon: 'database',
    title: 'AUTH.SHELL.FEATURE_CONNECT_TITLE',
    description: 'AUTH.SHELL.FEATURE_CONNECT_DESC',
  },
  {
    icon: 'th-large',
    title: 'AUTH.SHELL.FEATURE_BUILD_TITLE',
    description: 'AUTH.SHELL.FEATURE_BUILD_DESC',
  },
  {
    icon: 'chart-line',
    title: 'AUTH.SHELL.FEATURE_EXPLORE_TITLE',
    description: 'AUTH.SHELL.FEATURE_EXPLORE_DESC',
  },
  {
    icon: 'share-alt',
    title: 'AUTH.SHELL.FEATURE_SHARE_TITLE',
    description: 'AUTH.SHELL.FEATURE_SHARE_DESC',
  },
];

export const FORGOT_PASSWORD_PAGE_OPTIONS = [
  {
    icon: 'shield',
    title: 'Secure Reset Process',
    description: 'Industry-standard security protocols to protect your account',
  },
  {
    icon: 'envelope',
    title: 'Email Verification',
    description: 'Verification code sent directly to your registered email',
  },
  {
    icon: 'lock-open',
    title: 'Quick Recovery',
    description: 'Fast and efficient password recovery process',
  },
  {
    icon: 'user',
    title: 'User-Friendly Steps',
    description: 'Simple guided process with clear instructions at each step',
  },
];

export const RESET_PASSWORD_PAGE_OPTIONS = [
  {
    icon: 'shield',
    title: 'Secure Verification',
    description: 'Two-step verification process for enhanced security',
  },
  {
    icon: 'key',
    title: 'Strong Password',
    description: 'Create a strong password for better protection',
  },
  {
    icon: 'clock',
    title: 'Quick Process',
    description: 'Reset your password in just a few steps',
  },
  {
    icon: 'lock',
    title: 'OTP Verification',
    description: 'One Time Password verification for added security',
  },
];

export const SET_PASSWORD_PAGE_OPTIONS = [
  {
    icon: 'shield',
    title: 'Secure Setup',
    description: 'Industry-standard security protocols to protect your account',
  },
  {
    icon: 'key',
    title: 'Strong Password',
    description: 'Create a strong password for better protection',
  },
  {
    icon: 'clock',
    title: 'Quick Activation',
    description: 'Set your password and start using your account right away',
  },
  {
    icon: 'lock',
    title: 'Token Verified',
    description: 'Secure one-time link verification for account activation',
  },
];

export const MAX_LIMIT = 10000000;
export const DEFAULT_PAGE = 1;

/**
 * Single source of truth for list page sizes. Used by the shared
 * app-custom-table (+ its UsServerListAdapter) and the server-paged
 * app-custom-dropdown / app-custom-multiselect option fetch so every
 * list surface fetches 50 rows per page by default.
 */
export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
