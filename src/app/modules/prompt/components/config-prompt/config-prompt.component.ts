import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PROMPT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { PromptService } from '../../services/prompt.service';

@Component({
  selector: 'app-config-prompt',
  templateUrl: './config-prompt.component.html',
  styleUrls: ['./config-prompt.component.scss'],
})
export class ConfigPromptComponent implements OnInit {
  promptForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  promptId: string = '';
  selectedOrgName: string = '';
  selectedPromptType: string = '';
  showAddPromptValues: boolean = false;
  selectedDatabaseName: string = '';
  selectedTabName: string = '';
  selectedSectionName: string = '';
  sectionData: any;
  sections: any[] = [];
  isCancelClicked = false;
  schemas: any[] = [];
  tables: { [key: string]: any[] } = {};
  private staticSchemaData: any[] = [];
  separator: string = ','; // Use comma as separator
  editingChipIndex: number = -1;
  @ViewChild('chipInput') chipInput!: ElementRef;
  configData: any = null;
  columnNameControl = new FormControl('');
  showSuggestions = false;
  filteredColumns: any[] = [];
  selectedSuggestionIndex = -1;
  tableColumns: { [key: string]: any[] } = {};

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private promptService: PromptService,
    private databaseService: DatabaseService
  ) {
    this.initForm();
    this.setupColumnNameSync();
  }

  ngOnInit(): void {
    this.promptId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.promptId) {
      this.loadPromptData();
    }

    this.promptForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
    });
  }

  get isFormDirty(): boolean {
    return this.promptForm.dirty;
  }

  initForm(): void {
    this.promptForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      organisation: [''],
      database: [''],
      tab: [''],
      section: [''],
      schema: ['', Validators.required],
      tables: [[], Validators.required],
      promptJoin: [''],
      promptWhere: ['', Validators.required],
      promptValues: [[]], // Initially no validation
    });

    this.promptForm.get('schema')?.valueChanges.subscribe(schema => {
      if (schema) {
        this.promptForm.get('tables')?.setValue([]);
        this.loadTablesForSchema(schema.name);
      }
    });

    this.promptForm.get('promptType')?.valueChanges.subscribe(type => {
      const promptValuesControl = this.promptForm.get('promptValues');
      if (['dropdown', 'multiselect', 'checkbox'].includes(type)) {
        promptValuesControl?.setValidators([Validators.required]);
      } else {
        promptValuesControl?.clearValidators();
      }
      promptValuesControl?.updateValueAndValidity();
    });

    this.promptForm.get('tables')?.valueChanges.subscribe(tables => {
      // Clear where condition when tables change
      this.promptForm.get('promptWhere')?.setValue('');

      // Reset suggestions
      this.showSuggestions = false;
      this.filteredColumns = [];

      // Update table columns mapping for selected tables
      this.updateTableColumns(tables);

      // Update join validation
      const promptJoinControl = this.promptForm.get('promptJoin');
      if (tables?.length > 1) {
        promptJoinControl?.setValidators([Validators.required]);
      } else {
        promptJoinControl?.clearValidators();
      }
      promptJoinControl?.updateValueAndValidity();
    });

    // Add validator for promptValues based on promptType
    if (this.showAddPromptValues) {
      this.promptForm.get('promptValues')?.setValidators([Validators.required]);
    } else {
      this.promptForm.get('promptValues')?.clearValidators();
    }
    this.promptForm.get('promptValues')?.updateValueAndValidity();
  }

  private setupColumnNameSync() {
    // Sync column name with where condition
    this.columnNameControl.valueChanges.subscribe(columnName => {
      if (columnName) {
        const tableAlias = this.getSelectedTableAlias();
        const value =
          this.selectedPromptType === 'dropdown'
            ? `${tableAlias}.${columnName} = '{value}'`
            : `${tableAlias}.${columnName} in ('{value}')`;
        this.promptForm.patchValue(
          { promptWhere: value },
          { emitEvent: false }
        );
      }
    });
  }

  getSelectedTableAlias(): string {
    const selectedTables = this.promptForm.get('tables')?.value || [];
    return selectedTables[0]?.alias || 't1';
  }

  loadPromptData(): void {
    this.promptService.viewPrompt(this.orgId, this.promptId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.sectionData = response.data;

        // Set basic prompt data
        this.promptForm.patchValue({
          id: this.sectionData.id,
          name: this.sectionData.name,
          organisation: this.sectionData.organisationId,
          database: this.sectionData.databaseId,
          tab: this.sectionData.section.tab.id,
          section: this.sectionData.section.id,
        });

        // Set display names
        this.selectedOrgName = this.sectionData.organisationName || '';
        this.selectedDatabaseName = this.sectionData.databaseName || '';
        this.selectedTabName = this.sectionData.section.tab.name || '';
        this.selectedSectionName = this.sectionData.section.name || '';
        this.selectedPromptType = this.sectionData.type || '';

        // Set prompt type validations
        this.showAddPromptValues =
          this.selectedPromptType === 'dropdown' ||
          this.selectedPromptType === 'multiselect' ||
          this.selectedPromptType === 'checkbox';

        if (this.showAddPromptValues) {
          this.promptForm
            .get('promptValues')
            ?.setValidators([Validators.required]);
        } else {
          this.promptForm.get('promptValues')?.clearValidators();
        }
        this.promptForm.get('promptValues')?.updateValueAndValidity();

        // First load schema data
        this.loadSchemaData();
      }
    });
  }

  loadSchemaData() {
    const params = {
      orgId: this.sectionData.organisationId,
      databaseId: this.sectionData.databaseId,
    };

    this.databaseService.listDatabaseSchemas(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.staticSchemaData = response.data;
        this.schemas = this.staticSchemaData.map(schema => ({
          name: schema.schema_name,
        }));

        // After schema data is loaded, load config data
        this.loadConfigData();
      }
    });
  }

  loadConfigData() {
    this.promptService.getConfig(this.orgId, this.promptId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const config = response.data.configuration[0];
        const values = response.data.values;
        this.configData = config;

        // First set the schema
        const schemaControl = this.promptForm.get('schema');
        schemaControl?.patchValue({ name: config.prompt_schema });

        // Parse and set table
        const tableMatch = config.prompt_table.match(/(.+?)\((.+?)\)/);
        if (tableMatch) {
          const tableName = tableMatch[1];
          const alias = tableMatch[2];

          // Set tables after schema is set
          setTimeout(() => {
            this.promptForm.patchValue({
              tables: [
                {
                  tableName: tableName,
                  alias: alias,
                },
              ],
            });

            // Finally set the remaining config
            this.promptForm.patchValue({
              promptJoin: config.prompt_join,
              promptWhere: config.prompt_where,
              promptValues: values.map((v: any) => v.value),
            });
          });
        }
      }
    });
  }

  onSubmit(): void {
    if (this.promptForm.valid) {
      const formValues = this.promptForm.value;

      const transformedTables = formValues.tables
        .map((table: any) => `${table.tableName}(${table.alias})`)
        .join(',');

      const submitData = {
        ...formValues,
        tables: transformedTables,
        schema: formValues.schema.name,
      };

      this.promptService.configPrompt(submitData).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([PROMPT.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.promptForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        organisation: this.sectionData.organisationId,
        database: this.sectionData.databaseId,
        tab: this.sectionData.section.tab.id,
        section: this.sectionData.section.id,
        schema: '',
        tables: [],
        promptJoin: '',
        promptWhere: '',
        promptValues: [], // Reset to empty array
      });

      this.selectedOrgName = this.sectionData.organisationName || '';
      this.selectedDatabaseName = this.sectionData.databaseName || '';
      this.selectedTabName = this.sectionData.section.tab.name || '';
      this.selectedSectionName = this.sectionData.section.name || '';

      this.tables = {};

      this.isCancelClicked = true;

      this.promptForm.markAsPristine();
      this.promptForm.markAsUntouched();
    }
  }

  private loadTablesForSchema(schemaName: string) {
    const schemaData = this.staticSchemaData.find(
      schema => schema.schema_name === schemaName
    );

    // Clear previous table columns
    this.tableColumns = {};

    if (schemaData) {
      const tables = schemaData.tables.map((table: any) => {
        // Store columns for each table alias
        this.tableColumns[table.table_alias] = table.columns;

        return {
          name: `${table.table_name}(${table.table_alias})`,
          value: {
            tableName: table.table_name,
            alias: table.table_alias,
          },
          columns: table.columns,
        };
      });

      this.tables[schemaName] = tables;
    } else {
      this.tables[schemaName] = [];
    }
  }

  getAvailableTables(schema: any): any[] {
    if (!schema) return [];
    const schemaName = schema.name;

    if (!this.tables[schemaName]) {
      this.loadTablesForSchema(schemaName);
    }

    return this.tables[schemaName] || [];
  }

  clearPromptValues(): void {
    this.promptForm.patchValue({
      promptValues: [],
    });
  }

  onChipDoubleClick(event: any): void {
    const item = event.value;
    const values = this.promptForm.get('promptValues')?.value || [];
    this.editingChipIndex = values.indexOf(item);
    setTimeout(() => {
      if (this.chipInput) {
        this.chipInput.nativeElement.focus();
        this.chipInput.nativeElement.style.width = `${item.length}ch`;
      }
    });
  }

  updateChip(event: any): void {
    const newValue = event.target.value.trim();
    if (this.editingChipIndex > -1) {
      const values = [...(this.promptForm.get('promptValues')?.value || [])];
      if (newValue && !values.includes(newValue)) {
        values[this.editingChipIndex] = newValue;
        this.promptForm.patchValue({ promptValues: values });
        event.target.style.width = `${newValue.length}ch`;
      }
      this.editingChipIndex = -1;
    }
  }

  cancelEdit(): void {
    this.editingChipIndex = -1;
  }

  getWhereTemplate(): string {
    const selectedTables = this.promptForm.get('tables')?.value || [];

    // Show default placeholder if no tables selected
    if (!selectedTables.length) {
      return 'Enter Where condition';
    }

    // Show custom placeholder based on table selection
    let template = '';
    if (selectedTables.length === 1) {
      template = `${selectedTables[0].alias}.column_name`;
    } else {
      template = 'alias.column_name';
    }

    const operator =
      this.selectedPromptType === 'dropdown'
        ? ` = '{value}'`
        : ` in ('{value}')`;

    return `Example: ${template}${operator}`;
  }

  onWhereConditionInput(event: any) {
    const value = event.target.value;
    const lastDotIndex = value.lastIndexOf('.');
    const selectedTables = this.promptForm.get('tables')?.value || [];

    if (lastDotIndex !== -1) {
      const beforeDot = value.substring(0, lastDotIndex).trim();
      const afterDot = value.substring(lastDotIndex + 1).toLowerCase();

      // For single table, force the current table's alias
      if (selectedTables.length === 1) {
        const currentAlias = selectedTables[0].alias;
        if (beforeDot !== currentAlias) {
          event.target.value = `${currentAlias}.${afterDot}`;
          return;
        }
      }

      // For multiple tables, check if the alias is from selected tables
      if (selectedTables.length > 1) {
        const validAliases = selectedTables.map((t: any) => t.alias);
        if (!validAliases.includes(beforeDot)) {
          // If invalid alias, prevent input
          event.preventDefault();
          return;
        }
      }

      // Show column suggestions for valid alias
      if (this.tableColumns[beforeDot]) {
        this.filteredColumns = this.tableColumns[beforeDot].filter(column =>
          column.name.toLowerCase().includes(afterDot)
        );
        this.showSuggestions = true;
        this.selectedSuggestionIndex = -1;
      }
    } else {
      this.showSuggestions = false;
    }
  }

  onWhereKeydown(event: KeyboardEvent) {
    if (!this.showSuggestions) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.min(
          this.selectedSuggestionIndex + 1,
          this.filteredColumns.length - 1
        );
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.max(
          this.selectedSuggestionIndex - 1,
          0
        );
        break;

      case 'Enter':
        event.preventDefault();
        if (this.selectedSuggestionIndex >= 0) {
          this.selectSuggestion(
            this.filteredColumns[this.selectedSuggestionIndex]
          );
        }
        break;

      case 'Escape':
        this.showSuggestions = false;
        break;
    }
  }

  selectSuggestion(column: any) {
    const value = this.promptForm.get('promptWhere')?.value || '';
    const lastDotIndex = value.lastIndexOf('.');
    const beforeDot = value.substring(0, lastDotIndex);
    const operator =
      this.selectedPromptType === 'dropdown'
        ? ` = '{value}'`
        : ` in ('{value}')`;
    const newValue = `${beforeDot}.${column.name}${operator}`;

    this.promptForm.patchValue({ promptWhere: newValue });
    this.showSuggestions = false;
  }

  private updateTableColumns(selectedTables: any[]) {
    // Clear previous table columns
    this.tableColumns = {};

    // Get current schema
    const currentSchema = this.promptForm.get('schema')?.value?.name;
    const schemaData = this.staticSchemaData.find(
      schema => schema.schema_name === currentSchema
    );

    if (schemaData) {
      selectedTables.forEach((selectedTable: any) => {
        const table = schemaData.tables.find(
          (t: any) => t.table_name === selectedTable.tableName
        );
        if (table) {
          // Store columns for the selected table's alias
          this.tableColumns[selectedTable.alias] = table.columns;
        }
      });
    }
  }

  onPromptFileUpload(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      let text = e.target.result as string;
      // Split by comma, newline, or |
      let newValues = text
        .split(/,|\n|\r|\|/)
        .map(v => v.trim())
        .filter(v => v.length > 0);
      // Get current values
      let currentValues = this.promptForm.get('promptValues')?.value || [];
      // Merge and keep only unique values
      let merged = Array.from(new Set([...currentValues, ...newValues]));
      this.promptForm.patchValue({ promptValues: merged });
      // Reset file input so user can re-upload same file if needed
      event.target.value = '';
    };
    reader.readAsText(file);
  }
}
