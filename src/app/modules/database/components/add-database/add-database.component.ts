import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { DATABASE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatabaseService } from '../../services/database.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-add-database',
  templateUrl: './add-database.component.html',
  styleUrls: ['./add-database.component.scss'],
})
export class AddDatabaseComponent implements OnInit, HasUnsavedChanges {
  databaseForm!: FormGroup;
  organisations: any[] = [];
  private _showOrganisationDropdown = false;
  showPassword: boolean = false;

  // Connection test
  connectionTested = false;
  connectionTestLoading = false;
  connectionTestResult: 'success' | 'failed' | null = null;

  constructor(
    private fb: FormBuilder,
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private router: Router,
  ) {}

  get isFormDirty(): boolean {
    return this.databaseForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.showOrganisationDropdown =
      this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

    this.initForm();
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    }

    // Reset connection test when connection fields change
    ['host', 'port', 'database', 'username', 'password'].forEach(field => {
      this.databaseForm.get(field)?.valueChanges.subscribe(() => {
        this.connectionTested = false;
        this.connectionTestResult = null;
      });
    });
  }

  initForm(): void {
    this.databaseForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(64),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: ['', [Validators.maxLength(500)]],
      type: [{ value: 'postgres', disabled: true }],
      host: ['', [Validators.required, Validators.pattern('^[a-zA-Z0-9.-]+$')]],
      port: [
        '',
        [
          Validators.required,
          Validators.pattern('^[0-9]+$'),
          Validators.min(1),
          Validators.max(65535),
        ],
      ],
      database: [
        '',
        [Validators.required, Validators.pattern('^[a-zA-Z0-9_-]+$')],
      ],
      username: ['', Validators.required],
      password: ['', [Validators.required]],
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
    });

    const orgControl = this.databaseForm.get('organisation');
    if (this.showOrganisationDropdown) {
      orgControl?.setValidators([Validators.required]);
    }
  }

  loadOrganisations(): void {
    if (this.showOrganisationDropdown) {
      const params = {
        page: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      };
      this.organisationService.listOrganisation(params).then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = [...response.data.orgs];
        }
      });
    }
  }

  onSubmit(): void {
    if (this.databaseForm.valid && this.connectionTested) {
      const formValue = this.databaseForm.getRawValue();

      const payload: any = {
        name: formValue.name,
        description: formValue.description,
        type: formValue.type,
        host: formValue.host,
        port: formValue.port,
        database: formValue.database,
        username: formValue.username,
        password: formValue.password,
        organisation: formValue.organisation,
      };

      this.databaseService.addDatabase(payload).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.databaseForm.markAsPristine();
          this.router.navigate([DATABASE.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.databaseForm.reset();
      this.databaseForm.get('type')?.setValue('postgres');
      this.databaseForm.get('type')?.disable();
      this.databaseForm.markAsPristine();
      this.connectionTested = false;
      this.connectionTestLoading = false;
      this.connectionTestResult = null;
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.databaseForm.get(fieldName);
    if (control?.errors) {
      if (control.errors['required']) return 'This field is required';
      if (control.errors['minlength'])
        return `Must be at least ${control.errors['minlength'].requiredLength} characters`;
      if (control.errors['maxlength'])
        return `Must not exceed ${control.errors['maxlength'].requiredLength} characters`;
      if (control.errors['pattern']) {
        switch (fieldName) {
          case 'name':
            return 'Name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
          case 'host':
            return 'Invalid host format';
          case 'port':
            return 'Port must be a number';
          case 'database':
            return 'Database name can only contain letters, numbers, underscores and hyphens';
          default:
            return 'Invalid format';
        }
      }
      if (control.errors['min'] && fieldName === 'port')
        return 'Port must be at least 1';
      if (control.errors['max'] && fieldName === 'port')
        return 'Port cannot exceed 65535';
    }
    return '';
  }

  onPortKeyPress(event: KeyboardEvent): boolean {
    const pattern = /[0-9]/;
    const inputChar = String.fromCharCode(event.charCode);

    if (!pattern.test(inputChar)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  testConnection(): void {
    if (!this.isConnectionFieldsValid()) return;

    this.connectionTestLoading = true;
    this.connectionTestResult = null;

    const formValue = this.databaseForm.getRawValue();
    this.organisationService
      .validateDatabase({
        type: 'postgres',
        host: formValue.host,
        port: formValue.port,
        database: formValue.database,
        username: formValue.username,
        password: formValue.password,
      })
      .then((response: any) => {
        this.connectionTestLoading = false;
        if (response?.isConnected) {
          this.connectionTested = true;
          this.connectionTestResult = 'success';
        } else {
          this.connectionTested = false;
          this.connectionTestResult = 'failed';
        }
      })
      .catch(() => {
        this.connectionTestLoading = false;
        this.connectionTested = false;
        this.connectionTestResult = 'failed';
      });
  }

  isConnectionFieldsValid(): boolean {
    const fields = ['host', 'port', 'database', 'username', 'password'];
    return fields.every(
      f => this.databaseForm.get(f)?.valid && this.databaseForm.get(f)?.value,
    );
  }

  isFormValid(): boolean {
    return this.databaseForm.valid && this.connectionTested;
  }

  togglePassword(event: Event): void {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  set showOrganisationDropdown(value: boolean) {
    this._showOrganisationDropdown = value;
    if (this.databaseForm) {
      const orgControl = this.databaseForm.get('organisation');

      if (value) {
        orgControl?.enable();
        orgControl?.setValidators([Validators.required]);
      } else {
        orgControl?.disable();
        orgControl?.clearValidators();
        orgControl?.setValue(null);
      }
    }
  }

  get showOrganisationDropdown(): boolean {
    return this._showOrganisationDropdown;
  }
}
