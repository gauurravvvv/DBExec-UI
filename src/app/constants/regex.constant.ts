export const REGEX = {
  username: '^[A-Za-z][A-Za-z0-9._-]{5,29}$',
  // Unicode-aware: supports accented chars (José), apostrophes (O'Brien), hyphens (Mary-Jane)
  firstName: /^[\p{L}][\p{L}'\- ]*$/u,
  lastName: /^[\p{L}][\p{L}'\- ]*$/u,
  // Legacy password regex — prefer passwordStrengthValidator() for per-rule errors
  password:
    '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
  orgName: /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/,
  pepperKey: /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{32,}$/,
  mobile: '^[0-9]{10}$',
  otp: '^[0-9]{6}$',
};
