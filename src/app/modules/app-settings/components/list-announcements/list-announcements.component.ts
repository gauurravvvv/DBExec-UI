import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { ANNOUNCEMENT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { AnnouncementService } from '../../services/announcement.service';

@Component({
  selector: 'app-list-announcements',
  templateUrl: './list-announcements.component.html',
  styleUrls: ['./list-announcements.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListAnnouncementsComponent implements OnInit {
  @ViewChild('dt') dt!: Table;

  limit = 10;
  lastTableLazyLoadEvent: any;

  announcements = this.announcementService.announcements;
  totalRecordsSignal = this.announcementService.total;
  loading = this.announcementService.loading;
  saving = this.announcementService.saving;

  organisations: any[] = [];
  groups: any[] = [];
  selectedOrg: any = null;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
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

  private destroyRef = inject(DestroyRef);
  private filter$ = new Subject<void>();

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
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAnnouncements());

    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = this.globalService.getTokenDetails('organisationId');
      this.loadGroups();
      this.loadAnnouncements();
    }
  }

  loadOrganisations(): void {
    const params = { page: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.organisationService
      .listOrganisation(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = [...response.data.orgs];
          if (this.organisations.length > 0) {
            this.selectedOrg = this.organisations[0].id;
            this.loadGroups();
            this.loadAnnouncements();
          } else {
            this.selectedOrg = null;
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
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
      .load(params)
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
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
      .catch(() => {})
      .finally(() => {
        this.cancelDelete();
        this.cdr.markForCheck();
      });
  }

  private refreshList(): void {
    if (this.lastTableLazyLoadEvent) {
      this.loadAnnouncements(this.lastTableLazyLoadEvent);
    } else {
      this.loadAnnouncements();
    }
  }
}
