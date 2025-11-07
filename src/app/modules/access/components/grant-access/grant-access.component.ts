import { Component, OnInit } from '@angular/core';

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
    private organisationService: OrganisationService,
    private globalService: GlobalService,
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

    // Subscribe to organisation changes (only for SUPER_ADMIN)
    if (isSuperAdmin) {
      this.accessForm.get('organisation')?.valueChanges.subscribe(value => {
        if (value) {
          // Clear database, groups, and users when organisation changes
          this.accessForm.patchValue(
            {
              database: null,
              groups: [],
              users: [],
            },
            { emitEvent: false }
          );
          // Load databases for new organisation
          this.loadDatabases();
          // Clear groups and users arrays
          this.groups = [];
          this.users = [];
        } else {
          // If organisation is cleared, clear everything
          this.databases = [];
          this.groups = [];
          this.users = [];
          this.accessForm.patchValue(
            {
              database: null,
              groups: [],
              users: [],
            },
            { emitEvent: false }
          );
        }
      });
    }

    // Subscribe to database changes (for both roles)
    this.accessForm.get('database')?.valueChanges.subscribe(value => {
      if (value) {
        // Load access details when database is selected
        this.onDatabaseChange();
      } else {
        // Clear groups and users when database is cleared
        this.groups = [];
        this.users = [];
        this.accessForm.patchValue(
          {
            groups: [],
            users: [],
          },
          { emitEvent: false }
        );
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
      this.acessService
        .grantAccess(this.accessForm.value)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            // Clear form after successful submission
            this.onCancel();
          }
        })
        .catch(error => {
          console.error('Error granting access:', error);
        });
    }
  }

  onCancel() {
    if (!this.accessForm) return;

    const role = this.globalService.getTokenDetails('role');
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const isOrgAdmin = role === ROLES.ORG_ADMIN;
    const organisationId = this.globalService.getTokenDetails('organisationId');

    // Reset the form
    this.accessForm.reset();

    if (isSuperAdmin) {
      // For SUPER_ADMIN: Keep organisations list, clear everything else
      this.accessForm.patchValue(
        {
          organisation: null,
          database: null,
          users: [],
          groups: [],
        },
        { emitEvent: false }
      );

      // Clear databases, groups, and users arrays
      this.databases = [];
      this.groups = [];
      this.users = [];
      // Keep organisations array intact (don't clear it)
    } else if (isOrgAdmin) {
      // For ORG_ADMIN: Set organisation from token, keep databases list, clear rest
      this.accessForm.patchValue(
        {
          organisation: organisationId,
          database: null,
          users: [],
          groups: [],
        },
        { emitEvent: false }
      );

      // Clear only groups and users arrays
      this.groups = [];
      this.users = [];
      // Keep databases array intact (don't clear it)
    }

    // Mark form as pristine and untouched
    this.accessForm.markAsPristine();
    this.accessForm.markAsUntouched();
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
        } else {
          // Clear data on unsuccessful response
          this.users = [];
          this.groups = [];
          this.accessForm.patchValue(
            {
              users: [],
              groups: [],
            },
            { emitEvent: false }
          );
        }
      })
      .catch(error => {
        // Clear all data on error
        this.users = [];
        this.groups = [];
        this.accessForm.patchValue(
          {
            users: [],
            groups: [],
          },
          { emitEvent: false }
        );
      });
  }
}
