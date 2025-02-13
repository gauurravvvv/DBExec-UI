import { Injectable } from '@angular/core';
import { AbstractControl, UntypedFormControl } from '@angular/forms';
import { SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { StorageType } from '../../constants/storageType';
import { StorageService } from './storage.service';
import { MessageService } from 'primeng/api';

interface IAPIResponse {
  code: number;
  message: string;
  data?: any;
  status: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class GlobalService {
  accessToken!: string | null;
  decodeToken!: any;
  userRole!: string;
  reportUrl!: string;
  public isSidenavOpened: BehaviorSubject<boolean> =
    new BehaviorSubject<boolean>(false);
  visualizationUrl!: SafeResourceUrl;
  search!: string;

  constructor(private router: Router, private messageService: MessageService) {}

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
        summary: 'Success',
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
        summary: 'Error',
        detail: response.message || 'An error occurred',
        life: 3000,
      });
    }
    return response.status;
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

  getDecodeToken() {
    const accessToken = StorageService.get(StorageType.ACCESS_TOKEN);
    if (accessToken) return JSON.parse(atob(accessToken.split('.')[1]));
    else this.router.navigateByUrl('');
  }

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
        case 'organisationName':
          return decodeToken?.organisation;
        case 'organisationId':
          return decodeToken?.organisationId;
        case 'permission':
          return decodeToken?.permissions;
        case 'userId':
          return decodeToken?.id;
        default:
          return null;
      }
    } catch (error) {
      this.router.navigateByUrl('');
      return null;
    }
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
        summary: 'Error',
        detail: error.message || 'An error occurred',
      });
    }
  }
}
