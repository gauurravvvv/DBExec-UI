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
}

export enum SessionStorageType {
  ORGANISATION = 'organisation',
  ORGANISATION_ID = 'organisation_id',
}
