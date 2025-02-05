export const validationRegex = {
  email:
    "^[-!#$%&'*+/0-9=?A-Z^_a-z{|}~](\\.?[-!#$%&'*+/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\\.?[a-zA-Z0-9])*\\.[a-zA-Z](-?[a-zA-Z0-9])+$",
  mobile: '^(\\+\\d{1,3}[- ]?)?\\d{10}$',
  password: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*?&#])[A-Za-z\\d@$!%*?&#]{8,}$',
  ipAddress:
    '(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)',
  siteUrlPattern:
    '/[-a-zA-Z0-9@:%._+~#=]{1,256}.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)?/gi',
  name: '^[a-z A-Z]+$',
  nameSeries:
    '^[a-zA-Z0-9-_ \\u3000-\\u303F\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF]+$',
  siteName: '^(?!_+$)(?!\\s+$)(?!^[_\\s]+|[_\\s]+$)[a-zA-Z0-9\\s_]+$',
  nameStartAlphabet:
    '^[A-Za-z\\u3000-\\u303F\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF].*',
  clientName: '^[a-zA-Z0-9._-]*$',
  roleName: '^[a-zA-Z0-9._-]*$',

  // prettier-ignore
  numberCharacter: '^[a-z A-Z 0-9-,;|\n\r]+$',
  caseSeriesName:
    '^[a-zA-Z0-9-_ \\u3000-\\u303F\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF]+$',

  // prettier-ignore
  sqlRegex: /^[^\S\r\n]*select[^\S\r\n]+.*[^\S\r\n]*from[^\S\r\n]+.*/i,

  // prettier-ignore
  siteUrl:"^(http[s]?:\\/\\/(www\\.)?|ftp:\\/\\/(www\\.)?|www\\.){1}([0-9A-Za-z-\\.@:%_\+~#=]+)+((\\.[a-zA-Z]{2,3})+)(/(.)*)?(\\?(.)*)?",
  airflowUrl:
    '^(http[s]?:\\/\\/(www\\.)?|ftp:\\/\\/(www\\.)?|www\\.){1}([0-9A-Za-z-\\.@:%_+~#=]+)+((\\.[a-zA-Z]{2,3})+)(/(.)*)?(\\?(.)*)?',
};

export const inputMaxLength = {
  nameMaxLength: '30',
  emailMaxLength: '60',
  phoneMaxLength: '10',
  usernameMaxLength: '15',
  portMaxLength: '5',
  ipMaxLength: '15',
  siteUrlMaxLength: '100',
};

export const inputFieldLength = {
  nameMaxLength: 30,
  nameMinLength: 4,
  emailMaxLength: 100,
  phoneMaxLength: 10,
  usernameMaxLength: 30,
  portMaxLength: 5,
  ipMaxLength: 15,
  siteUrlMaxLength: 100,
  airflowUrlMaxLength: 100,
  pinCode: 6,
  passwordMaxLength: 25,
  siteUsernameLength: 30,
  caseSeriesName: 120,
  description: 2000,
  maxQSigthAccoutIdLength: 12,
  minQSigthAccoutIdLength: 12,
  namespaceLength: 64,
};

export const state = {
  ACTIVE: 1,
  INACTIVE: 0,
};

export const langType = {
  EN: 'EN',
  en: 'en',
  JA: 'JA',
  ja: 'ja',
};

export const DATE_FORMAT = 'dd-MMM-yyyy';

export const PASSWORD = 'Password@9999';

export const NO_PASSWORD_POLICY = 'No password policy is applied here';

export const CONFIRMATION_MESSAGE =
  'Are you sure that you want to do this action? Changes you made might not be saved.';

export const VALIDATION_TYPE = {
  REQUIRED: 'required',
  MINLENGTH: 'minlength',
  MAXLENGTH: 'maxlength',
  PATTERN: 'pattern',
};
