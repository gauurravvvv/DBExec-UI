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
import { ConnectionService } from 'src/app/modules/connection/services/connection.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { AccessService } from '../../services/access.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-grant-access',
  templateUrl: './grant-access.component.html',
  styleUrls: ['./grant-access.component.scss'],
})
export class GrantAccessComponent implements OnInit {
  accessForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  datasources: any[] = [];
  connections: any[] = [];
  groups: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  users: any[] = [];

  constructor(
    private fb: FormBuilder,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private acessService: AccessService,
    private connectionService: ConnectionService,
  ) {}

  get isFormDirty(): boolean {
    return this.accessForm?.dirty ?? false;
  }

  ngOnInit() {
    this.initForm();
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.loadDatasources();
    }
  }

  initForm() {
    const isSuperAdmin =
      this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
    const organisationId = this.globalService.getTokenDetails('organisationId');

    this.accessForm = this.fb.group({
      organisation: [isSuperAdmin ? null : organisationId, Validators.required],
      datasource: [null, Validators.required],
      connection: [null, Validators.required],
      users: [[]],
      groups: [[]],
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
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
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

  loadConnections() {
    const orgId = this.accessForm.get('organisation')?.value;
    const datasourceId = this.accessForm.get('datasource')?.value;
    if (!orgId || !datasourceId) return;
    const params = {
      orgId,
      datasourceId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.connectionService
      .listConnection(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.connections = [...(response.data.connections || [])];
        } else {
          this.connections = [];
        }
      })
      .catch(error => {
        this.connections = [];
      });
  }

  loadDatasources() {
    const orgId = this.accessForm.get('organisation')?.value;
    if (!orgId) return;

    const params = {
      orgId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasourceService
      .listDatasource(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasources = [...(response.data.databases || [])];
        } else {
          this.datasources = [];
        }
      })
      .catch(error => {
        this.datasources = [];
      });
  }

  onSubmit() {
    if (this.accessForm.valid) {
      this.acessService
        .grantAccess(this.accessForm.value)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
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
          datasource: null,
          connection: null,
          users: [],
          groups: [],
        },
        { emitEvent: false },
      );

      // Clear datasources, groups, and users arrays
      this.datasources = [];
      this.connections = [];
      this.groups = [];
      this.users = [];
      // Keep organisations array intact (don't clear it)
    } else if (isOrgAdmin) {
      // For ORG_ADMIN: Set organisation from token, keep datasources list, clear rest
      this.accessForm.patchValue(
        {
          organisation: organisationId,
          datasource: null,
          connection: null,
          users: [],
          groups: [],
        },
        { emitEvent: false },
      );

      // Clear only groups and users arrays
      this.datasources = [];
      this.connections = [];
      this.groups = [];
      this.users = [];
      // Keep datasources array intact (don't clear it)
    }

    // Mark form as pristine and untouched
    this.accessForm.markAsPristine();
    this.accessForm.markAsUntouched();
  }

  onConnectionChange() {
    const orgId = this.accessForm.get('organisation')?.value;
    const connectionId = this.accessForm.get('connection')?.value;

    if (!orgId || !connectionId) return;

    const params = {
      orgId,
      connectionId,
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
            { emitEvent: false },
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
            { emitEvent: false },
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
          { emitEvent: false },
        );
      });
  }
}
