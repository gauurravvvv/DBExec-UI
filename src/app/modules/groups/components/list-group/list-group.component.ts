import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';

import { GROUP } from 'src/app/constants/routes';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-list-group',
  templateUrl: './list-group.component.html',
  styleUrls: ['./list-group.component.scss'],
})
export class ListGroupComponent implements OnInit {
  groups: any[] = [];
  filteredGroups: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  groupToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  selectedOrg: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  statusFilterItems: MenuItem[] = [
    {
      label: 'All',
      command: () => this.filterByStatus(null),
    },
    {
      label: 'Active',
      command: () => this.filterByStatus(1),
    },
    {
      label: 'Inactive',
      command: () => this.filterByStatus(0),
    },
  ];

  constructor(
    private groupService: GroupService,
    private organisationService: OrganisationService,
    private router: Router,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadGroups();
    }
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadGroups();
        }
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  onOrgChange(event: any) {
    this.selectedOrg = event.value;
    this.currentPage = 1;
    this.loadGroups();
  }

  loadGroups() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.groupService.listGroupps(params).subscribe({
      next: (response: any) => {
        this.groups = response.data.groups;
        this.filteredGroups = [...this.groups];
        this.totalItems = response.data.total || this.groups.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
      },
      error: error => {
        this.groups = [];
        this.filteredGroups = [];
        this.totalItems = 0;
        this.totalPages = 0;
        this.pages = [];
        console.error('Error loading groups:', error);
      },
    });
  }

  generatePageNumbers() {
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.loadGroups();
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value;
    this.applyFilters();
  }

  filterByStatus(status: number | null) {
    this.selectedStatus = status;
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.groups];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(group =>
        group.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(group => group.status === this.selectedStatus);
    }

    this.filteredGroups = filtered;
  }

  onAddNewCategory() {
    this.router.navigate([GROUP.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([GROUP.EDIT, this.selectedOrg.id, id]);
  }

  confirmDelete(id: string) {
    this.groupToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
  }

  proceedDelete() {
    if (this.groupToDelete) {
      this.groupService
        .deleteGroup(this.selectedOrg.id, this.groupToDelete)
        .subscribe({
          next: () => {
            this.loadGroups();
            this.showDeleteConfirm = false;
            this.groupToDelete = null;
          },
          error: error => {
            console.error('Error deleting group:', error);
            this.showDeleteConfirm = false;
            this.groupToDelete = null;
          },
        });
    }
  }
}
