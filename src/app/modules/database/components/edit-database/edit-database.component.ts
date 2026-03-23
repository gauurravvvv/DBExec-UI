import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { DATABASE } from 'src/app/constants/routes';
import { DatabaseService } from '../../services/database.service';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import {
  trigger,
  transition,
  style,
  animate,
  state,
} from '@angular/animations';

@Component({
  selector: 'app-edit-database',
  templateUrl: './edit-database.component.html',
  styleUrls: ['./edit-database.component.scss'],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate(
          '300ms ease-out',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ opacity: 0, transform: 'translateY(-10px)' }),
        ),
      ]),
    ]),
    trigger('expandCollapse', [
      state(
        'collapsed',
        style({
          height: '0',
          overflow: 'hidden',
          opacity: '0',
          padding: '0 1rem',
        }),
      ),
      state(
        'expanded',
        style({
          height: '*',
          overflow: 'hidden',
          opacity: '1',
          padding: '1rem',
        }),
      ),
      transition('collapsed <=> expanded', [animate('300ms ease-in-out')]),
    ]),
  ],
})
export class EditDatabaseComponent implements OnInit {
  databaseForm!: FormGroup;
  isFormDirty = false;
  showOrganisationDropdown = false;
  showPassword: boolean = false;
  databaseId: string = '';
  orgId: string = '';
  initialFormValues: any = null;
  organisationName: string = '';
  isWarningExpanded: boolean = false;

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
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.showOrganisationDropdown =
      this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

    this.initForm();

    this.databaseId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadDatabaseData();

    // Monitor form changes
    this.databaseForm.valueChanges.subscribe(() => {
      if (this.initialFormValues) {
        this.isFormDirty = !this.isEqual(
          this.databaseForm.getRawValue(),
          this.initialFormValues,
        );
      }
    });

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
      password: [''],
      organisation: [{ value: '', disabled: true }],
      status: [true],
    });
  }

  loadDatabaseData(): void {
    this.databaseService.viewDatabase(this.orgId, this.databaseId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const data = response.data;
        this.organisationName = data.organisationId;

        const formData = {
          name: data.name,
          description: data.description || '',
          type: data.config?.dbType || 'postgres',
          host: data.config?.hostname || '',
          port: data.config?.port || '',
          database: data.config?.dbName || '',
          username: data.config?.username || '',
          password: '',
          organisation: data.organisationId,
          status: data.status === 1,
        };

        this.initialFormValues = { ...formData };
        this.databaseForm.patchValue(formData);
        this.isFormDirty = false;

        // Connection is already valid since the DB was fetched successfully
        this.connectionTested = true;
        this.connectionTestResult = 'success';
      }
    });
  }

  isConnectionFieldsValid(): boolean {
    const fields = ['host', 'port', 'database', 'username'];
    return fields.every(f => this.databaseForm.get(f)?.valid && this.databaseForm.get(f)?.value);
  }

  isConnectionFieldsDirty(): boolean {
    if (!this.initialFormValues) return false;
    const current = this.databaseForm.getRawValue();
    return ['host', 'port', 'database', 'username', 'password'].some(
      key => current[key] !== this.initialFormValues[key],
    );
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

  onSubmit(): void {
    if (this.databaseForm.valid && this.connectionTested) {
      const formValue = this.databaseForm.getRawValue();

      const payload = {
        id: this.databaseId,
        name: formValue.name,
        description: formValue.description,
        type: formValue.type,
        host: formValue.host,
        port: formValue.port,
        database: formValue.database,
        username: formValue.username,
        password: formValue.password,
        organisation: this.orgId,
        status: formValue.status ? 1 : 0,
      };

      this.databaseService.updateDatabase(payload).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([DATABASE.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.databaseForm.patchValue(this.initialFormValues);
      this.isFormDirty = false;
      // Restore connection test state since we reset to original values
      this.connectionTested = true;
      this.connectionTestResult = 'success';
    } else {
      this.router.navigate([DATABASE.LIST]);
    }
  }

  isFormValid(): boolean {
    return this.databaseForm.valid && this.isFormDirty && this.connectionTested;
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

  togglePassword(event: Event): void {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  toggleWarning(): void {
    this.isWarningExpanded = !this.isWarningExpanded;
  }

  onStatusChange(event: any): void {
    this.databaseForm.patchValue({
      status: event.checked,
    });
  }

  onNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');
  }

  private isEqual(obj1: any, obj2: any): boolean {
    const form = { ...obj1 };
    const initial = { ...obj2 };

    // Exclude password from comparison if it's empty in the form
    if (!form.password) {
      delete form.password;
      delete initial.password;
    }

    return JSON.stringify(form) === JSON.stringify(initial);
  }
}
