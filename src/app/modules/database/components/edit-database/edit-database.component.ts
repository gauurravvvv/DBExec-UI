import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DATABASE } from 'src/app/constants/routes';
import { DatabaseService } from '../../services/database.service';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
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
          style({ opacity: 1, transform: 'translateY(0)' })
        ),
      ]),
      transition(':leave', [
        animate(
          '300ms ease-in',
          style({ opacity: 0, transform: 'translateY(-10px)' })
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
        })
      ),
      state(
        'expanded',
        style({
          height: '*',
          overflow: 'hidden',
          opacity: '1',
          padding: '1rem',
        })
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
  initialFormValues: any = null;
  organisationName: string = '';
  isMasterDatabase: boolean = false;
  isWarningExpanded: boolean = false;
  private organisationId: string = '';

  constructor(
    private fb: FormBuilder,
    private databaseService: DatabaseService,
    private globalService: GlobalService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.showOrganisationDropdown =
      this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

    this.initForm();

    // Get database ID from route params and load database data
    this.route.params.subscribe(params => {
      this.databaseId = params['id'];
      this.loadDatabaseData();
    });

    // Monitor form changes
    this.databaseForm.valueChanges.subscribe(() => {
      if (this.initialFormValues) {
        // Only mark form as dirty if values are different from initial values
        this.isFormDirty = !this.isEqual(
          this.databaseForm.getRawValue(),
          this.initialFormValues
        );
      }
    });
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
      organisation: [{ value: orgId, disabled: true }],
      status: [true],
    });
  }

  loadDatabaseData(): void {
    // this.databaseService.viewDatabase(this.databaseId).then(response => {
    //   if (this.globalService.handleSuccessService(response, false)) {
    //     this.isMasterDatabase = response.data.isMasterDB;
    //     this.organisationId = response.data.organisationId;
    //     const formData = {
    //       name: response.data.name,
    //       description: response.data.description,
    //       type: response.data.config.dbType,
    //       host: response.data.config.hostname,
    //       port: response.data.config.port,
    //       database: response.data.config.dbName,
    //       username: response.data.config.username,
    //       password: '',
    //       status: this.isMasterDatabase ? true : response.data.status === 1,
    //     };
    //     // Set organisation name directly from response
    //     this.organisationName = response.data.organisationName;
    //     if (this.isMasterDatabase) {
    //       this.databaseForm.get('status')?.disable();
    //     }
    //     this.initialFormValues = { ...formData };
    //     this.databaseForm.patchValue(formData);
    //     this.isFormDirty = false;
    //   }
    // });
  }

  onSubmit(): void {
    if (this.databaseForm.valid) {
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
        organisation: this.organisationId,
        status: this.isMasterDatabase ? 1 : formValue.status ? 1 : 0,
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
      // Reset form to initial values
      this.databaseForm.patchValue(this.initialFormValues);
      this.isFormDirty = false;
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
    if (!this.isMasterDatabase) {
      this.databaseForm.patchValue({
        status: event.checked,
      });
    }
  }

  // Helper method to compare objects
  private isEqual(obj1: any, obj2: any): boolean {
    // Exclude password from comparison if it's empty in the form
    const form = { ...obj1 };
    const initial = { ...obj2 };

    if (!form.password) {
      delete form.password;
      delete initial.password;
    }

    return JSON.stringify(form) === JSON.stringify(initial);
  }
}
