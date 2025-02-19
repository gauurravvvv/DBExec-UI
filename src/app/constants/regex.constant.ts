export const REGEX = {
  username: '^[a-zA-Z0-9_]+$',
  firstName: '^[a-zA-Z]+([ -][a-zA-Z]+)*$',
  lastName: '^[a-zA-Z]+([ -][a-zA-Z]+)*$',
  password:
    '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$',
  orgName: '^[a-zA-Z0-9_]+$',
  mobile: '^[0-9]{10}$',
  otp: '^[0-9]{6}$',
};
