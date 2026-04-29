import { animate, style, transition, trigger } from '@angular/animations';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { GlobalService } from 'src/app/core/services/global.service';
import { HomeService } from '../../services/home.service';

@Component({
  selector: 'app-system-admin-home',
  templateUrl: './system-admin-home.component.html',
  styleUrls: ['./system-admin-home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate(
          '0.4s ease-out',
          style({ transform: 'translateY(0)', opacity: 1 }),
        ),
      ]),
    ]),
  ],
})
export class SystemAdminHomeComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  organizations: any[] = [];

  entitiesData = {
    totalDatasources: 0,
    totalUsers: 0,
    totalAdmins: 0,
    totalEnvironment: 0,
    maxDatasources: 0,
    maxUsers: 0,
    maxAdmins: 0,
    maxEnvironment: 0,
  };

  activeUsers24hrs = 0;
  activeUsers3days = 0;
  activeUsers7days = 0;
  activeUsers15days = 0;
  activeUsers30days = 0;

  stats = [
    { title: 'Active Users (Last 24 hrs)', value: this.activeUsers24hrs },
    { title: 'Active Users (Last 3 Days)', value: this.activeUsers3days },
    { title: 'Active Users (Last 7 Days)', value: this.activeUsers7days },
    { title: 'Active Users (Last 15 Days)', value: this.activeUsers15days },
    { title: 'Active Users (Last 30 Days)', value: this.activeUsers30days },
  ];

  overviews = [
    {
      title: 'Total Datasources',
      value: this.entitiesData.totalDatasources,
      maxValue: this.entitiesData.maxDatasources,
    },
    {
      title: 'Total Environments',
      value: this.entitiesData.totalEnvironment,
      maxValue: this.entitiesData.maxEnvironment,
    },
    {
      title: 'Total Admins',
      value: this.entitiesData.totalAdmins,
      maxValue: this.entitiesData.maxAdmins,
    },
    {
      title: 'Total Users',
      value: this.entitiesData.totalUsers,
      maxValue: this.entitiesData.maxUsers,
    },
  ];

  constructor(
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private homeService: HomeService,
  ) {}

  ngOnInit(): void {
    this.updateStats();
  }

  onOrganizationChange(event: any) {
    this.loadOrganizationData(event?.target.value);
  }

  loadOrganizationData(orgId: string) {
    this.homeService
      .getSystemAdminDashboard(orgId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res: any) => {
          if (res) {
            this.entitiesData.maxAdmins = res.data.maxAdmins;
            this.entitiesData.maxDatasources = res.data.maxDatasources;
            this.entitiesData.maxEnvironment = res.data.maxEnvironment;
            this.entitiesData.maxUsers = res.data.maxUsers;
            this.entitiesData.totalAdmins = res.data.adminsCount;
            this.entitiesData.totalDatasources = res.data.datasourcesCount;
            this.entitiesData.totalEnvironment = res.data.environmentCount;
            this.entitiesData.totalUsers = res.data.usersCount;
            this.updateStats();
            this.cdr.markForCheck();
          }
        },
        error: () => {
          /* handled by interceptor */
        },
      });
    // Simulate fetching data based on organization ID
    // Replace this with actual service calls
    this.activeUsers24hrs = Math.floor(Math.random() * 100);
    this.activeUsers3days = Math.floor(Math.random() * 300);
    this.activeUsers7days = Math.floor(Math.random() * 500);
    this.activeUsers15days = Math.floor(Math.random() * 700);
    this.activeUsers30days = Math.floor(Math.random() * 1000);

    this.updateStats();
  }

  updateStats() {
    this.stats = [
      { title: 'Active Users (Last 24 hrs)', value: this.activeUsers24hrs },
      { title: 'Active Users (Last 3 Days)', value: this.activeUsers3days },
      { title: 'Active Users (Last 7 Days)', value: this.activeUsers7days },
      { title: 'Active Users (Last 15 Days)', value: this.activeUsers15days },
      { title: 'Active Users (Last 30 Days)', value: this.activeUsers30days },
    ];

    this.overviews = [
      {
        title: 'Total Datasources',
        value: this.entitiesData.totalDatasources,
        maxValue: this.entitiesData.maxDatasources,
      },
      {
        title: 'Total Environments',
        value: this.entitiesData.totalEnvironment,
        maxValue: this.entitiesData.maxEnvironment,
      },
      {
        title: 'Total Admins',
        value: this.entitiesData.totalAdmins,
        maxValue: this.entitiesData.maxAdmins,
      },
      {
        title: 'Total Users',
        value: this.entitiesData.totalUsers,
        maxValue: this.entitiesData.maxUsers,
      },
    ];
  }

  trackById(index: number, item: any): any {
    return item.id;
  }

  trackByIndex(index: number): number {
    return index;
  }

  getOverviewIcon(title: string): string {
    const icons: { [key: string]: string } = {
      'Total Datasources': 'fas fa-database',
      'Total Environments': 'fas fa-globe',
      'Total Admins': 'fas fa-user-shield',
      'Total Users': 'fas fa-users',
    };
    return icons[title] || 'fas fa-chart-bar';
  }

  getProgressValue(obj: any) {
    const maxValue = obj.maxValue;
    return (obj.value / maxValue) * 100;
  }

  addNewUser(): void {
    // Implement add user functionality
  }

  manageDatasource(): void {
    // Implement database management functionality
  }

  viewReports(): void {
    // Implement reports viewing functionality
  }

  getProgressPercentage(value: number): number {
    const maxValue = Math.max(...this.stats.map(stat => stat.value));
    return (value / maxValue) * 100;
  }
}
