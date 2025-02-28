import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { DATABASE } from 'src/app/constants/routes';

interface StorageTable {
  name: string;
  schema: string;
  size: number;
  percentage: number;
  color: string;
}

@Component({
  selector: 'app-view-database',
  templateUrl: './view-database.component.html',
  styleUrls: ['./view-database.component.scss'],
})
export class ViewDatabaseComponent implements OnInit {
  dbId!: string;
  dbData: any;
  showDeleteConfirm = false;
  tableSizeChartData: any;
  schemaSizeChartData: any = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
      },
    ],
  }; // Initialize with empty data
  schemaChartOptions: any;
  chartOptions: any;
  deleteConfiguration: boolean = false;
  topStorageTables: StorageTable[] = [];

  statsChartOptions: any;
  recentQueries: any[] = []; // Array to hold recent queries

  // Added missing properties
  expandedSchemas: string[] = [];
  filteredSchemas: any[] = [];
  currentQuery: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private databaseService: DatabaseService,
    private globalService: GlobalService
  ) {
    // Initialize chart options with default values
    this.initChartOptions();
  }

  ngOnInit(): void {
    this.dbId = this.route.snapshot.params['id'];
    if (this.dbId) {
      this.loadDatabaseData();
    }
  }

  // Changed from private to public
  loadDatabaseData(): void {
    this.databaseService.viewDatabase(this.dbId).subscribe({
      next: (response: any) => {
        if (this.globalService.handleAPIResponse(response)) {
          this.dbData = response.data;
          this.prepareChartData();
          this.updateChartOptions(); // Update options after data is loaded
          this.filteredSchemas = this.dbData.statistics.schemaStats;
          this.prepareTopStorageTables();
        }
      },
      error: error => {
        this.globalService.handleAPIResponse({
          status: false,
          message:
            error?.error?.message ||
            error?.message ||
            'Failed to load database',
        });
      },
    });
  }

  // Add missing methods
  syncDatabase(): void {
    // Implementation for syncing database
    // this.globalService.showToast(
    //   'info',
    //   'Syncing database...',
    //   'This feature is coming soon'
    // );
  }

  onSchemaSearch(event: any): void {
    const searchTerm = event.target.value.toLowerCase();
    if (!searchTerm) {
      this.filteredSchemas = this.dbData.statistics.schemaStats;
    } else {
      this.filteredSchemas = this.dbData.statistics.schemaStats.filter(
        (schema: any) => schema.name.toLowerCase().includes(searchTerm)
      );
    }
  }

  toggleSchemaExpand(schema: any): void {
    const index = this.expandedSchemas.indexOf(schema.name);
    if (index > -1) {
      this.expandedSchemas.splice(index, 1);
    } else {
      this.expandedSchemas.push(schema.name);
    }
  }

  getSchemaPercentage(schema: any): number {
    const total = this.dbData.statistics.databaseSizeMB;
    return (schema.totalSizeMB / total) * 100;
  }

  getSchemaColor(schema: any): string {
    const colors = this.generateColors(
      this.dbData.statistics.schemaStats.length
    );
    const index = this.dbData.statistics.schemaStats.findIndex(
      (s: any) => s.name === schema.name
    );
    return colors[index % colors.length];
  }

  getTablesForSchema(schemaName: string): any[] {
    const schema = this.dbData.statistics.schemas.find(
      (s: any) => s.name === schemaName
    );
    return schema ? schema.tables : [];
  }

  // Add method to prepare top storage tables
  private prepareTopStorageTables(): void {
    // Extract all tables with schema information
    const allTables = this.dbData.statistics.schemas.flatMap((schema: any) =>
      schema.tables.map((table: any) => ({
        name: table.name,
        schema: schema.name,
        size: table.sizeMB.total,
      }))
    );

    // Sort by size descending
    const sortedTables = [...allTables].sort((a, b) => b.size - a.size);

    // Take top 10
    const topTables = sortedTables.slice(0, 10);

    // Calculate percentages
    const totalSize = this.dbData.statistics.databaseSizeMB;
    const colors = this.generateColors(topTables.length);

    this.topStorageTables = topTables.map((table, i) => ({
      ...table,
      percentage: (table.size / totalSize) * 100,
      color: colors[i],
    }));
  }

  private prepareChartData(): void {
    // Prepare table size chart data
    const tableData = this.dbData.statistics.schemas.flatMap((schema: any) =>
      schema.tables.map((table: any) => ({
        name: `${schema.name}.${table.name}`,
        size: table.sizeMB.total,
      }))
    );

    this.tableSizeChartData = {
      labels: tableData.map((t: any) => t.name),
      datasets: [
        {
          data: tableData.map((t: any) => t.size),
          backgroundColor: this.generateColors(tableData.length),
        },
      ],
    };

    // Prepare schema size chart data
    const schemaData = this.dbData.statistics.schemaStats;
    const colors = this.generateColors(schemaData.length);

    this.schemaSizeChartData = {
      labels: schemaData.map((s: any) => s.name),
      datasets: [
        {
          data: schemaData.map((s: any) => s.totalSizeMB),
          backgroundColor: colors,
        },
      ],
    };
  }

  // Renamed existing options to schemaChartOptions
  private initChartOptions(): void {
    this.schemaChartOptions = {
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'var(--card-background)',
          titleColor: 'var(--text-color)',
          bodyColor: 'var(--text-color)',
          borderColor: 'var(--border-color)',
          borderWidth: 1,
        },
      },
      responsive: true,
      maintainAspectRatio: false,
    };

    this.statsChartOptions = {
      plugins: {
        legend: {
          position: 'bottom',
          align: 'center',
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              '--text-color'
            ),
            font: { size: 12 },
            usePointStyle: true,
            padding: 15,
          },
        },
        title: {
          display: true,
          text: 'Top 10 Schemas by Size',
          color: getComputedStyle(document.documentElement).getPropertyValue(
            '--text-color'
          ),
          font: { size: 14, weight: 'bold' },
          padding: { bottom: 10 },
        },
        tooltip: {
          backgroundColor: getComputedStyle(
            document.documentElement
          ).getPropertyValue('--card-background'),
          titleColor: getComputedStyle(
            document.documentElement
          ).getPropertyValue('--text-color'),
          bodyColor: getComputedStyle(
            document.documentElement
          ).getPropertyValue('--text-color'),
          borderColor: getComputedStyle(
            document.documentElement
          ).getPropertyValue('--border-color'),
          borderWidth: 1,
        },
      },
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', // Make it a horizontal bar chart
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              '--text-color'
            ),
            font: { size: 11 },
            beginAtZero: true,
          },
          grid: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              '--border-color'
            ),
            drawBorder: false,
          },
        },
        y: {
          stacked: true,
          ticks: {
            color: getComputedStyle(document.documentElement).getPropertyValue(
              '--text-color'
            ),
            font: { size: 11 },
          },
          grid: {
            display: false,
          },
        },
      },
      barThickness: 20,
      maxBarThickness: 25,
    };
  }

  private updateChartOptions(): void {
    // Update schema count after data is loaded
    const schemaCount = this.schemaSizeChartData.labels.length;
    document.documentElement.style.setProperty(
      '--schema-count',
      schemaCount.toString()
    );
  }

  private generateColors(count: number): string[] {
    const colors = [
      '#FF6384',
      '#36A2EB',
      '#FFCE56',
      '#4BC0C0',
      '#9966FF',
      '#FF9F40',
      '#FF6384',
      '#C9CBCF',
      '#4BC0C0',
      '#FF9F40',
    ];
    return Array(count)
      .fill(0)
      .map((_, i) => colors[i % colors.length]);
  }

  goBack(): void {
    this.router.navigate([DATABASE.LIST]);
  }

  onEdit(): void {
    this.router.navigate([DATABASE.EDIT, this.dbData.id]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    if (this.dbData) {
      this.databaseService
        .deleteDatabase(this.dbData.id, this.deleteConfiguration)
        .subscribe({
          next: response => {
            if (this.globalService.handleAPIResponse(response)) {
              this.router.navigate([DATABASE.LIST]);
            }
          },
          error: error => {
            this.globalService.handleAPIResponse({
              status: false,
              message:
                error?.error?.message ||
                error?.message ||
                'Failed to delete database',
            });
          },
        });
    }
  }
}
