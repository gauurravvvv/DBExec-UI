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
  otp: '^[A-Za-z0-9]{6}$',
  // Angular's Validators.email accepts 'x@y' (no TLD). For places
  // where we want the stricter "local@domain.tld" shape, layer this
  // regex via Validators.pattern alongside Validators.email.
  // Local part: letters/digits/dot/underscore/percent/plus/hyphen.
  // Domain: at least two labels separated by a dot; TLD ≥ 2 chars.
  email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/,
};
