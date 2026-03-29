import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganisationService } from '../../services/organisation.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION } from 'src/app/constants/routes';
import { AnnouncementData } from '../announcement-dialog/announcement-dialog.component';
import { AnnouncementService } from '../../services/announcement.service';

interface OrganisationConfig {
  maxDatabases: number;
  maxAdmins: number;
  maxUsers: number;
  maxEnvironment: number;
  maxCategories: number;
  maxGroups: number;
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
  databasesCount: number;
  connectionsCount: number;
  dbStatus: 'connected' | 'not_configured' | 'connection_failed';
  masterDbConfig: MasterDbConfig;
}

@Component({
  selector: 'app-view-organisation',
  templateUrl: './view-organisation.component.html',
  styleUrls: ['./view-organisation.component.scss'],
})
export class ViewOrganisationComponent implements OnInit {
  organisationId!: string;
  organisationData!: OrganisationData;
  avatarBackground: string = '#2196F3';
  organisationInitials: string = '';
  showDeleteConfirm: boolean = false;
  deleteJustification = '';
  showAnnouncementDialog: boolean = false;
  isRefreshingMasterDb: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private organisationService: OrganisationService,
    private announcementService: AnnouncementService,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
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
        .deleteOrganisation(this.organisationId, this.deleteJustification.trim())
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
      })
      .catch(() => {
        this.isRefreshingMasterDb = false;
      });
  }

  onAnnouncementSave(data: AnnouncementData) {
    this.announcementService
      .addAnnouncement({
        organisation: this.organisationId,
        ...data,
      })
      .then(response => {
        this.globalService.handleSuccessService(response);
      });
  }
}
