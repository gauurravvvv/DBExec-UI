import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { GROUP } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-add-group',
  templateUrl: './add-group.component.html',
  styleUrls: ['./add-group.component.scss'],
})
export class AddGroupComponent implements OnInit {
  userGroupForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  users: any[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private groupService: GroupService,
    private userService: UserService
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.userGroupForm.dirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.loadUsers();
    }
  }

  initForm() {
    this.userGroupForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      description: [''],
      organisation: ['', Validators.required],
      users: ['', [Validators.required, this.minUsersValidator(2)]],
    });

    this.userGroupForm.get('organisation')?.valueChanges.subscribe(value => {
      if (value) {
        this.loadUsers();
        this.userGroupForm.patchValue({ users: [] }, { emitEvent: false });
      } else {
        this.users = [];
      }
    });
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data.orgs;
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  loadUsers() {
    const orgId = this.userGroupForm.get('organisation')?.value;
    if (!orgId) return;

    const params = {
      orgId,
      pageNumber: 1,
      limit: 100,
    };

    this.userService.listUser(params).subscribe({
      next: (response: any) => {
        this.users = response.data.users;
      },
      error: error => {
        console.error('Error loading users:', error);
        this.users = [];
      },
    });
  }

  onSubmit() {
    if (this.canSubmit()) {
      this.groupService.addGroup(this.userGroupForm).subscribe({
        next: () => {
          this.router.navigate([GROUP.LIST]);
        },
        error: error => {
          console.error('Error adding environment:', error);
        },
      });
    } else {
      Object.keys(this.userGroupForm.controls).forEach(key => {
        const control = this.userGroupForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  onCancel() {
    this.userGroupForm.reset();
    Object.keys(this.userGroupForm.controls).forEach(key => {
      if (key === 'users') {
        this.userGroupForm.get(key)?.setValue([]);
      } else {
        this.userGroupForm.get(key)?.setValue('');
      }
    });
  }

  getFieldErrorMessage(field: any): string {
    if (field.get('name')?.errors) {
      const errors = field.get('name')?.errors;

      if (errors?.['required']) {
        return 'Field name is required';
      }
      if (errors?.['minlength']) {
        return 'Field name must be at least 6 characters';
      }
      if (errors?.['maxlength']) {
        return 'Field name cannot exceed 20 characters';
      }
      if (errors?.['pattern']) {
        return 'Field name can only contain letters, spaces and hyphens';
      }
    }
    return '';
  }

  minUsersValidator(min: number) {
    return (control: AbstractControl): ValidationErrors | null => {
      const users = control.value as any[];
      if (!users || users.length < min) {
        return { minUsers: { min, actual: users?.length || 0 } };
      }
      return null;
    };
  }

  canSubmit(): boolean {
    const users = this.userGroupForm.get('users')?.value || [];
    return this.userGroupForm.valid && users.length > 1;
  }
}
