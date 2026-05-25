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
import { TranslateService } from '@ngx-translate/core';
import { Table } from 'primeng/table';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { ANNOUNCEMENT } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
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

  groups: any[] = [];
  // Server-mode preload for the Group filter dropdown.
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;
  today = new Date();

  showDeleteConfirm = false;
  toDeleteId: string | null = null;
  deleteJustification = '';

  statusOptions: any[] = [];

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
    private groupService: GroupService,
    private globalService: GlobalService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.filter$
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadAnnouncements());

    this.loadGroups();
    this.loadAnnouncements();
  }

  /**
   * Server-mode fetcher for the Group filter dropdown.
   */
  loadGroupsPage = async ({
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
      const res: any = await this.groupService.listGroups(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.groups ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadGroups(): void {
    this.groupService
      .listGroups({
        page: DEFAULT_PAGE,
        limit: 10,
      })
      .then(res => {
        if (this.globalService.handleSuccessService(res, false)) {
          const groups = res?.data?.groups ?? [];
          this.groups = groups;
          this.preloadedGroups = groups;
          this.preloadedGroupsTotal = res?.data?.count ?? groups.length;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
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
    if (event) this.lastTableLazyLoadEvent = event;

    const page = event ? Math.floor(event.first / event.rows) + 1 : 1;
    const limit = event ? event.rows : this.limit;

    const params: any = {
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
    this.router.navigate([ANNOUNCEMENT.view(id)]);
  }

  onEdit(id: string): void {
    this.router.navigate([ANNOUNCEMENT.edit(id)]);
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
      .delete(this.toDeleteId)
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

  refreshList(): void {
    if (this.lastTableLazyLoadEvent) {
      this.loadAnnouncements(this.lastTableLazyLoadEvent);
    } else {
      this.loadAnnouncements();
    }
  }
}
