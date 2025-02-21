import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DATABASE } from 'src/app/constants/routes';
import { DatabaseService } from '../../services/database.service';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';

@Component({
  selector: 'app-add-database',
  templateUrl: './add-database.component.html',
  styleUrls: ['./add-database.component.scss'],
})
export class AddDatabaseComponent implements OnInit {
  databaseForm!: FormGroup;
  organisations: any[] = [];
  private _showOrganisationDropdown = false;
  showPassword: boolean = false;

  constructor(
    private fb: FormBuilder,
    private databaseService: DatabaseService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private messageService: MessageService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.showOrganisationDropdown =
      this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

    this.initForm();
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    }
  }

  initForm(): void {
    const orgId = this.globalService.getTokenDetails('organisationId');

    this.databaseForm = this.fb.group({
      name: [
        '',
        [Validators.required, Validators.pattern('^[a-zA-Z0-9\\s-]+$')],
      ],
      description: ['', Validators.required],
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
        {
          value: orgId || null,
          disabled: !this.showOrganisationDropdown,
        },
      ],
      acknowledgment: [false],
      schemaAcknowledgment: [false],
      isMasterDB: [false],
    });

    // Handle validators separately
    const orgControl = this.databaseForm.get('organisation');
    if (this.showOrganisationDropdown) {
      orgControl?.setValidators([Validators.required]);
    }

    // Subscribe to isMasterDB changes to update validators
    this.databaseForm.get('isMasterDB')?.valueChanges.subscribe(isMaster => {
      const acknowledgmentControl = this.databaseForm.get('acknowledgment');
      const schemaAcknowledgmentControl = this.databaseForm.get(
        'schemaAcknowledgment'
      );

      if (isMaster) {
        acknowledgmentControl?.setValidators(Validators.requiredTrue);
        schemaAcknowledgmentControl?.setValidators(Validators.requiredTrue);
      } else {
        acknowledgmentControl?.clearValidators();
        schemaAcknowledgmentControl?.clearValidators();
      }

      acknowledgmentControl?.updateValueAndValidity();
      schemaAcknowledgmentControl?.updateValueAndValidity();
    });
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.databaseForm.dirty;
  }

  loadOrganisations(): void {
    if (this.showOrganisationDropdown) {
      const params = {
        pageNumber: 1,
        limit: 100,
      };
      this.organisationService.listOrganisation(params).subscribe({
        next: response => {
          this.organisations = response.data.orgs;
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load organisations',
          });
        },
      });
    }
  }

  onSubmit(): void {
    if (this.databaseForm.valid) {
      const formValue = this.databaseForm.getRawValue();

      const payload = {
        name: formValue.name,
        description: formValue.description,
        type: formValue.type,
        host: formValue.host,
        port: formValue.port,
        database: formValue.database,
        username: formValue.username,
        password: formValue.password,
        organisation: this.showOrganisationDropdown
          ? formValue.organisation
          : formValue.organisation.value,
        isMasterDB: formValue.isMasterDB,
      };

      this.databaseService.addDatabase(payload).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Database added successfully',
          });
          this.router.navigate([DATABASE.LIST]);
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to add database',
          });
        },
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.databaseForm.reset();
      this.databaseForm.markAsPristine();
    } else {
      this.router.navigate([DATABASE.LIST]);
    }
  }

  getErrorMessage(fieldName: string): string {
    const control = this.databaseForm.get(fieldName);
    if (control?.errors) {
      if (control.errors['required']) return 'This field is required';
      if (control.errors['pattern']) {
        switch (fieldName) {
          case 'name':
            return 'Name can only contain letters, numbers, spaces and hyphens';
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
      if (control.errors['minlength']) return 'Minimum length is 8 characters';
      if (fieldName === 'password' && control.errors['pattern']) {
        return 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character';
      }
      if (control.errors['min'] && fieldName === 'port')
        return 'Port must be at least 1';
      if (control.errors['max'] && fieldName === 'port')
        return 'Port cannot exceed 65535';
    }
    return '';
  }

  canSubmit(): boolean {
    return (
      this.databaseForm.valid &&
      this.databaseForm.get('acknowledgment')?.value === true
    );
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
