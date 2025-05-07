import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { DATASET } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasetService } from '../../services/dataset.service';

@Component({
  selector: 'app-add-dataset',
  templateUrl: './add-dataset.component.html',
  styleUrls: ['./add-dataset.component.scss'],
})
export class AddDatasetComponent implements OnInit {
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
  selectedSchema: any = null;
  originalColumns: any[] = [];
  allColumns: { schema: string; table: string; column: any }[] = [];
  totalAvailableColumns: number = 0;
  duplicateRows: { [key: string]: Array<[number, number]> } = {};
  protected Object = Object;

  @ViewChild('formContainer') formContainer!: ElementRef;

  // Update the static data property to be an array
  private staticSchemaData: any[] = [];

  // Add these properties
  isNewlyAdded: boolean = false;
  isNewlyAddedMapping: boolean = false;
  lastAddedSchemaIndex: number = -1;
  lastAddedMappingGroupIndex: number = -1;
  lastAddedMappingIndex: number = -1;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private databaseService: DatabaseService,
    private datasetService: DatasetService
  ) {
    this.initForm();
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatabases();
    }
  }

  get schemaGroups(): FormArray {
    return this.datasetForm.get('schemaGroups') as FormArray;
  }

  private initForm() {
    this.datasetForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      database: ['', Validators.required],
      schemaGroups: this.fb.array([]),
    });

    this.datasetForm.valueChanges.subscribe(() => {
      this.updateFormDirtyState();
    });
  }

  getCredentialsFormArray(set: AbstractControl): FormArray {
    return set.get('credentials') as FormArray;
  }

  createCredentialSet(): FormGroup {
    return this.fb.group({
      credentials: this.fb.array([]),
    });
  }

  createCredentialField(fieldName: string, sequence: number): FormGroup {
    return this.fb.group({
      fieldName: [fieldName],
      value: ['', Validators.required],
      sequence: [sequence],
      showPassword: [false],
    });
  }

  togglePasswordVisibility(field: AbstractControl) {
    const showPassword = field.get('showPassword');
    if (showPassword) {
      showPassword.setValue(!showPassword.value);
    }
  }

  private loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
      }
    });
  }

  private loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = [...response.data];
      }
    });
  }

  onOrganisationChange(event: any) {
    this.datasetForm.get('database')?.reset();
    this.datasetForm.get('schema')?.reset();

    this.selectedOrg = {
      id: event.value,
    };
    this.selectedDatabase = null;
    this.selectedSchema = null;
    this.loadDatabases();
    this.updateFormDirtyState();
  }

  onDatabaseChange(event: any) {
    this.selectedDatabase = {
      id: event.value,
    };
    // Clear existing data
    this.totalAvailableColumns = 0;
    this.tables = {};
    this.columns = {};
    this.allColumns = [];
    this.originalColumns = [];
    this.schemaGroups.clear();

    const params = {
      orgId: this.selectedOrg.id,
      databaseId: this.selectedDatabase.id,
    };

    this.databaseService.listDatabaseSchemas(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.staticSchemaData = response.data;
        // Load schemas from static data
        this.schemas = this.staticSchemaData.map(schema => ({
          name: schema.schema_name,
        }));
        // Add first empty mapping row
        this.addSchemaGroup();
      }
    });
  }

  onSubmit() {
    if (this.datasetForm.valid && !this.hasDuplicates) {
      const formValue = this.datasetForm.value;
      const mappings = formValue.schemaGroups.flatMap((group: any) =>
        group.mappings.map((mapping: any) => ({
          schema: group.schema,
          ...mapping,
        }))
      );

      const payload = {
        name: formValue.name,
        description: formValue.description,
        organisation: this.selectedOrg.id,
        database: formValue.database,
        columnMappings: mappings,
      };

      // Call your API service here
      this.datasetService.addDataset(payload).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([DATASET.LIST]);
        }
      });
    }
  }

  onCancel() {
    if (this.isFormDirty) {
      this.datasetForm.reset();
      this.isFormDirty = false;
    }
  }

  private updateFormDirtyState() {
    this.isFormDirty =
      this.datasetForm.dirty ||
      this.datasetForm.get('organisation')?.value !== '' ||
      this.datasetForm.get('database')?.value !== '' ||
      this.datasetForm.get('schema')?.value !== '' ||
      this.datasetForm.get('schemaGroups')?.value !== '';
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
    this.lastAddedSchemaIndex = this.schemaGroups.length - 1;
    this.addMappingToSchema(this.lastAddedSchemaIndex);

    // First scroll, then highlight
    this.scrollToBottom();
    setTimeout(() => {
      this.isNewlyAdded = true;
      setTimeout(() => {
        this.isNewlyAdded = false;
        this.lastAddedSchemaIndex = -1;
      }, 500);
    }, 300);
  }

  removeSchemaGroup(groupIndex: number) {
    if (this.schemaGroups.length > 1) {
      // Get the schema being removed
      const schemaGroup = this.schemaGroups.at(groupIndex);
      const schemaName = schemaGroup.get('schema')?.value;

      // Clear all duplicates before removing the group
      this.duplicateRows = {};

      // Remove the schema group
      this.schemaGroups.removeAt(groupIndex);

      // Update indexes in duplicateRows for remaining groups
      this.checkDuplicateMappings();

      // Trigger change detection for UI update
      this.datasetForm.updateValueAndValidity();
    }
  }

  getSchemaGroupMappings(groupIndex: number): FormArray {
    const group = this.schemaGroups.at(groupIndex) as FormGroup;
    return group.get('mappings') as FormArray;
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

    const mappingsArray = this.getSchemaGroupMappings(groupIndex);
    mappingsArray.push(mapping);

    this.lastAddedMappingGroupIndex = groupIndex;
    this.lastAddedMappingIndex = mappingsArray.length - 1;

    // First scroll, then highlight
    this.scrollToNewMapping(groupIndex);
    setTimeout(() => {
      this.isNewlyAddedMapping = true;
      setTimeout(() => {
        this.isNewlyAddedMapping = false;
        this.lastAddedMappingGroupIndex = -1;
        this.lastAddedMappingIndex = -1;
      }, 500);
    }, 300);
  }

  removeMappingFromSchema(groupIndex: number, mappingIndex: number) {
    const mappings = this.getSchemaGroupMappings(groupIndex);
    if (mappings.length > 1) {
      mappings.removeAt(mappingIndex);
      this.checkDuplicateMappings();
    }
  }

  // Update helper methods
  getAvailableTables(schemaName: string): any[] {
    if (!schemaName) return [];

    // Load tables if not already loaded
    if (!this.tables[schemaName]) {
      this.loadTablesForSchema(schemaName);
    }

    return this.tables[schemaName] || [];
  }

  getAvailableColumns(schemaName: string, tableName: string): any[] {
    if (!schemaName || !tableName) return [];

    const key = `${schemaName}.${tableName}`;
    if (!this.columns[key]) {
      this.loadColumnsForMapping(schemaName, tableName);
    }

    return this.columns[key] || [];
  }

  private checkDuplicateMappings() {
    this.duplicateRows = {};

    // Create a map to store all column selections
    const columnSelections = new Map<string, Array<[number, number]>>();

    // First pass: collect all column selections
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

    // Second pass: identify duplicates
    columnSelections.forEach((positions, key) => {
      if (positions.length > 1) {
        this.duplicateRows[key] = positions;
      }
    });
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

  get hasDuplicates(): boolean {
    return Object.keys(this.duplicateRows).length > 0;
  }

  private loadTablesForSchema(schemaName: string) {
    // Find the schema in static data
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

  clearAllMappings() {
    // Clear all schema groups
    this.schemaGroups.clear();

    // Reset duplicates
    this.duplicateRows = {};

    // Add back one empty schema group
    this.addSchemaGroup();

    // Update form state
    this.datasetForm.markAsDirty();
    this.updateFormDirtyState();
  }

  private loadColumnsForMapping(schemaName: string, tableName: string) {
    // Find the schema in static data
    const schemaData = this.staticSchemaData.find(
      schema => schema.schema_name === schemaName
    );

    if (!schemaData) {
      this.columns[`${schemaName}.${tableName}`] = [];
      return;
    }

    // Find the table in schema data
    const tableData = schemaData.tables.find(
      (t: any) => t.table_name === tableName
    );

    if (tableData) {
      const columns = tableData.columns.map((col: any) => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable,
      }));

      this.columns[`${schemaName}.${tableName}`] = columns;

      if (
        !this.allColumns.some(
          col => col.schema === schemaName && col.table === tableName
        )
      ) {
        const newColumns = columns.map((column: any) => ({
          schema: schemaName,
          table: tableName,
          column: {
            ...column,
            fullName: `${schemaName}.${tableName}.${column.name}`,
          },
        }));
        this.allColumns = [...this.allColumns, ...newColumns];
        this.totalAvailableColumns = this.allColumns.length;
      }
    } else {
      this.columns[`${schemaName}.${tableName}`] = [];
    }
  }

  // Add a method to get available schemas for a specific group
  getAvailableSchemas(currentGroupIndex: number): any[] {
    // Get all selected schemas except the current group's schema
    const selectedSchemas = this.schemaGroups.controls
      .map((group, index) =>
        index !== currentGroupIndex ? group.get('schema')?.value : null
      )
      .filter(schema => schema !== null);

    // Filter out already selected schemas from the options
    return this.schemas.filter(
      schema => !selectedSchemas.includes(schema.name)
    );
  }

  scrollToBottom(): void {
    setTimeout(() => {
      const formElement = document.querySelector('.admin-form');
      if (formElement) {
        formElement.scrollTo({
          top: formElement.scrollHeight,
          behavior: 'smooth',
        });
      }
    }, 100);
  }

  scrollToNewMapping(groupIndex: number): void {
    setTimeout(() => {
      const formElement = document.querySelector('.admin-form');
      const mappingsLength = this.getSchemaGroupMappings(groupIndex).length;
      const newMapping = document.getElementById(
        `mapping-${groupIndex}-${mappingsLength - 1}`
      );

      if (formElement && newMapping) {
        const formRect = formElement.getBoundingClientRect();
        const newMappingRect = newMapping.getBoundingClientRect();

        formElement.scrollTo({
          top:
            formElement.scrollTop + (newMappingRect.top - formRect.top) - 100, // 100px offset for better visibility
          behavior: 'smooth',
        });
      }
    }, 100);
  }
}
