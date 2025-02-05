export const LOG_TYPE = [
  { value: 'SUPER_ADMIN', label: 'Super Admin', isClientEnabled: false },
  { value: 'SITE', label: 'Site', isClientEnabled: false },
  {
    value: 'CLIENT',
    label: 'Client',
    isClientEnabled: false,
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    isClientEnabled: false,
  },
  { value: 'ROLE', label: 'Role', isClientEnabled: true },
  { value: 'USER', label: 'User', isClientEnabled: true },
  { value: 'USER_GROUP', label: 'User Group', isClientEnabled: true },
  {
    value: 'CONFIG',
    label: 'Client Configuration',
    isClientEnabled: true,
  },
  {
    value: 'SETTINGS',
    label: 'Setting',
    isClientEnabled: true,
  },
  {
    value: 'CASE_SERIES',
    label: 'Case Series',
    isClientEnabled: true,
  },
  {
    value: 'QUERY',
    label: 'Querying',
    isClientEnabled: true,
  },
];

export const CLIENT_LOG_TYPE = [
  {
    value: 'CLIENT',
    label: 'Client',
    isClientEnabled: false,
  },

  { value: 'ROLE', label: 'Role', isClientEnabled: true },
  { value: 'USER', label: 'User', isClientEnabled: true },
  { value: 'USER_GROUP', label: 'User Group', isClientEnabled: true },
  {
    value: 'CONFIG',
    label: 'Client Configuration',
    isClientEnabled: true,
  },
  {
    value: 'SETTINGS',
    label: 'Setting',
    isClientEnabled: true,
  },
  {
    value: 'CASE_SERIES',
    label: 'Case Series',
    isClientEnabled: true,
  },
  {
    value: 'QUERY',
    label: 'Query',
    isClientEnabled: true,
  },
];
