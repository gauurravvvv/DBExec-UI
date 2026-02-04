import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { SuperAdminService } from '../../services/superAdmin.service';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { IParams } from 'src/app/core/interfaces/global.interface';
import { GlobalService } from 'src/app/core/services/global.service';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-list-super-admin',
  templateUrl: './list-super-admin.component.html',
  styleUrls: ['./list-super-admin.component.scss'],
})
export class ListSuperAdminComponent implements OnInit {
  Math = Math;
  loggedInUserId: any;

  // Params to fetch all for client-side handling
  listParams: IParams = {
    limit: 1000,
    pageNumber: 1,
  };

  superAdmins: any[] = [];
  totalItems = 0;

  showDeleteConfirm = false;
  adminIdToDelete: number | null = null;

  constructor(
    private superAdminService: SuperAdminService,
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.loggedInUserId = this.globalService.getTokenDetails('userId');
    this.listSuperAdminAPI();
  }

  onEdit(adminId: string): void {
    this.router.navigate([SUPER_ADMIN.EDIT + '/' + adminId]);
  }

  confirmDelete(adminId: number) {
    this.adminIdToDelete = adminId;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminIdToDelete = null;
  }

  proceedDelete() {
    if (this.adminIdToDelete) {
      this.onDelete(this.adminIdToDelete);
      this.showDeleteConfirm = false;
      this.adminIdToDelete = null;
    }
  }

  onDelete(adminId: number) {
    this.superAdminService.deleteSuperAdmin(adminId).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        this.listSuperAdminAPI();
      }
    });
  }

  onAddNewAdmin(): void {
    this.router.navigate([SUPER_ADMIN.ADD]);
  }

  listSuperAdminAPI() {
    this.superAdminService.listSuperAdmin(this.listParams).then((res: any) => {
      if (this.globalService.handleSuccessService(res, false)) {
        this.superAdmins = [...res.data.superAdmins];
        this.totalItems = this.superAdmins.length;
      }
    });
  }
}
