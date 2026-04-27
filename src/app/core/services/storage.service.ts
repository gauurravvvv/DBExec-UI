import { SessionStorageType, StorageType } from 'src/app/constants/storageType';

/**
 * Centralized storage access layer.
 *
 * TODO [Security]: Migrate ACCESS_TOKEN and REFRESH_TOKEN from localStorage
 * to httpOnly secure cookies. localStorage is vulnerable to XSS — any injected
 * script can read tokens. This requires backend changes:
 *   1. Server sets httpOnly, Secure, SameSite=Strict cookies on login/refresh
 *   2. Remove client-side token storage/attachment (interceptor sends cookies automatically)
 *   3. CSRF protection (double-submit cookie or custom header)
 */
export class StorageService {
  static localStorage = window.localStorage;
  static sessionStorage = window.sessionStorage;

  static get(storageType: StorageType) {
    return this.localStorage.getItem(storageType);
  }

  static set(storageType: StorageType, value: string) {
    this.localStorage.setItem(storageType, value);
  }

  static remove(storageType: StorageType) {
    this.localStorage.removeItem(storageType);
  }

  static getSessionVal(storageType: SessionStorageType | any) {
    return this.sessionStorage.getItem(storageType);
  }

  static setSessionVal(storageType: SessionStorageType | any, value: any) {
    this.sessionStorage.setItem(storageType, value);
  }

  static clear() {
    this.localStorage.clear();
    this.sessionStorage.clear();
  }
}
