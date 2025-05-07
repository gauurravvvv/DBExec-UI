import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganisationService } from '../../services/organisation.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION } from 'src/app/constants/routes';

interface OrganisationConfig {
  maxDatabases: number;
  maxAdmins: number;
  maxUsers: number;
  maxEnvironment: number;
  maxCategories: number;
  maxGroups: number;
}

interface OrganisationData {
  id: string;
  name: string;
  status: number;
  createdOn: Date;
  config: OrganisationConfig;
}

@Component({
  selector: 'app-view-organisation',
  templateUrl: './view-organisation.component.html',
  styleUrls: ['./view-organisation.component.scss'],
})
export class ViewOrganisationComponent implements OnInit {
  organisationId!: number;
  organisationData!: OrganisationData;
  avatarBackground: string = '#2196F3';
  organisationInitials: string = '';
  showDeleteConfirm: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.organisationId = params['id'];
      this.loadOrganisationData();
    });
  }

  loadOrganisationData() {
    this.organisationService
      .viewOrganisation(this.organisationId.toString())
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

  confirmDelete(id: number) {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
  }

  proceedDelete() {
    this.organisationService
      .deleteOrganisation(this.organisationId.toString())
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([ORGANISATION.LIST]);
        }
      });
  }
}
