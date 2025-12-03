export const REGEX = {
  username: '^[A-Za-z][A-Za-z0-9._-]{5,29}$',
  firstName: `^[A-Za-z][A-Za-z-]{3,29}$`,
  lastName: `^[A-Za-z][A-Za-z-]{3,29}$`,
  password:
    '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
  orgName: '^[A-Za-z0-9._-]{1,64}$',
  mobile: '^[0-9]{10}$',
  otp: '^[0-9]{6}$',
};
