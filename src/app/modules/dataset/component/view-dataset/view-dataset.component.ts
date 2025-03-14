import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatasetService } from '../../services/dataset.service';
import { DATASET } from 'src/app/constants/routes';

@Component({
  selector: 'app-view-dataset',
  templateUrl: './view-dataset.component.html',
  styleUrls: ['./view-dataset.component.scss'],
})
export class ViewDatasetComponent implements OnInit {
  datasetData: any;
  showDeleteConfirm = false;
  expandedSchemas: string[] = [];
  filteredMappings: any[] = [];
  originalMappings: any[] = [];
  currentSchemaFilter: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService
  ) {}

  ngOnInit() {
    this.loadDatasetData();
  }

  loadDatasetData() {
    const orgId = this.route.snapshot.params['orgId'];
    const datasetId = this.route.snapshot.params['id'];

    this.datasetService.viewDataset(orgId, datasetId).subscribe({
      next: (response: any) => {
        this.datasetData = response.data;
        this.originalMappings = this.datasetData.datasetMapping;
        this.filteredMappings = [...this.originalMappings];
      },
      error: error => {
        console.error('Error loading dataset:', error);
      },
    });
  }

  getTotalTables(): number {
    return (
      this.datasetData?.datasetMapping.reduce(
        (acc: number, schema: any) => acc + schema.tables.length,
        0
      ) || 0
    );
  }

  getTotalMappings(): number {
    return (
      this.datasetData?.datasetMapping.reduce(
        (acc: number, schema: any) =>
          acc +
          schema.tables.reduce(
            (tableAcc: number, table: any) => tableAcc + table.columns.length,
            0
          ),
        0
      ) || 0
    );
  }

  getSchemaCount(): number {
    return this.datasetData?.datasetMapping.length || 0;
  }

  toggleSchemaExpand(schemaName: string) {
    const index = this.expandedSchemas.indexOf(schemaName);
    if (index === -1) {
      this.expandedSchemas.push(schemaName);
    } else {
      this.expandedSchemas.splice(index, 1);
    }
  }

  onSchemaSearch(event: any) {
    const searchTerm = event.target.value.toLowerCase();
    this.currentSchemaFilter = searchTerm;

    this.filteredMappings = this.originalMappings.filter(mapping =>
      mapping.schema.toLowerCase().includes(searchTerm)
    );

    // Auto expand/collapse based on search
    if (searchTerm) {
      // Expand all filtered schemas
      this.expandedSchemas = this.filteredMappings.map(
        mapping => mapping.schema
      );
    } else {
      // Clear expansions when search is empty
      this.expandedSchemas = [];
    }
  }

  onMappingSearch(event: any) {
    const searchTerm = event.target.value.toLowerCase();

    if (!searchTerm && !this.currentSchemaFilter) {
      this.filteredMappings = [...this.originalMappings];
      this.expandedSchemas = []; // Collapse all when no search
      return;
    }

    let baseData = this.currentSchemaFilter
      ? this.originalMappings.filter(mapping =>
          mapping.schema.toLowerCase().includes(this.currentSchemaFilter)
        )
      : this.originalMappings;

    if (searchTerm) {
      this.filteredMappings = baseData
        .map(schema => ({
          ...schema,
          tables: schema.tables.filter(
            (table: any) =>
              table.table.toLowerCase().includes(searchTerm) ||
              table.columns.some(
                (col: any) =>
                  col.column.toLowerCase().includes(searchTerm) ||
                  col.value.toLowerCase().includes(searchTerm)
              )
          ),
        }))
        .filter(schema => schema.tables.length > 0);

      // Auto expand schemas with matching results
      this.expandedSchemas = this.filteredMappings.map(
        mapping => mapping.schema
      );
    } else {
      this.filteredMappings = baseData;
      // Keep schemas expanded if there's still a schema filter
      if (!this.currentSchemaFilter) {
        this.expandedSchemas = [];
      }
    }
  }

  goBack() {
    this.router.navigate([DATASET.LIST]);
  }

  onEdit() {
    this.router.navigate([
      DATASET.EDIT,
      this.datasetData.organisationId,
      this.datasetData.id,
    ]);
  }

  confirmDelete() {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
  }

  proceedDelete() {
    this.datasetService
      .deleteDataset(this.datasetData.organisationId, this.datasetData.id)
      .subscribe({
        next: () => {
          this.router.navigate([DATASET.LIST]);
        },
        error: error => {
          console.error('Error deleting dataset:', error);
        },
      });
  }
}
