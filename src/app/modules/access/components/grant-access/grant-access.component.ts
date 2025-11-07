import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { AccessService } from '../../services/access.service';

@Component({
  selector: 'app-grant-access',
  templateUrl: './grant-access.component.html',
  styleUrls: ['./grant-access.component.scss'],
})
export class GrantAccessComponent implements OnInit {
  accessForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  databases: any[] = [];
  groups: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  users: any[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private groupService: GroupService,
    private userService: UserService,
    private databaseService: DatabaseService,
    private acessService: AccessService
  ) {}

  get isFormDirty(): boolean {
    return this.accessForm?.dirty ?? false;
  }

  ngOnInit() {
    this.initForm();
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.loadDatabases();
    }
  }

  // Custom validator to check if at least one of groups or users has values
  atLeastOneRequired = (control: AbstractControl): ValidationErrors | null => {
    if (!control) {
      return { atLeastOneRequired: true };
    }

    const groupsControl = control.get('groups');
    const usersControl = control.get('users');

    const groups = groupsControl?.value ?? [];
    const users = usersControl?.value ?? [];

    const hasGroups = Array.isArray(groups) && groups.length > 0;
    const hasUsers = Array.isArray(users) && users.length > 0;

    return hasGroups || hasUsers ? null : { atLeastOneRequired: true };
  };

  initForm() {
    const isSuperAdmin =
      this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
    const organisationId = this.globalService.getTokenDetails('organisationId');

    this.accessForm = this.fb.group(
      {
        organisation: [
          isSuperAdmin ? null : organisationId,
          Validators.required,
        ],
        database: [null, Validators.required],
        users: [[]],
        groups: [[]],
      },
      { validators: this.atLeastOneRequired }
    );

    // Subscribe to organisation changes
    this.accessForm.get('organisation')?.valueChanges.subscribe(value => {
      if (value) {
        this.loadDatabases();
        this.accessForm.patchValue(
          {
            groups: [],
            users: [],
          },
          { emitEvent: false }
        );
      } else {
        this.databases = [];
        this.groups = [];
        this.users = [];
      }
    });

    // Trigger validation when groups or users change
    this.accessForm.get('groups')?.valueChanges.subscribe(() => {
      this.accessForm.updateValueAndValidity({ emitEvent: false });
    });

    this.accessForm.get('users')?.valueChanges.subscribe(() => {
      this.accessForm.updateValueAndValidity({ emitEvent: false });
    });
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService
      .listOrganisation(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = response.data.orgs || [];
        } else {
          this.organisations = [];
        }
      })
      .catch(error => {
        this.organisations = [];
      });
  }

  loadUsers() {
    const orgId = this.accessForm.get('organisation')?.value;
    if (!orgId) return;

    const params = {
      orgId,
      pageNumber: 1,
      limit: 100,
    };

    this.userService
      .listUser(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.users = [...(response.data.users || [])];
        } else {
          this.users = [];
        }
      })
      .catch(error => {
        this.users = [];
      });
  }

  loadDatabases() {
    const orgId = this.accessForm.get('organisation')?.value;
    if (!orgId) return;

    const params = {
      orgId,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService
      .listDatabase(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.databases = [...(response.data || [])];
        } else {
          this.databases = [];
        }
      })
      .catch(error => {
        this.databases = [];
      });
  }

  onSubmit() {
    if (this.accessForm.valid) {
      this.acessService.grantAccess(this.accessForm.value).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.onCancel();
        }
      });
    }
  }

  onCancel() {
    if (!this.accessForm) return;

    this.accessForm.reset();
    Object.keys(this.accessForm.controls).forEach(key => {
      const control = this.accessForm.get(key);
      if (control) {
        if (key === 'users' || key === 'groups') {
          control.setValue([]);
        } else {
          control.setValue(null);
        }
      }
    });
  }

  onDatabaseChange() {
    const orgId = this.accessForm.get('organisation')?.value;
    const databaseId = this.accessForm.get('database')?.value;

    if (!orgId || !databaseId) return;

    const params = {
      orgId,
      databaseId,
    };

    this.acessService
      .listAccessDetails(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          // Set available options for dropdowns
          this.users = [...(response.data.users || [])];
          this.groups = [...(response.data.groups || [])];

          // Extract existing access details
          const accessDetails = [...(response.data.existingConfig || [])];

          // Extract existing user IDs (where userId exists and groupId is null)
          const existingUserIds = accessDetails
            .filter((item: any) => item.userId && item.groupId === null)
            .map((item: any) => item.userId);

          // Extract existing group IDs (where groupId exists and userId is null)
          const existingGroupIds = accessDetails
            .filter((item: any) => item.groupId && item.userId === null)
            .map((item: any) => item.groupId);

          // Patch the form with existing values
          this.accessForm.patchValue(
            {
              users: existingUserIds,
              groups: existingGroupIds,
            },
            { emitEvent: false }
          );
        }
      })
      .catch(error => {
        this.users = [];
        this.groups = [];
      });
  }
}
