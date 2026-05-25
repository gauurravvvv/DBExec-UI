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
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { GlobalService } from 'src/app/core/services/global.service';
import { ConnectionService } from 'src/app/modules/connections/services/connection.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
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
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  connections: any[] = [];
  preloadedConnections: any[] | null = null;
  preloadedConnectionsTotal: number | null = null;
  groups: any[] = [];
  users: any[] = [];

  constructor(
    private fb: FormBuilder,
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
    this.loadDatasources();
  }

  initForm() {
    this.accessForm = this.fb.group({
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

  loadConnections() {
    const datasourceId = this.accessForm.get('datasource')?.value;
    if (!datasourceId) return;
    // Connection dropdown is datasource-scoped — clear preload so it re-fetches
    // under the newly selected scope on next open.
    this.preloadedConnections = null;
    this.preloadedConnectionsTotal = null;
    const params = {
      datasourceId,
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.connectionService
      .listConnection(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.connections ?? [];
          this.connections = items;
          this.preloadedConnections = items;
          this.preloadedConnectionsTotal =
            response?.data?.count ?? items.length;
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

  /**
   * Fetcher for the server-mode connection dropdown. Connections are
   * datasource-scoped, so gated on org + datasource.
   */
  loadConnectionsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const datasourceId = this.accessForm.get('datasource')?.value;
    if (!datasourceId) return { items: [], total: 0 };
    const params: any = { datasourceId, page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.connectionService.listConnection(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.connections ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadDatasources() {
    // Clear preload so the server-mode dropdown re-fetches for the new org
    this.preloadedDatasources = null;
    this.preloadedDatasourcesTotal = null;

    const params = {
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.datasourceService
      .listDatasource(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal =
            response?.data?.count ?? items.length;
          this.datasources = [...items];
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

  /**
   * Fetcher for the server-mode datasource dropdown.
   */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

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
        console.error(
          this.translate.instant('ACCESS.ERROR_GRANTING_ACCESS'),
          error,
        );
      }
    }
  }

  onCancel() {
    if (!this.accessForm) return;

    // Reset the form
    this.accessForm.reset();

    this.accessForm.patchValue(
      {
        datasource: null,
        connection: null,
        users: [],
        groups: [],
      },
      { emitEvent: false },
    );

    // Clear datasources, connections, groups, and users arrays
    this.datasources = [];
    this.preloadedDatasources = null;
    this.preloadedDatasourcesTotal = null;
    this.connections = [];
    this.preloadedConnections = null;
    this.preloadedConnectionsTotal = null;
    this.groups = [];
    this.users = [];

    // Mark form as pristine and untouched
    this.accessForm.markAsPristine();
    this.accessForm.markAsUntouched();
  }

  async onConnectionChange() {
    const connectionId = this.accessForm.get('connection')?.value;
    if (!connectionId) return;

    try {
      const response = await this.acessService.loadAccessDetails(
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
