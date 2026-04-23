import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ANNOUNCEMENT } from 'src/app/constants/routes';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { AnnouncementService } from '../../services/announcement.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-list-announcements',
  templateUrl: './list-announcements.component.html',
  styleUrls: ['./list-announcements.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListAnnouncementsComponent implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  limit = 10;
  totalRecords = 0;
  lastTableLazyLoadEvent: any;

  announcements: any[] = [];
  filteredAnnouncements: any[] = [];

  organisations: any[] = [];
  groups: any[] = [];
  selectedOrg: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  today = new Date();

  showDeleteConfirm = false;
  toDeleteId: string | null = null;
  deleteJustification = '';

  statusOptions = [
    { label: 'Active', value: 1 },
    { label: 'Inactive', value: 0 },
  ];

  filterValues: any = {
    name: '',
    description: '',
    targetGroupId: null,
    status: null,
    createdDateRange: null,
  };

  private filter$ = new Subject<void>();
  private filterSubscription!: Subscription;

  get isFilterActive(): boolean {
    return (
      !!this.filterValues.name ||
      !!this.filterValues.description ||
      !!this.filterValues.targetGroupId ||
      this.filterValues.status !== null ||
      !!this.filterValues.createdDateRange
    );
  }

  constructor(
    private announcementService: AnnouncementService,
    private organisationService: OrganisationService,
    private groupService: GroupService,
    private globalService: GlobalService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.filterSubscription = this.filter$
      .pipe(debounceTime(400))
      .subscribe(() => this.loadAnnouncements());

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadGroups();
      this.loadAnnouncements();
    }
  }

  ngOnDestroy(): void {
    if (this.filterSubscription) this.filterSubscription.unsubscribe();
  }

  loadOrganisations(): void {
    const params = { page: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0].id;
          this.loadGroups();
          this.loadAnnouncements();
        } else {
          this.selectedOrg = null;
          this.announcements = [];
          this.filteredAnnouncements = [];
          this.totalRecords = 0;
        }
      }
    });
  }

  loadGroups(): void {
    if (!this.selectedOrg) return;
    this.groupService
      .listGroups({
        orgId: this.selectedOrg,
        page: DEFAULT_PAGE,
        limit: MAX_LIMIT,
      })
      .then(res => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.groups = res.data.groups || [];
        }
      });
  }

  onOrgChange(orgId: any): void {
    this.selectedOrg = orgId;
    this.filterValues.targetGroupId = null;
    this.groups = [];
    this.loadGroups();
    this.loadAnnouncements();
  }

  onFilterChange(): void {
    this.filter$.next();
  }

  clearFilters(): void {
    this.filterValues = {
      name: '',
      description: '',
      targetGroupId: null,
      status: null,
      createdDateRange: null,
    };
    this.loadAnnouncements();
  }

  onCreatedDateRangeChange(range: Date[] | null): void {
    this.filterValues.createdDateRange = range;
    if (!range || (range[0] && range[1])) this.onFilterChange();
  }

  loadAnnouncements(event?: any): void {
    if (!this.selectedOrg) return;

    if (event) this.lastTableLazyLoadEvent = event;

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
      orgId: this.selectedOrg,
      page,
      limit,
    };

    const filter: any = {};
    if (this.filterValues.name) filter.name = this.filterValues.name;
    if (this.filterValues.description)
      filter.description = this.filterValues.description;
    if (this.filterValues.targetGroupId)
      params.targetGroupId = this.filterValues.targetGroupId;
    if (
      this.filterValues.status !== null &&
      this.filterValues.status !== undefined
    ) {
      filter.status = this.filterValues.status;
    }
    if (this.filterValues.createdDateRange?.[0]) {
      filter.createdDateFrom =
        this.filterValues.createdDateRange[0].toISOString();
    }
    if (this.filterValues.createdDateRange?.[1]) {
      const dateTo = new Date(this.filterValues.createdDateRange[1]);
      dateTo.setHours(23, 59, 59, 999);
      filter.createdDateTo = dateTo.toISOString();
    }

    if (Object.keys(filter).length > 0) params.filter = JSON.stringify(filter);

    this.announcementService
      .list(params)
      .then(res => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.announcements = res.data.announcements || [];
          this.filteredAnnouncements = [...this.announcements];
          this.totalRecords = res.data.count || 0;
        } else {
          this.announcements = [];
          this.filteredAnnouncements = [];
          this.totalRecords = 0;
        }
      })
      .catch(() => {
        this.announcements = [];
        this.filteredAnnouncements = [];
        this.totalRecords = 0;
      });
  }

  isActive(a: any): boolean {
    if (a.status !== 1) return false;
    const now = new Date();
    if (a.startTime && new Date(a.startTime) > now) return false;
    if (a.endTime && new Date(a.endTime) < now) return false;
    return true;
  }

  onAdd(): void {
    this.router.navigate([ANNOUNCEMENT.ADD]);
  }

  onView(id: string): void {
    this.router.navigate([ANNOUNCEMENT.VIEW, this.selectedOrg, id]);
  }

  onEdit(id: string): void {
    this.router.navigate([ANNOUNCEMENT.EDIT, this.selectedOrg, id]);
  }

  confirmDelete(id: string): void {
    this.toDeleteId = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.toDeleteId = null;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    if (!this.toDeleteId) return;
    this.announcementService
      .delete(this.toDeleteId, this.selectedOrg)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.refreshList();
        }
      })
      .finally(() => this.cancelDelete());
  }

  private refreshList(): void {
    if (this.lastTableLazyLoadEvent) {
      this.loadAnnouncements(this.lastTableLazyLoadEvent);
    } else {
      this.loadAnnouncements();
    }
  }
}
