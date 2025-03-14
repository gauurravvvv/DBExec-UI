import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasetService } from '../../services/dataset.service';
import { DATASET } from 'src/app/constants/routes';

@Component({
  selector: 'app-edit-dataset',
  templateUrl: './edit-dataset.component.html',
  styleUrls: ['./edit-dataset.component.scss'],
})
export class EditDatasetComponent implements OnInit {
  datasetForm!: FormGroup;
  organisations: any[] = [];
  schemas: any[] = [];
  tables: { [key: string]: any[] } = {};
  columns: { [key: string]: any[] } = {};
  databases: any[] = [];
  isFormDirty: boolean = false;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedDatabase: any = null;
  orgId: string = '';
  datasetId: string = '';
  originalFormValue: any;
  staticSchemaData: any[] = [];
  duplicateRows: { [key: string]: Array<[number, number]> } = {};
  selectedOrgName: string = '';
  selectedDatabaseName: string = '';

  @ViewChild('formContainer') formContainer!: ElementRef;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private databaseService: DatabaseService,
    private datasetService: DatasetService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.datasetId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.datasetId) {
      this.loadDatasetData();
    }
  }

  initForm(): void {
    this.datasetForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      description: [''],
      organisation: [''],
      database: [''],
      status: [false],
      schemaGroups: this.fb.array([]),
    });

    this.datasetForm.valueChanges.subscribe(() => {
      this.checkFormDirty();
    });
  }

  get schemaGroups(): FormArray {
    return this.datasetForm.get('schemaGroups') as FormArray;
  }

  loadDatasetData(): void {
    this.datasetService.getDataset(this.orgId, this.datasetId).subscribe({
      next: response => {
        const datasetData = response.data;
        this.selectedOrg = { id: datasetData.organisationId };
        this.selectedDatabase = { id: datasetData.databaseId };
        this.selectedOrgName = datasetData.organisationName || '';
        this.selectedDatabaseName = datasetData.databaseName || '';

        if (this.showOrganisationDropdown) {
          this.loadOrganisations();
        }

        this.loadDatabases();

        this.loadDatabaseSchemas(() => {
          this.datasetForm.patchValue({
            id: datasetData.id,
            name: datasetData.name,
            description: datasetData.description,
            organisation: datasetData.organisationId,
            database: datasetData.databaseId,
            status: datasetData.status,
          });

          while (this.schemaGroups.length) {
            this.schemaGroups.removeAt(0);
          }

          // Process the mapping data
          if (Array.isArray(datasetData.datasetMapping)) {
            datasetData.datasetMapping.forEach((schemaMapping: any) => {
              const schemaGroup = this.fb.group({
                schema: [schemaMapping.schema, Validators.required],
                mappings: this.fb.array([]),
              });

              this.loadTablesForSchema(schemaMapping.schema);

              // Process tables and their columns
              if (Array.isArray(schemaMapping.tables)) {
                schemaMapping.tables.forEach((tableData: any) => {
                  const tableName = tableData.table;
                  this.loadColumnsForMapping(schemaMapping.schema, tableName);

                  if (Array.isArray(tableData.columns)) {
                    tableData.columns.forEach((columnData: any) => {
                      const mappingsArray = schemaGroup.get(
                        'mappings'
                      ) as FormArray;
                      mappingsArray.push(
                        this.fb.group({
                          table: [tableName, Validators.required],
                          column: [columnData.column, Validators.required],
                          value: [columnData.value, Validators.required],
                        })
                      );
                    });
                  }
                });
              }

              this.schemaGroups.push(schemaGroup);
            });
          }

          if (this.schemaGroups.length === 0) {
            this.addSchemaGroup();
          }

          // Set up subscriptions for all schema groups
          this.schemaGroups.controls.forEach((group, index) => {
            group.get('schema')?.valueChanges.subscribe(schemaName => {
              if (schemaName) {
                this.loadTablesForSchema(schemaName);
              }
              this.checkDuplicateMappings();
            });

            const mappings = this.getSchemaGroupMappings(index);
            mappings.controls.forEach(mapping => {
              mapping.get('table')?.valueChanges.subscribe(tableName => {
                const schemaName = group.get('schema')?.value;
                if (schemaName && tableName) {
                  this.loadColumnsForMapping(schemaName, tableName);
                }
                this.checkDuplicateMappings();
              });

              mapping.get('column')?.valueChanges.subscribe(() => {
                this.checkDuplicateMappings();
              });
            });
          });

          this.originalFormValue = this.datasetForm.value;
          this.isFormDirty = false;
          this.datasetForm.markAsPristine();

          console.log('Schema Groups:', this.schemaGroups.value);
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load dataset data',
        });
      },
    });
  }

  loadOrganisations(): void {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: response => {
        this.organisations = response.data.orgs;
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load organisations',
        });
      },
    });
  }

  loadDatabases(): void {
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).subscribe({
      next: response => {
        this.databases = response.data;
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load databases',
        });
      },
    });
  }

  loadDatabaseSchemas(callback?: () => void): void {
    const params = {
      orgId: this.selectedOrg.id,
      databaseId: this.selectedDatabase.id,
    };

    this.databaseService.listDatabaseSchemas(params).subscribe({
      next: response => {
        this.staticSchemaData = response.data;
        this.schemas = this.staticSchemaData.map(schema => ({
          name: schema.schema_name,
        }));
        if (callback) callback();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load schemas',
        });
      },
    });
  }

  loadTablesForSchema(schemaName: string): void {
    const schemaData = this.staticSchemaData.find(
      schema => schema.schema_name === schemaName
    );

    if (schemaData) {
      const tables = schemaData.tables.map((table: any) => ({
        name: table.table_name,
        columns: table.columns,
      }));

      this.tables[schemaName] = tables;
    } else {
      this.tables[schemaName] = [];
    }
  }

  loadColumnsForMapping(schemaName: string, tableName: string): void {
    const schemaData = this.staticSchemaData.find(
      schema => schema.schema_name === schemaName
    );

    if (!schemaData) {
      this.columns[`${schemaName}.${tableName}`] = [];
      return;
    }

    const tableData = schemaData.tables.find(
      (t: any) => t.table_name === tableName
    );

    if (tableData) {
      this.columns[`${schemaName}.${tableName}`] = tableData.columns.map(
        (col: any) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
        })
      );
    } else {
      this.columns[`${schemaName}.${tableName}`] = [];
    }
  }

  onSubmit(): void {
    if (this.datasetForm.valid && !this.hasDuplicates) {
      const formValue = this.datasetForm.value;

      // Transform the form data into flat structure
      const datasetMapping = formValue.schemaGroups.reduce(
        (acc: any[], group: any) => {
          const schema = group.schema;
          const mappings = group.mappings.map((mapping: any) => ({
            schema,
            table: mapping.table,
            column: mapping.column,
            value: mapping.value,
          }));
          return [...acc, ...mappings];
        },
        []
      );

      const payload = {
        id: this.datasetId,
        name: formValue.name,
        description: formValue.description,
        organisation: this.selectedOrg.id,
        database: this.selectedDatabase.id,
        status: formValue.status,
        columnMappings: datasetMapping,
      };

      this.datasetService.updateDataset(payload).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Dataset updated successfully',
          });
          this.router.navigate([DATASET.LIST]);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to update dataset',
          });
        },
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      // Clear existing schema groups
      while (this.schemaGroups.length) {
        this.schemaGroups.removeAt(0);
      }

      // Restore basic form values
      this.datasetForm.patchValue({
        id: this.originalFormValue.id,
        name: this.originalFormValue.name,
        description: this.originalFormValue.description,
        organisation: this.originalFormValue.organisation,
        database: this.originalFormValue.database,
      });

      // Restore schema groups and their mappings
      this.originalFormValue.schemaGroups.forEach((originalGroup: any) => {
        const schemaGroup = this.fb.group({
          schema: [originalGroup.schema, Validators.required],
          mappings: this.fb.array([]),
        });

        // Load tables for this schema
        this.loadTablesForSchema(originalGroup.schema);

        // Restore mappings
        originalGroup.mappings.forEach((originalMapping: any) => {
          // Load columns for this table
          this.loadColumnsForMapping(
            originalGroup.schema,
            originalMapping.table
          );

          const mappingsArray = schemaGroup.get('mappings') as FormArray;
          mappingsArray.push(
            this.fb.group({
              table: [originalMapping.table, Validators.required],
              column: [originalMapping.column, Validators.required],
              value: [originalMapping.value, Validators.required],
            })
          );
        });

        this.schemaGroups.push(schemaGroup);
      });

      // Set up subscriptions for restored schema groups
      this.schemaGroups.controls.forEach((group, index) => {
        group.get('schema')?.valueChanges.subscribe(schemaName => {
          if (schemaName) {
            this.loadTablesForSchema(schemaName);
          }
          this.checkDuplicateMappings();
        });

        const mappings = this.getSchemaGroupMappings(index);
        mappings.controls.forEach(mapping => {
          mapping.get('table')?.valueChanges.subscribe(tableName => {
            const schemaName = group.get('schema')?.value;
            if (schemaName && tableName) {
              this.loadColumnsForMapping(schemaName, tableName);
            }
            this.checkDuplicateMappings();
          });

          mapping.get('column')?.valueChanges.subscribe(() => {
            this.checkDuplicateMappings();
          });
        });
      });

      this.isFormDirty = false;
      this.datasetForm.markAsPristine();
    } else {
      this.router.navigate([DATASET.LIST]);
    }
  }

  checkFormDirty(): void {
    if (!this.originalFormValue) return;
    const currentValue = this.datasetForm.value;
    this.isFormDirty =
      JSON.stringify(this.originalFormValue) !== JSON.stringify(currentValue);
  }

  get hasDuplicates(): boolean {
    return Object.keys(this.duplicateRows).length > 0;
  }

  checkDuplicateMappings() {
    this.duplicateRows = {};

    const columnSelections = new Map<string, Array<[number, number]>>();

    this.schemaGroups.controls.forEach((schemaGroup, groupIndex) => {
      const schemaName = schemaGroup.get('schema')?.value;
      if (!schemaName) return;

      const mappings = this.getSchemaGroupMappings(groupIndex).controls;
      mappings.forEach((mapping, mappingIndex) => {
        const tableName = mapping.get('table')?.value;
        const columnName = mapping.get('column')?.value;

        if (tableName && columnName) {
          const key = `${schemaName}.${tableName}.${columnName}`;
          if (!columnSelections.has(key)) {
            columnSelections.set(key, []);
          }
          columnSelections.get(key)?.push([groupIndex, mappingIndex]);
        }
      });
    });

    columnSelections.forEach((positions, key) => {
      if (positions.length > 1) {
        this.duplicateRows[key] = positions;
      }
    });
  }

  getSchemaGroupMappings(groupIndex: number): FormArray {
    const group = this.schemaGroups.at(groupIndex) as FormGroup;
    return group.get('mappings') as FormArray;
  }

  isDuplicateRow(groupIndex: number, mappingIndex: number): boolean {
    return Object.values(this.duplicateRows).some(positions =>
      positions.some(([g, m]) => g === groupIndex && m === mappingIndex)
    );
  }

  getDuplicateMessage(groupIndex: number, mappingIndex: number): string {
    for (const [key, indexes] of Object.entries(this.duplicateRows)) {
      if (indexes.some(([g, m]) => g === groupIndex && m === mappingIndex)) {
        return `Duplicate mapping found: ${key}`;
      }
    }
    return '';
  }

  addSchemaGroup() {
    const schemaGroup = this.fb.group({
      schema: ['', Validators.required],
      mappings: this.fb.array([]),
    });

    schemaGroup.get('schema')?.valueChanges.subscribe(schemaName => {
      if (schemaName) {
        this.loadTablesForSchema(schemaName);
      }
      this.checkDuplicateMappings();
    });

    this.schemaGroups.push(schemaGroup);
    this.addMappingToSchema(this.schemaGroups.length - 1);
  }

  removeSchemaGroup(groupIndex: number) {
    if (this.schemaGroups.length > 1) {
      this.schemaGroups.removeAt(groupIndex);
      this.checkDuplicateMappings();
    }
  }

  addMappingToSchema(groupIndex: number) {
    const mapping = this.fb.group({
      table: ['', Validators.required],
      column: ['', Validators.required],
      value: ['', Validators.required],
    });

    mapping.get('table')?.valueChanges.subscribe(tableName => {
      const schemaName = this.schemaGroups.at(groupIndex).get('schema')?.value;
      if (schemaName && tableName) {
        this.loadColumnsForMapping(schemaName, tableName);
      }
      this.checkDuplicateMappings();
    });

    mapping.get('column')?.valueChanges.subscribe(() => {
      this.checkDuplicateMappings();
    });

    this.getSchemaGroupMappings(groupIndex).push(mapping);
  }

  removeMappingFromSchema(groupIndex: number, mappingIndex: number) {
    const mappings = this.getSchemaGroupMappings(groupIndex);
    if (mappings.length > 1) {
      mappings.removeAt(mappingIndex);
      this.checkDuplicateMappings();
    }
  }

  clearAllMappings() {
    while (this.schemaGroups.length) {
      this.schemaGroups.removeAt(0);
    }
    this.addSchemaGroup();
    this.checkDuplicateMappings();
  }

  getAvailableSchemas(currentGroupIndex: number): any[] {
    const selectedSchemas = this.schemaGroups.controls
      .map((group, index) =>
        index !== currentGroupIndex ? group.get('schema')?.value : null
      )
      .filter(schema => schema !== null);

    return this.schemas.filter(
      schema => !selectedSchemas.includes(schema.name)
    );
  }

  getAvailableTables(schemaName: string): any[] {
    return this.tables[schemaName] || [];
  }

  getAvailableColumns(schemaName: string, tableName: string): any[] {
    const key = `${schemaName}.${tableName}`;
    return this.columns[key] || [];
  }
}
