import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ORGANISATION } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { OrganisationService } from '../../services/organisation.service';
import { MenuItem } from 'primeng/api';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-list-organisation',
  templateUrl: './list-organisation.component.html',
  styleUrls: ['./list-organisation.component.scss'],
})
export class ListOrganisationComponent implements OnInit {
  Math = Math;

  // Params to fetch all for client-side handling
  listParams: IParams = {
    limit: 1000,
    pageNumber: 1,
  };

  organisations: any[] = [];
  totalItems = 0;

  showDeleteConfirm = false;
  orgIdToDelete: number | null = null;

  constructor(
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.listOrganisationAPI();
  }

  listOrganisationAPI() {
    this.organisationService
      .listOrganisation(this.listParams)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.organisations = [...res.data.orgs];
          this.totalItems = this.organisations.length;
        }
      });
  }

  onAddNewOrganisation() {
    this.router.navigate([ORGANISATION.ADD]);
  }

  onEdit(org: any) {
    this.router.navigate([ORGANISATION.EDIT + '/' + org.id]);
  }

  confirmDelete(orgId: number) {
    this.orgIdToDelete = orgId;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.orgIdToDelete = null;
  }

  proceedDelete() {
    if (this.orgIdToDelete) {
      this.onDelete(this.orgIdToDelete);
      this.showDeleteConfirm = false;
      this.orgIdToDelete = null;
    }
  }

  onDelete(orgId: number) {
    this.organisationService
      .deleteOrganisation(orgId.toString())
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.listOrganisationAPI();
        }
      });
  }
}
