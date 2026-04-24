import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { DATASOURCE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasourceService } from '../../services/datasource.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-add-datasource',
  templateUrl: './add-datasource.component.html',
  styleUrls: ['./add-datasource.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddDatasourceComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  datasourceForm!: FormGroup;
  organisations: any[] = [];
  private _showOrganisationDropdown = false;
  showPassword: boolean = false;

  // Connection test
  connectionTested = false;
  connectionTestLoading = false;
  connectionTestResult: 'success' | 'failed' | null = null;

  saving = this.datasourceService.saving;

  constructor(
    private fb: FormBuilder,
    private datasourceService: DatasourceService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  get isFormDirty(): boolean {
    return this.datasourceForm.dirty;
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
      this.datasourceForm.get(field)?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.connectionTested = false;
        this.connectionTestResult = null;
      });
    });
  }

  initForm(): void {
    this.datasourceForm = this.fb.group({
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

    const orgControl = this.datasourceForm.get('organisation');
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
          this.cdr.markForCheck();
        }
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.datasourceForm.valid && this.connectionTested) {
      const formValue = this.datasourceForm.getRawValue();

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

      const response = await this.datasourceService.add(payload);
      if (this.globalService.handleSuccessService(response)) {
        this.datasourceForm.markAsPristine();
        this.router.navigate([DATASOURCE.LIST]);
      }
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.datasourceForm.reset();
      this.datasourceForm.get('type')?.setValue('postgres');
      this.datasourceForm.get('type')?.disable();
      this.datasourceForm.markAsPristine();
      this.connectionTested = false;
      this.connectionTestLoading = false;
      this.connectionTestResult = null;
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.datasourceForm.get(fieldName);
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

    const formValue = this.datasourceForm.getRawValue();
    this.organisationService
      .validateDatasource({
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
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.connectionTestLoading = false;
        this.connectionTested = false;
        this.connectionTestResult = 'failed';
        this.cdr.markForCheck();
      });
  }

  isConnectionFieldsValid(): boolean {
    const fields = ['host', 'port', 'database', 'username', 'password'];
    return fields.every(
      f =>
        this.datasourceForm.get(f)?.valid && this.datasourceForm.get(f)?.value,
    );
  }

  isFormValid(): boolean {
    return this.datasourceForm.valid && this.connectionTested;
  }

  togglePassword(event: Event): void {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  set showOrganisationDropdown(value: boolean) {
    this._showOrganisationDropdown = value;
    if (this.datasourceForm) {
      const orgControl = this.datasourceForm.get('organisation');

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
