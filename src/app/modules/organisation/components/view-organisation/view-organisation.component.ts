import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganisationService } from '../../services/organisation.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION } from 'src/app/constants/routes';

interface OrganisationConfig {
  maxDatasources: number;
  maxAdmins: number;
  maxUsers: number;
  maxEnvironment: number;
  maxCategories: number;
  maxGroups: number;
}

interface OrgConfig {
  encryptionAlgorithm: string;
  maxLoginAttempts: number;
  accountLockDurationHours: number;
  passwordHistoryLimit: number;
  sessionInactivityTimeout: number;
  emailProvider: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  sesRegion: string | null;
  sesAccessKeyId: string | null;
  sesFrom: string | null;
}

interface MasterDbConfig {
  hostname: string;
  port: number;
  dbName: string;
  username: string;
  dbType: string;
}

interface OrganisationData {
  id: string;
  name: string;
  status: number;
  createdOn: Date;
  config: OrganisationConfig;
  usersCount: number;
  adminsCount: number;
  groupsCount: number;
  datasourcesCount: number;
  connectionsCount: number;
  dbStatus: 'connected' | 'not_configured' | 'connection_failed';
  masterDbConfig: MasterDbConfig;
  orgConfig: OrgConfig;
  encryptionAlgorithm: string;
}

@Component({
  selector: 'app-view-organisation',
  templateUrl: './view-organisation.component.html',
  styleUrls: ['./view-organisation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewOrganisationComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  organisationId!: string;
  organisationData!: OrganisationData;
  avatarBackground: string = '#2196F3';
  organisationInitials: string = '';
  showDeleteConfirm: boolean = false;
  deleteJustification = '';
  isRefreshingMasterDb: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.organisationId = params['id'];
      this.loadOrganisationData();
    });
  }

  loadOrganisationData() {
    this.organisationService
      .viewOrganisation(this.organisationId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisationData = response.data;
          this.setOrganisationInitials();
          this.cdr.markForCheck();
        }
      });
  }

  setOrganisationInitials() {
    if (this.organisationData?.name) {
      const words = this.organisationData.name.split(' ');
      this.organisationInitials = words
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
    }
  }

  confirmDelete(id: string) {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (this.deleteJustification.trim()) {
      this.organisationService
        .deleteOrganisation(
          this.organisationId,
          this.deleteJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.deleteJustification = '';
            this.router.navigate([ORGANISATION.LIST]);
          }
        });
    }
  }

  refreshMasterDb() {
    this.isRefreshingMasterDb = true;
    this.organisationService
      .refreshMasterDb(this.organisationId)
      .then(response => {
        this.globalService.handleSuccessService(response);
        this.isRefreshingMasterDb = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isRefreshingMasterDb = false;
        this.cdr.markForCheck();
      });
  }
}
