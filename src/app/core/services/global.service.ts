import { Injectable } from '@angular/core';
import { AbstractControl, UntypedFormControl } from '@angular/forms';
import { SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { BehaviorSubject } from 'rxjs';
import { StorageType } from '../constants/storage-type.constant';
import { IAPIResponse } from '../models/global.model';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root',
})
export class GlobalService {
  accessToken!: string | null;
  decodeToken!: any;
  reportUrl!: string;
  public isSidenavOpened: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  visualizationUrl!: SafeResourceUrl;
  search!: string;

  constructor(
    private router: Router,
    private messageService: MessageService,
    private translate: TranslateService,
  ) {}

  chipNameProvider(fullName: string | undefined | null) {
    const splitNameArray: string[] | undefined = fullName?.trim()?.split(' ');
    let chipName = '';
    if (splitNameArray) {
      if (splitNameArray.length > 1 && splitNameArray[1] !== 'null') {
        chipName =
          splitNameArray[0].charAt(0) +
          splitNameArray[splitNameArray.length - 1].charAt(0);
      } else {
        chipName =
          splitNameArray[0].charAt(0) +
          splitNameArray[0].charAt(splitNameArray[0].length - 1);
      }
    }
    return chipName.toUpperCase();
  }

  handleAPIResponse(response: any) {
    if (response.status) {
      // Success toast
      this.messageService.add({
        severity: 'success',
        summary: this.translate.instant('TOAST.SUCCESS'),
        detail: response.message,
        life: 3000,
        styleClass: 'custom-toast',
        contentStyleClass: 'custom-toast-content',
        icon: 'pi pi-check-circle',
      });
    } else {
      // Error toast
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('TOAST.ERROR'),
        detail:
          response.message || this.translate.instant('TOAST.ERROR_DEFAULT'),
        life: 3000,
      });
    }
    return response.status;
  }

  /**
   * Non-blocking warning toast. Used for advisory states where the
   * underlying action succeeded but a follow-up nudge is worth
   * surfacing (e.g. "saved, but some defaults are now stale").
   * Lives 6s — longer than success/error so the user has time to
   * read the secondary detail.
   */
  showWarn(detail: string, summary?: string): void {
    this.messageService.add({
      severity: 'warn',
      summary: summary ?? this.translate.instant('TOAST.WARNING'),
      detail,
      life: 6000,
      styleClass: 'custom-toast',
      contentStyleClass: 'custom-toast-content',
      icon: 'pi pi-exclamation-triangle',
    });
  }

  /**
   * Quiet informational toast. Use for ambient confirmations where
   * a success toast would feel too loud.
   */
  showInfo(detail: string, summary?: string): void {
    this.messageService.add({
      severity: 'info',
      summary: summary ?? this.translate.instant('TOAST.INFO'),
      detail,
      life: 3000,
      styleClass: 'custom-toast',
      contentStyleClass: 'custom-toast-content',
      icon: 'pi pi-info-circle',
    });
  }

  toControl(absCtrl: AbstractControl): UntypedFormControl {
    const ctrl = absCtrl as UntypedFormControl;
    return ctrl;
  }

  checkMobileField(mobileNumber: string, countryCode: string) {
    if (
      mobileNumber !== null &&
      mobileNumber !== '' &&
      mobileNumber !== undefined
    ) {
      return countryCode + mobileNumber.toString();
    } else {
      return null;
    }
  }

  /**
   * UI-only JWT decode — no signature verification.
   * All security decisions are enforced server-side; this is only for display/routing.
   */
  getDecodeToken() {
    const accessToken = StorageService.get(StorageType.ACCESS_TOKEN);
    if (accessToken) return JSON.parse(atob(accessToken.split('.')[1]));
    else this.router.navigateByUrl('');
  }

  /**
   * UI-only JWT claim extraction — no signature verification.
   * Used for display/routing only; server enforces all access control.
   */
  getTokenDetails(value: string) {
    const accessToken = StorageService.get(StorageType.ACCESS_TOKEN);
    if (!accessToken) {
      this.router.navigateByUrl('');
      return null;
    }

    try {
      const decodeToken = JSON.parse(atob(accessToken.split('.')[1]));
      switch (value) {
        case 'decodeToken':
          return decodeToken;
        case 'name':
          return decodeToken?.name;
        case 'role':
          return decodeToken?.role;
        case 'username':
          return decodeToken?.username;
        case 'email':
          return decodeToken?.email;
        case 'organisationName':
          return decodeToken?.organisation;
        case 'organisationId':
          return decodeToken?.organisationId;
        case 'permission':
          return decodeToken?.permissions;
        case 'userId':
          return decodeToken?.id;
        case 'locale':
          return decodeToken?.locale || 'en';
        default:
          return null;
      }
    } catch (error) {
      this.router.navigateByUrl('');
      return null;
    }
  }

  /**
   * Returns true if the logged-in user has the given permission value
   * anywhere in their permissions tree.
   *
   * There is no SYSTEM_ADMIN bypass — the platform System Admin is
   * subject to the same JWT-encoded permission set as every other
   * role. Their tree only carries the V2 platform values (home /
   * systemAdmin / orgManagement / auditLogs / loginActivity /
   * announcementManagement / appSettings); UI gating for per-org
   * features (USER_MANAGEMENT, DATASET, DASHBOARD, etc.) correctly
   * resolves to false for them. The BE enforces the same contract
   * via VerifyPermissionMiddleware, so the UI and API stay aligned.
   */
  hasPermission(permissionValue: string): boolean {
    const permissions = this.getTokenDetails('permission');
    if (!permissions || !Array.isArray(permissions)) return false;
    return this.checkPermissionTree(permissions, permissionValue);
  }

  private checkPermissionTree(permissions: any[], value: string): boolean {
    for (const perm of permissions) {
      if (perm.value === value) return true;
      if (
        perm.subPermissions &&
        this.checkPermissionTree(perm.subPermissions, value)
      )
        return true;
    }
    return false;
  }

  camelCase(input: string): string {
    const noSplChar = input.replace(/[^A-Za-z0-9 ]/g, ' ').toLowerCase();
    const words = noSplChar.split(' ');
    if (words.length === 1) {
      return words[0].toLowerCase();
    }

    const capitalizedWords = words.map((word, index) => {
      if (index === 0) {
        return word.toLowerCase();
      } else {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
    });

    return capitalizedWords.join('');
  }

  handleErrorService(error: any): void {
    // Clear any existing messages
    this.messageService.clear();

    // Handle different types of errors
    if (error.status === false) {
      // Handle application errors (like invalid credentials)
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('TOAST.ERROR'),
        detail: error.message || this.translate.instant('TOAST.ERROR_DEFAULT'),
      });
    }
  }

  handleSuccessService(
    result: IAPIResponse,
    showToast = true,
    showErrorToast = true,
  ) {
    if (result.code == 200) {
      if (showToast)
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('TOAST.SUCCESS'),
          detail: result.message,
          key: 'topRight',
          life: 3000,
          styleClass: 'custom-toast',
        });
      return true;
    } else {
      if (showErrorToast)
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('TOAST.ERROR'),
          detail: result.message,
          key: 'topRight',
          life: 3000,
          styleClass: 'custom-toast',
        });
      return false;
    }
  }
}
