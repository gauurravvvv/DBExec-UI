export enum StorageType {
  ACCESS_TOKEN = 'access-token',
  REFRESH_TOKEN = 'refresh-token',
  ORGANISATION = 'organisation',
  ORGANISATION_ID = 'organisation_id',
  LABEL = 'label',
  ROLE = 'role',
  SAVED_CREDS = 'savedCredentials',
  SESSION_INACTIVITY_TIMEOUT = 'sessionInactivityTimeout',
  THEME = 'theme',
  LOCALE = 'locale',
  // JSON-stringified list of announcements visible to the user. Populated
  // from the login response so the header doesn't have to poll
  // /announcements/current. Updated by dismiss + admin-side mutations.
  ANNOUNCEMENTS = 'announcements',
  // Permission tree (JSON stringified PermissionNode[]) returned by
  // GET /auth/session on login. PermissionService + sidebar read from
  // this; cleared on logout. Distinct from the JWT-embedded flat list
  // used by HTTP interceptors / BE forwards.
  PERMISSION_TREE = 'permission-tree',
  // Phase-1 relay payload — populated by login() and consumed by the
  // /auth/relay component to render the greeting before phase 2
  // returns. Cleared once the relay navigates to home.
  RELAY_FIRST_NAME = 'relay-first-name',
  RELAY_LAST_NAME = 'relay-last-name',
  RELAY_IS_FIRST_LOGIN = 'relay-is-first-login',
}

export enum SessionStorageType {
  ORGANISATION = 'organisation',
  ORGANISATION_ID = 'organisation_id',
}
