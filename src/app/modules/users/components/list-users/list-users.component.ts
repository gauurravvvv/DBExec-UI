import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-list-users',
  templateUrl: './list-users.component.html',
  styleUrls: ['./list-users.component.scss'],
})
export class ListUsersComponent implements OnInit {
  users: any[] = [];
  filteredUsers: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  userToDelete: string | null = null;
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
    private userService: UserService,
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
      this.loadUsers();
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
          this.loadUsers();
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
    this.loadUsers();
  }

  loadUsers() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: this.currentPage,
      limit: this.pageSize,
    };

    this.userService.listUser(params).subscribe({
      next: (response: any) => {
        this.users = response.data.users;
        this.filteredUsers = [...this.users];
        this.totalItems = this.users.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
      },
      error: error => {
        console.error('Error loading users:', error);
      },
    });
  }

  generatePageNumbers() {
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.loadUsers();
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
    let filtered = [...this.users];

    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        user =>
          user.firstName.toLowerCase().includes(search) ||
          user.lastName.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(user => user.status === this.selectedStatus);
    }

    this.filteredUsers = filtered;
  }

  onAddNewAdmin() {
    this.router.navigate([USER.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([USER.EDIT, id]);
  }

  confirmDelete(id: string) {
    this.userToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.userToDelete = null;
  }

  proceedDelete() {
    if (this.userToDelete) {
      this.userService.deleteUser(this.userToDelete).subscribe({
        next: () => {
          this.loadUsers();
          this.showDeleteConfirm = false;
          this.userToDelete = null;
        },
        error: error => {
          console.error('Error deleting organisation user:', error);
          this.showDeleteConfirm = false;
          this.userToDelete = null;
        },
      });
    }
  }
}
