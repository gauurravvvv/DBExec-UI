import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { GlobalService } from 'src/app/core/services/global.service';
// import { OrganisationService } from '../../organisation/organisation.service';
import { DashboardService } from '../services/dashboard.service';

@Component({
  selector: 'app-super-admin-dashboard',
  templateUrl: './super-admin-dashboard.component.html',
  styleUrls: ['./super-admin-dashboard.component.scss'],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ transform: 'translateY(20px)', opacity: 0 }),
        animate(
          '0.4s ease-out',
          style({ transform: 'translateY(0)', opacity: 1 })
        ),
      ]),
    ]),
  ],
})
export class SuperAdminDashboardComponent implements OnInit {
  organizations: any[] = [];

  entitiesData = {
    totalDatabases: 0,
    totalUsers: 0,
    totalAdmins: 0,
    totalEnvironment: 0,
    maxDatabases: 0,
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
      title: 'Total Databases',
      value: this.entitiesData.totalDatabases,
      maxValue: this.entitiesData.maxDatabases,
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
    // private orgService: OrganisationService,
    private dashboardService: DashboardService
  ) {}

  ngOnInit(): void {
    // Fetch initial data for the first organization
    // this.listOrganisationAPI();

    this.updateStats(); // Update stats on init
  }

  onOrganizationChange(event: any) {
    this.loadOrganizationData(event?.target.value);
  }

  // listOrganisationAPI() {
  //   this.orgService
  //     .listOrganisation({
  //       pageNumber: 1,
  //       limit: 100,
  //     })
  //     .subscribe((res: any) => {
  //       if (res) {
  //         this.organizations = [...res.data.orgs];
  //         this.loadOrganizationData(this.organizations[0].id);
  //       }
  //     });
  // }

  loadOrganizationData(orgId: string) {
    //fetch data from dashboardAPI
    this.dashboardService
      .getSuperAdminDashboard(orgId)
      .subscribe((res: any) => {
        if (res) {
          this.entitiesData.maxAdmins = res.data.maxAdmins;
          this.entitiesData.maxDatabases = res.data.maxDatabases;
          this.entitiesData.maxEnvironment = res.data.maxEnvironment;
          this.entitiesData.maxUsers = res.data.maxUsers;
          this.entitiesData.totalAdmins = res.data.adminsCount;
          this.entitiesData.totalDatabases = res.data.databasesCount;
          this.entitiesData.totalEnvironment = res.data.environmentCount;
          this.entitiesData.totalUsers = res.data.usersCount;
          this.updateStats();
        }
      });
    // Simulate fetching data based on organization ID
    // Replace this with actual service calls
    this.activeUsers24hrs = Math.floor(Math.random() * 100);
    this.activeUsers3days = Math.floor(Math.random() * 300);
    this.activeUsers7days = Math.floor(Math.random() * 500);
    this.activeUsers15days = Math.floor(Math.random() * 700);
    this.activeUsers30days = Math.floor(Math.random() * 1000);

    this.updateStats(); // Update stats after loading data
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
        title: 'Total Databases',
        value: this.entitiesData.totalDatabases,
        maxValue: this.entitiesData.maxDatabases,
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

  getOverviewIcon(title: string): string {
    const icons: { [key: string]: string } = {
      'Total Databases': 'fas fa-database',
      'Total Environments': 'fas fa-globe',
      'Total Admins': 'fas fa-user-shield',
      'Total Users': 'fas fa-users',
    };
    return icons[title] || 'fas fa-chart-bar';
  }

  getProgressValue(obj: any) {
    // Calculate percentage based on some maximum value
    const maxValue = obj.maxValue; // Adjust this based on your needs
    return (obj.value / maxValue) * 100;
  }

  addNewUser(): void {
    // Implement add user functionality
  }

  manageDatabase(): void {
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
