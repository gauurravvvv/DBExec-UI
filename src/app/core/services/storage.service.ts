import { StorageType, SessionStorageType } from "src/app/constants/storageType";

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
