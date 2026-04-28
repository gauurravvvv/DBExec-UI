import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ConnectionService } from 'src/app/modules/connection/services/connection.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TranslateService } from '@ngx-translate/core';
import { AccessService } from '../../services/access.service';

@Component({
  selector: 'app-grant-access',
  templateUrl: './grant-access.component.html',
  styleUrls: ['./grant-access.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrantAccessComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  saving = this.acessService.saving;
  loading = this.acessService.loading;

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
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
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
    this.accessForm
      .get('groups')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.accessForm.updateValueAndValidity({ emitEvent: false });
      });

    this.accessForm
      .get('users')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
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
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.organisations = [];
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.connections = [];
        this.cdr.markForCheck();
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
          this.datasources = [...(response.data.datasources || [])];
        } else {
          this.datasources = [];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.datasources = [];
        this.cdr.markForCheck();
      });
  }

  async onSubmit() {
    if (this.accessForm.valid) {
      try {
        const response = await this.acessService.grantAccess(
          this.accessForm.value,
        );
        if (this.globalService.handleSuccessService(response)) {
          this.onCancel();
        }
      } catch (error) {
        console.error(this.translate.instant('ACCESS.ERROR_GRANTING_ACCESS'), error);
      }
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
      // For ORG_ADMIN: Set organisation from token, clear datasources and connections
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

      // Clear datasources, connections, groups, and users arrays
      this.datasources = [];
      this.connections = [];
      this.groups = [];
      this.users = [];
    }

    // Mark form as pristine and untouched
    this.accessForm.markAsPristine();
    this.accessForm.markAsUntouched();
  }

  async onConnectionChange() {
    const orgId = this.accessForm.get('organisation')?.value;
    const connectionId = this.accessForm.get('connection')?.value;
    if (!orgId || !connectionId) return;

    try {
      const response = await this.acessService.loadAccessDetails(
        orgId,
        connectionId,
      );
      if (this.globalService.handleSuccessService(response, false)) {
        const data = response.data;
        this.users = [...(data.users || [])];
        this.groups = [...(data.groups || [])];
        const accessDetails = [...(data.existingConfig || [])];
        const existingUserIds = accessDetails
          .filter((item: any) => item.userId && item.groupId === null)
          .map((item: any) => item.userId);
        const existingGroupIds = accessDetails
          .filter((item: any) => item.groupId && item.userId === null)
          .map((item: any) => item.groupId);
        this.accessForm.patchValue(
          { users: existingUserIds, groups: existingGroupIds },
          { emitEvent: false },
        );
      } else {
        this.users = [];
        this.groups = [];
        this.accessForm.patchValue(
          { users: [], groups: [] },
          { emitEvent: false },
        );
      }
      this.cdr.markForCheck();
    } catch (error) {
      this.users = [];
      this.groups = [];
      this.accessForm.patchValue(
        { users: [], groups: [] },
        { emitEvent: false },
      );
      this.cdr.markForCheck();
    }
  }
}
