import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { first, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { PROMPT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { PromptService } from '../../services/prompt.service';
import {
  ConfigPromptActions,
  selectSchemaByKey,
  selectIsSchemaStale,
} from '../../store';
import { SqlQueryDialogComponent } from '../dialogs/sql-query-dialog/sql-query-dialog.component';
import { PROMPT_TYPES } from '../../constants/prompt.constant';

@Component({
  selector: 'app-config-prompt',
  templateUrl: './config-prompt.component.html',
  styleUrls: ['./config-prompt.component.scss'],
})
export class ConfigPromptComponent implements OnInit, OnDestroy {
  // Subscription cleanup
  private destroy$ = new Subject<void>();

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
  staticSchemaData: any[] = [];
  separator: string = ','; // Use comma as separator
  editingChipIndex: number = -1;
  @ViewChild('chipInput') chipInput!: ElementRef;
  configData: any = null;
  columnNameControl = new FormControl('');
  showSuggestions = false;
  filteredColumns: any[] = [];
  selectedSuggestionIndex = -1;
  tableColumns: { [key: string]: any[] } = {};
  isLoadingSchema = false;
  availableColumns: any[] = [];

  // Enhanced autocomplete properties (WHERE)
  maxSuggestions = 50;
  currentAlias = '';
  private hideDelay: any = null;

  // Enhanced autocomplete properties (JOIN)
  showJoinSuggestions = false;
  filteredJoinColumns: any[] = [];
  selectedJoinSuggestionIndex = -1;
  currentJoinAlias = '';
  private hideJoinDelay: any = null;

  // SQL Query Dialog
  showSqlDialog = false;
  @ViewChild(SqlQueryDialogComponent)
  sqlDialogComponent?: SqlQueryDialogComponent;

  // Refresh state
  isRefreshingValues = false;

  // Dropdown Configuration Dialog
  showDropdownConfigDialog = false;
  dropdownConfig: any = {};

  // Multiselect Configuration Dialog
  showMultiselectConfigDialog = false;
  multiselectConfig: any = {};

  // Checkbox Configuration Dialog
  showCheckboxConfigDialog = false;
  checkboxConfig: any = {};

  // Radio Configuration Dialog
  showRadioConfigDialog = false;
  radioConfig: any = {};

  // Text Configuration Dialog
  showTextConfigDialog = false;
  textConfig: any = {};

  // Number Configuration Dialog
  showNumberConfigDialog = false;
  numberConfig: any = {};

  // Date Configuration Dialog
  showDateConfigDialog = false;
  dateConfig: any = {};

  // Date Range Configuration Dialog
  showDateRangeConfigDialog = false;
  dateRangeConfig: any = {};

  // Calendar Configuration Dialog
  showCalendarConfigDialog = false;
  calendarConfig: any = {};

  // Range Slider Configuration Dialog
  showRangeSliderConfigDialog = false;
  rangeSliderConfig: any = {};

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private promptService: PromptService,
    private databaseService: DatabaseService,
    private store: Store
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

    this.promptForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
      columns: [[], Validators.required],
      promptJoin: [''],
      promptWhere: ['', Validators.required],
      promptValues: [[]], // Initially no validation
      type: [''],
      promptValueSQL: [''],
    });

    this.promptForm
      .get('schema')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(schema => {
        if (schema) {
          // Cascading reset: clear all dependent fields when schema changes
          this.promptForm.patchValue(
            {
              tables: [],
              columns: [],
              promptJoin: '',
              promptWhere: '',
            },
            { emitEvent: false }
          );

          // Reset available columns and table columns
          this.availableColumns = [];
          this.tableColumns = {};

          // Load tables for the new schema
          this.loadTablesForSchema(schema.name);
        }
      });

    // Fix #5: Changed from 'promptType' to 'type' (correct form control name)
    // Fix #8: Also sync selectedPromptType when type changes
    this.promptForm
      .get('type')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(type => {
        this.selectedPromptType = type;
        const promptValuesControl = this.promptForm.get('promptValues');
        if (['dropdown', 'multiselect', 'checkbox'].includes(type)) {
          promptValuesControl?.setValidators([Validators.required]);
        } else {
          promptValuesControl?.clearValidators();
        }
        promptValuesControl?.updateValueAndValidity();
      });

    this.promptForm
      .get('tables')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(tables => {
        // Clear where condition when tables change
        this.promptForm.get('promptWhere')?.setValue('');

        // Reset suggestions
        this.showSuggestions = false;
        this.filteredColumns = [];

        // Update table columns mapping for selected tables
        this.updateTableColumns(tables);

        // Update available columns for the multiselect
        this.updateAvailableColumns(tables);

        // Handle selected columns when tables change
        this.handleColumnsOnTableChange(tables);

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
          type: PROMPT_TYPES.find(type => type.value === this.sectionData.type)
            ?.label,
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
    const orgId = this.sectionData.organisationId.toString();
    const dbId = this.sectionData.databaseId.toString();

    this.isLoadingSchema = true;

    // Check if we have cached data in the store
    this.store
      .select(selectSchemaByKey(orgId, dbId))
      .pipe(first())
      .subscribe(cachedEntry => {
        if (cachedEntry && cachedEntry.data) {
          // Check if data is stale
          this.store
            .select(selectIsSchemaStale(orgId, dbId))
            .pipe(first())
            .subscribe(isStale => {
              if (isStale) {
                // Data is stale, refresh from API
                this.loadSchemaDataFromAPI(orgId, dbId);
              } else {
                // Use cached data
                this.applyCachedSchemaData(cachedEntry.data);
              }
            });
        } else {
          // No cached data, load from API
          this.loadSchemaDataFromAPI(orgId, dbId);
        }
      });
  }

  /**
   * Apply cached schema data from store
   */
  private applyCachedSchemaData(schemaData: any): void {
    // The store contains transformed DatabaseSchema format
    // We need to extract the schemas array from it
    if (schemaData && schemaData.schemas) {
      this.staticSchemaData = schemaData.schemas;
    } else if (Array.isArray(schemaData)) {
      this.staticSchemaData = schemaData;
    } else {
      this.staticSchemaData = [];
    }

    this.schemas = this.staticSchemaData.map((schema: any) => ({
      name: schema.schema_name,
    }));

    this.isLoadingSchema = false;

    // After schema data is loaded, load config data
    this.loadConfigData();
  }

  /**
   * Load schema data from API and update store
   */
  private loadSchemaDataFromAPI(orgId: string, dbId: string): void {
    // Dispatch loading action
    this.store.dispatch(
      ConfigPromptActions.loadSchemaData({
        orgId,
        dbId,
      })
    );

    const params = {
      orgId: this.sectionData.organisationId,
      databaseId: this.sectionData.databaseId,
    };

    this.databaseService
      .listDatabaseSchemas(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.staticSchemaData = response.data;
          this.schemas = this.staticSchemaData.map((schema: any) => ({
            name: schema.schema_name,
          }));

          // Dispatch success action to cache in store
          this.store.dispatch(
            ConfigPromptActions.loadSchemaDataSuccess({
              orgId,
              dbId,
              data: { schemas: response.data },
            })
          );

          this.isLoadingSchema = false;

          // After schema data is loaded, load config data
          this.loadConfigData();
        } else {
          // Dispatch failure action
          this.store.dispatch(
            ConfigPromptActions.loadSchemaDataFailure({
              orgId,
              dbId,
              error: 'Failed to load schema data',
            })
          );
          this.isLoadingSchema = false;
        }
      })
      .catch((error: any) => {
        // Dispatch failure action
        this.store.dispatch(
          ConfigPromptActions.loadSchemaDataFailure({
            orgId,
            dbId,
            error: error.message || 'Failed to load schema data',
          })
        );
        this.isLoadingSchema = false;
      });
  }

  loadConfigData() {
    this.promptService.getConfig(this.orgId, this.promptId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        // Fix #1: Add null check for configuration
        const config = response.data.configuration?.[0];
        if (!config) {
          console.warn('No configuration found for this prompt');
          return;
        }

        const values = response.data.values || [];
        this.configData = config;

        // First set the schema
        const schemaControl = this.promptForm.get('schema');
        schemaControl?.patchValue({ name: config.prompt_schema });

        // Parse and set tables - handles multiple tables like "departments(dep_d22),employee_projects(emp_178)"
        const tableStrings = config.prompt_table.split(',');
        const parsedTables: { tableName: string; alias: string }[] = [];

        tableStrings.forEach((tableStr: string) => {
          const tableMatch = tableStr.trim().match(/(.+?)\((.+?)\)/);
          if (tableMatch) {
            parsedTables.push({
              tableName: tableMatch[1],
              alias: tableMatch[2],
            });
          }
        });

        if (parsedTables.length > 0) {
          // Fix #9: Use synchronous reactive approach instead of timeout
          // Ensure schema data is loaded before proceeding
          if (!this.staticSchemaData || this.staticSchemaData.length === 0) {
            console.error(
              'Schema data not loaded. Cannot populate table columns.'
            );
            return;
          }

          // Manually populate tableColumns and availableColumns before patching form
          this.updateTableColumns(parsedTables);
          this.updateAvailableColumns(parsedTables);

          // Now patch all form values synchronously
          this.promptForm.patchValue(
            {
              tables: parsedTables,
              promptJoin: config.prompt_join,
              promptWhere: config.prompt_where,
              promptValues: values.map((v: any) => v.value),
            },
            { emitEvent: false } // Prevent triggering valueChanges that would clear data
          );

          // Set selected columns now that availableColumns is populated
          if (config.prompt_column) {
            const columnStrings = config.prompt_column
              .split(',')
              .map((c: string) => c.trim());
            const matchedColumns = this.availableColumns.filter((col: any) =>
              columnStrings.includes(col.fullName)
            );

            // If we found matches, use them; otherwise create column objects
            if (matchedColumns.length > 0) {
              this.promptForm.patchValue(
                { columns: matchedColumns },
                { emitEvent: false }
              );
            } else {
              // Fallback: create column objects manually
              const columnArray = columnStrings.map((col: string) => {
                const [alias, columnName] = col.split('.');
                return {
                  alias,
                  columnName,
                  fullName: col,
                  displayName: `${alias}.${columnName}`,
                };
              });
              this.promptForm.patchValue(
                { columns: columnArray },
                { emitEvent: false }
              );
            }
          }

          // Mark form as pristine since we just loaded saved data
          this.promptForm.markAsPristine();
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

      // Transform columns to alias.columnName format
      const transformedColumns = formValues.columns
        .map((col: any) => col.fullName)
        .join(',');

      // Auto-append value placeholder to WHERE condition if needed
      const formattedWhere = this.formatWhereCondition(formValues.promptWhere);

      const submitData = {
        ...formValues,
        tables: transformedTables,
        columns: transformedColumns,
        schema: formValues.schema.name,
        promptWhere: formattedWhere,
        promptSql: this.generateSqlPreview(),
      };

      this.promptService.configPrompt(submitData).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([PROMPT.LIST]);
        }
      });
    }
  }

  /**
   * Format WHERE condition - returns as-is
   * User manually types the complete condition including {value} placeholder
   * Example: o.status = '{value}' or o.status in ('{value}')
   */
  formatWhereCondition(condition: string): string {
    if (!condition) return condition;
    return condition.trim();
  }

  onCancel(): void {
    if (this.isFormDirty) {
      // Fix #6: Reset schema to null instead of empty string
      this.promptForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        organisation: this.sectionData.organisationId,
        database: this.sectionData.databaseId,
        tab: this.sectionData.section.tab.id,
        section: this.sectionData.section.id,
        schema: null,
        tables: [],
        columns: [],
        promptJoin: '',
        promptWhere: '',
        promptValues: [],
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

  /**
   * Check if the current prompt type is a range type (requires startValue and endValue)
   */
  isRangeType(): boolean {
    return (
      this.selectedPromptType === 'daterange' ||
      this.selectedPromptType === 'rangeslider'
    );
  }

  /**
   * Check if the current prompt type is a multi-value type (can select multiple values)
   */
  isMultiValueType(): boolean {
    return (
      this.selectedPromptType === 'checkbox' ||
      this.selectedPromptType === 'multiselect'
    );
  }

  onWhereConditionInput(event: any) {
    const value = event.target.value;
    const lastDotIndex = value.lastIndexOf('.');
    const selectedTables = this.promptForm.get('tables')?.value || [];

    // Clear any pending hide delay
    if (this.hideDelay) {
      clearTimeout(this.hideDelay);
      this.hideDelay = null;
    }

    if (lastDotIndex !== -1) {
      const beforeDot = value.substring(0, lastDotIndex).trim();
      const afterDot = value.substring(lastDotIndex + 1);

      // Close suggestions if afterDot contains space, operator, or quote
      // (meaning user has completed the column name)
      if (/[\s=<>!(),'"]+/.test(afterDot)) {
        this.showSuggestions = false;
        this.currentAlias = '';
        return;
      }

      const filterText = afterDot.toLowerCase();

      // Track current alias for no-results message
      this.currentAlias = beforeDot;

      // For single table, force the current table's alias
      if (selectedTables.length === 1) {
        const currentAlias = selectedTables[0].alias;
        if (beforeDot !== currentAlias) {
          event.target.value = `${currentAlias}.${afterDot}`;
          this.currentAlias = currentAlias;
          return;
        }
      }

      // For multiple tables, check if the alias is from selected tables
      if (selectedTables.length > 1) {
        const validAliases = selectedTables.map((t: any) => t.alias);
        if (!validAliases.includes(beforeDot)) {
          // Show no-results state for invalid alias
          this.filteredColumns = [];
          this.showSuggestions = true;
          return;
        }
      }

      // Show column suggestions for valid alias
      if (this.tableColumns[beforeDot]) {
        this.filteredColumns = this.tableColumns[beforeDot].filter(column =>
          column.name.toLowerCase().includes(filterText)
        );
        this.showSuggestions = true;
        this.selectedSuggestionIndex = this.filteredColumns.length > 0 ? 0 : -1;
      } else {
        this.filteredColumns = [];
        this.showSuggestions = true;
      }
    } else {
      this.showSuggestions = false;
      this.currentAlias = '';
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

    // Only insert the column name - user will add operator, {value} added on submit
    const newValue = `${beforeDot}.${column.name} `;

    this.promptForm.patchValue({ promptWhere: newValue });
    this.showSuggestions = false;
    this.currentAlias = '';
  }

  /**
   * Hide suggestions with a small delay to allow click events to fire
   */
  hideSuggestionsDelayed(): void {
    this.hideDelay = setTimeout(() => {
      this.showSuggestions = false;
      this.currentAlias = '';
    }, 150);
  }

  /**
   * Handle focus on WHERE input - reshow suggestions if alias is present
   */
  onWhereFocus(event: any): void {
    // Clear any pending hide
    if (this.hideDelay) {
      clearTimeout(this.hideDelay);
      this.hideDelay = null;
    }

    // Trigger re-check for suggestions
    const value = event.target.value;
    if (value.includes('.')) {
      this.onWhereConditionInput(event);
    }
  }

  // ===== JOIN Autocomplete Methods =====

  /**
   * Handle input in JOIN condition field
   */
  onJoinConditionInput(event: any): void {
    const value = event.target.value;
    const cursorPosition = event.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);

    // Find the last alias.column pattern before cursor
    const lastDotIndex = textBeforeCursor.lastIndexOf('.');

    // Clear any pending hide delay
    if (this.hideJoinDelay) {
      clearTimeout(this.hideJoinDelay);
      this.hideJoinDelay = null;
    }

    if (lastDotIndex !== -1) {
      // Find start of the alias (look back from dot for word characters)
      let aliasStart = lastDotIndex - 1;
      while (aliasStart >= 0 && /\w/.test(textBeforeCursor[aliasStart])) {
        aliasStart--;
      }
      aliasStart++;

      const alias = textBeforeCursor.substring(aliasStart, lastDotIndex);
      const afterDot = textBeforeCursor.substring(lastDotIndex + 1);

      // Close suggestions if afterDot contains space, operator, or quote
      // (meaning user has completed the column name)
      if (/[\s=<>!(),'"]+/.test(afterDot)) {
        this.showJoinSuggestions = false;
        this.currentJoinAlias = '';
        return;
      }

      const filterText = afterDot.toLowerCase();

      // Track current alias for no-results message
      this.currentJoinAlias = alias;

      // Check if alias is from selected tables
      const selectedTables = this.promptForm.get('tables')?.value || [];
      const validAliases = selectedTables.map((t: any) => t.alias);

      if (validAliases.includes(alias)) {
        // Show column suggestions for valid alias
        if (this.tableColumns[alias]) {
          this.filteredJoinColumns = this.tableColumns[alias].filter(column =>
            column.name.toLowerCase().includes(filterText)
          );
          this.showJoinSuggestions = true;
          this.selectedJoinSuggestionIndex =
            this.filteredJoinColumns.length > 0 ? 0 : -1;
        } else {
          this.filteredJoinColumns = [];
          this.showJoinSuggestions = true;
        }
      } else {
        // Show no-results state for invalid alias
        this.filteredJoinColumns = [];
        this.showJoinSuggestions = true;
      }
    } else {
      this.showJoinSuggestions = false;
      this.currentJoinAlias = '';
    }
  }

  /**
   * Handle keyboard navigation for JOIN suggestions
   */
  onJoinKeydown(event: KeyboardEvent): void {
    if (!this.showJoinSuggestions) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedJoinSuggestionIndex = Math.min(
          this.selectedJoinSuggestionIndex + 1,
          Math.min(this.filteredJoinColumns.length - 1, this.maxSuggestions - 1)
        );
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedJoinSuggestionIndex = Math.max(
          this.selectedJoinSuggestionIndex - 1,
          0
        );
        break;

      case 'Enter':
        if (this.selectedJoinSuggestionIndex >= 0) {
          event.preventDefault();
          this.selectJoinSuggestion(
            this.filteredJoinColumns[this.selectedJoinSuggestionIndex]
          );
        }
        break;

      case 'Escape':
        this.showJoinSuggestions = false;
        break;
    }
  }

  /**
   * Select a column for JOIN condition
   */
  selectJoinSuggestion(column: any): void {
    const input = document.getElementById('promptJoin') as HTMLInputElement;
    if (!input) return;

    const value = input.value;
    const cursorPosition = input.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const textAfterCursor = value.substring(cursorPosition);

    // Find the alias before the dot
    const lastDotIndex = textBeforeCursor.lastIndexOf('.');
    let aliasStart = lastDotIndex - 1;
    while (aliasStart >= 0 && /\w/.test(textBeforeCursor[aliasStart])) {
      aliasStart--;
    }
    aliasStart++;

    const beforeAlias = textBeforeCursor.substring(0, aliasStart);
    const alias = textBeforeCursor.substring(aliasStart, lastDotIndex);

    // Build new value with selected column
    const newValue = `${beforeAlias}${alias}.${column.name}${textAfterCursor}`;

    this.promptForm.patchValue({ promptJoin: newValue });
    this.showJoinSuggestions = false;
    this.currentJoinAlias = '';

    // Set cursor position after the inserted column
    setTimeout(() => {
      const newCursorPos =
        beforeAlias.length + alias.length + 1 + column.name.length;
      input.setSelectionRange(newCursorPos, newCursorPos);
      input.focus();
    }, 0);
  }

  /**
   * Hide JOIN suggestions with delay
   */
  hideJoinSuggestionsDelayed(): void {
    this.hideJoinDelay = setTimeout(() => {
      this.showJoinSuggestions = false;
      this.currentJoinAlias = '';
    }, 150);
  }

  /**
   * Handle focus on JOIN input
   */
  onJoinFocus(event: any): void {
    if (this.hideJoinDelay) {
      clearTimeout(this.hideJoinDelay);
      this.hideJoinDelay = null;
    }

    const value = event.target.value;
    if (value.includes('.')) {
      this.onJoinConditionInput(event);
    }
  }

  private updateTableColumns(selectedTables: any[]) {
    // Clear previous table columns
    this.tableColumns = {};

    // Get current schema
    const currentSchema = this.promptForm.get('schema')?.value?.name;
    if (!currentSchema) {
      console.warn('updateTableColumns: No schema selected');
      return;
    }

    const schemaData = this.staticSchemaData.find(
      schema => schema.schema_name === currentSchema
    );

    if (!schemaData) {
      console.warn(
        `updateTableColumns: Schema '${currentSchema}' not found in staticSchemaData`
      );
      return;
    }

    if (schemaData) {
      selectedTables.forEach((selectedTable: any) => {
        const table = schemaData.tables.find(
          (t: any) => t.table_name === selectedTable.tableName
        );
        if (table) {
          // Fix #10: Store columns for the selected table's custom alias
          // This ensures autocomplete works with user-defined aliases from saved configs
          this.tableColumns[selectedTable.alias] = table.columns;
        } else {
          console.warn(
            `updateTableColumns: Table '${selectedTable.tableName}' not found in schema '${currentSchema}'`
          );
        }
      });
    }
  }

  /**
   * Update available columns based on selected tables
   */
  private updateAvailableColumns(selectedTables: any[]) {
    this.availableColumns = [];

    if (!selectedTables || selectedTables.length === 0) {
      return;
    }

    // Get current schema
    const currentSchema = this.promptForm.get('schema')?.value?.name;
    if (!currentSchema) {
      console.warn('updateAvailableColumns: No schema selected');
      return;
    }

    const schemaData = this.staticSchemaData.find(
      schema => schema.schema_name === currentSchema
    );

    if (!schemaData) {
      console.warn(
        `updateAvailableColumns: Schema '${currentSchema}' not found in staticSchemaData`
      );
      return;
    }

    if (schemaData) {
      selectedTables.forEach((selectedTable: any) => {
        const table = schemaData.tables.find(
          (t: any) => t.table_name === selectedTable.tableName
        );
        if (table && table.columns) {
          // Add columns with custom alias prefix for proper column selection
          table.columns.forEach((column: any) => {
            this.availableColumns.push({
              alias: selectedTable.alias,
              columnName: column.name,
              columnType: column.type,
              fullName: `${selectedTable.alias}.${column.name}`,
              displayName: `${selectedTable.alias}.${column.name}`,
            });
          });
        } else if (!table) {
          console.warn(
            `updateAvailableColumns: Table '${selectedTable.tableName}' not found in schema '${currentSchema}'`
          );
        }
      });
    }
  }

  /**
   * Handle column selection when tables change
   * Remove columns that belong to deselected tables
   */
  private handleColumnsOnTableChange(selectedTables: any[]) {
    const currentSelectedColumns = this.promptForm.get('columns')?.value || [];

    if (currentSelectedColumns.length === 0) {
      return;
    }

    // Get aliases of currently selected tables
    const currentAliases = selectedTables.map((t: any) => t.alias);

    // Filter out columns that belong to deselected tables
    const validColumns = currentSelectedColumns.filter((col: any) =>
      currentAliases.includes(col.alias)
    );

    // Update form only if columns were removed
    if (validColumns.length !== currentSelectedColumns.length) {
      this.promptForm.patchValue(
        { columns: validColumns },
        { emitEvent: false }
      );
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

  /**
   * Open SQL query dialog
   */
  openSqlDialog(): void {
    this.showSqlDialog = true;
  }

  /**
   * Close SQL query dialog
   */
  closeSqlDialog(): void {
    this.showSqlDialog = false;
  }

  /**
   * Open dropdown configuration dialog
   */
  openDropdownConfigDialog(): void {
    this.showDropdownConfigDialog = true;
  }

  /**
   * Handle dropdown config saved
   */
  onDropdownConfigSaved(config: any): void {
    this.dropdownConfig = config;
    this.showDropdownConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open multiselect configuration dialog
   */
  openMultiselectConfigDialog(): void {
    this.showMultiselectConfigDialog = true;
  }

  /**
   * Handle multiselect config saved
   */
  onMultiselectConfigSaved(config: any): void {
    this.multiselectConfig = config;
    this.showMultiselectConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open checkbox configuration dialog
   */
  openCheckboxConfigDialog(): void {
    this.showCheckboxConfigDialog = true;
  }

  /**
   * Handle checkbox config saved
   */
  onCheckboxConfigSaved(config: any): void {
    this.checkboxConfig = config;
    this.showCheckboxConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open radio configuration dialog
   */
  openRadioConfigDialog(): void {
    this.showRadioConfigDialog = true;
  }

  /**
   * Handle radio config saved
   */
  onRadioConfigSaved(config: any): void {
    this.radioConfig = config;
    this.showRadioConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open text configuration dialog
   */
  openTextConfigDialog(): void {
    this.showTextConfigDialog = true;
  }

  /**
   * Handle text config saved
   */
  onTextConfigSaved(config: any): void {
    this.textConfig = config;
    this.showTextConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open number configuration dialog
   */
  openNumberConfigDialog(): void {
    this.showNumberConfigDialog = true;
  }

  /**
   * Handle number config saved
   */
  onNumberConfigSaved(config: any): void {
    this.numberConfig = config;
    this.showNumberConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open date configuration dialog
   */
  openDateConfigDialog(): void {
    this.showDateConfigDialog = true;
  }

  /**
   * Handle date config saved
   */
  onDateConfigSaved(config: any): void {
    this.dateConfig = config;
    this.showDateConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open date range configuration dialog
   */
  openDateRangeConfigDialog(): void {
    this.showDateRangeConfigDialog = true;
  }

  /**
   * Handle date range config saved
   */
  onDateRangeConfigSaved(config: any): void {
    this.dateRangeConfig = config;
    this.showDateRangeConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open calendar configuration dialog
   */
  openCalendarConfigDialog(): void {
    this.showCalendarConfigDialog = true;
  }

  /**
   * Handle calendar config saved
   */
  onCalendarConfigSaved(config: any): void {
    this.calendarConfig = config;
    this.showCalendarConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Open range slider configuration dialog
   */
  openRangeSliderConfigDialog(): void {
    this.showRangeSliderConfigDialog = true;
  }

  /**
   * Handle range slider config saved
   */
  onRangeSliderConfigSaved(config: any): void {
    this.rangeSliderConfig = config;
    this.showRangeSliderConfigDialog = false;
    this.promptForm.markAsDirty();
  }

  /**
   * Check if current prompt type is configurable (has a config dialog)
   */
  isConfigurable(): boolean {
    const configurableTypes = [
      'dropdown',
      'multiselect',
      'checkbox',
      'radio',
      'text',
      'number',
      'date',
      'daterange',
      'calendar',
      'rangeslider'
    ];
    return configurableTypes.includes(this.selectedPromptType);
  }

  /**
   * Open config dialog based on prompt type
   */
  openConfigDialog(): void {
    switch (this.selectedPromptType) {
      case 'dropdown':
        this.openDropdownConfigDialog();
        break;
      case 'multiselect':
        this.openMultiselectConfigDialog();
        break;
      case 'checkbox':
        this.openCheckboxConfigDialog();
        break;
      case 'radio':
        this.openRadioConfigDialog();
        break;
      case 'text':
        this.openTextConfigDialog();
        break;
      case 'number':
        this.openNumberConfigDialog();
        break;
      case 'date':
        this.openDateConfigDialog();
        break;
      case 'daterange':
        this.openDateRangeConfigDialog();
        break;
      case 'calendar':
        this.openCalendarConfigDialog();
        break;
      case 'rangeslider':
        this.openRangeSliderConfigDialog();
        break;
    }
  }

  /**
   * Execute SQL query to fetch prompt values
   */
  executeSqlQuery(query: string): void {
    if (!query.trim()) {
      return;
    }

    if (this.sqlDialogComponent) {
      this.sqlDialogComponent.setError('');
    }

    const params = {
      orgId: this.sectionData.organisationId,
      databaseId: this.sectionData.databaseId,
      query: query.trim(),
    };

    this.promptService.getPromptValuesBySQL(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const results = response.data.columnValues;

        // API returns array of strings directly
        const newValues: string[] = [];
        if (results && Array.isArray(results) && results.length > 0) {
          results.forEach((value: any) => {
            // Handle both string values and potential objects
            if (typeof value === 'string' || typeof value === 'number') {
              newValues.push(String(value));
            } else if (typeof value === 'object' && value !== null) {
              // Fallback: if it's an object, get first column value
              const firstKey = Object.keys(value)[0];
              if (firstKey && value[firstKey] != null) {
                newValues.push(String(value[firstKey]));
              }
            }
          });
        }

        if (newValues.length > 0) {
          // Replace previous values with new values from query
          this.promptForm.patchValue({
            promptValues: newValues,
            promptValueSQL: response.data.query,
          });

          this.closeSqlDialog();
        } else {
          if (this.sqlDialogComponent) {
            this.sqlDialogComponent.setError('Query returned no results');
          }
        }
      }
    });
  }

  // ===== Live SQL Preview Methods =====

  /**
   * Generate SQL preview based on form values
   */
  generateSqlPreview(): string {
    const selectedTables = this.promptForm.get('tables')?.value || [];
    const selectedColumns = this.promptForm.get('columns')?.value || [];
    const schema = this.promptForm.get('schema')?.value?.name || 'schema';
    const joinCondition = this.promptForm.get('promptJoin')?.value || '';
    const whereCondition = this.promptForm.get('promptWhere')?.value || '';

    if (selectedTables.length === 0) {
      return '-- Select tables to see preview';
    }

    // Build SELECT clause with selected columns or *
    let sql = '';
    if (selectedColumns.length > 0) {
      const columnList = selectedColumns
        .map((col: any) => col.fullName)
        .join(', ');
      sql = `SELECT ${columnList}\n`;
    } else {
      sql = 'SELECT *\n';
    }

    // FROM clause with first table
    const firstTable = selectedTables[0];
    sql += `FROM ${schema}.${firstTable.tableName} ${firstTable.alias}`;

    // JOIN clauses for additional tables
    if (selectedTables.length > 1) {
      for (let i = 1; i < selectedTables.length; i++) {
        const table = selectedTables[i];
        sql += `\nJOIN ${schema}.${table.tableName} ${table.alias}`;
      }

      // Add ON clause if join condition exists
      if (joinCondition) {
        sql += `\n  ON ${joinCondition}`;
      } else {
        sql += '\n  ON <join_condition>';
      }
    }

    // WHERE clause - format with value placeholder for preview
    // Apply formatting in real-time as user types operator
    if (whereCondition) {
      const formattedWhere =
        this.formatWhereConditionForPreview(whereCondition);
      sql += `\nWHERE ${formattedWhere}`;
    } else if (selectedTables.length > 0) {
      sql += '\nWHERE <where_condition>';
    }

    return sql;
  }

  /**
   * Format WHERE condition for live preview - returns as-is
   * User types the complete condition including {value} placeholder
   */
  formatWhereConditionForPreview(condition: string): string {
    if (!condition) return condition;
    return condition.trim();
  }

  /**
   * Copy SQL preview to clipboard
   */
  copySqlToClipboard(): void {
    const sql = this.generateSqlPreview();
    navigator.clipboard
      .writeText(sql)
      .then(() => {
        // Show success message (you can use MessageService if available)
        console.log('SQL copied to clipboard');
      })
      .catch(err => {
        console.error('Failed to copy SQL:', err);
      });
  }

  refreshPromptValues() {
    if (!this.promptId) {
      return;
    }

    const params = {
      orgId: this.orgId,
      databaseId: this.promptForm.get('database')?.value,
      promptId: this.promptId,
    };

    this.promptService
      .refreshPromptValuesBySQL(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          const results = response.data.columnValues;

          // API returns array of strings directly
          const newValues: string[] = [];
          if (Array.isArray(results)) {
            results.forEach((item: any) => {
              if (typeof item === 'string') {
                newValues.push(item);
              } else if (typeof item === 'object') {
                const firstValue = Object.values(item)[0];
                if (firstValue !== undefined && firstValue !== null) {
                  newValues.push(String(firstValue));
                }
              }
            });
          }

          if (newValues.length > 0) {
            this.promptForm.patchValue({
              promptValues: newValues,
              promptValueSQL: response.data.query,
            });
          }
        }
      })
      .catch(() => {});
  }
}
