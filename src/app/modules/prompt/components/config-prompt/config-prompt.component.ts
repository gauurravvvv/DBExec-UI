import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { first } from 'rxjs/operators';
import { PROMPT } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { PROMPT_TYPES } from '../../constants/prompt.constant';
import { PromptService } from '../../services/prompt.service';
import {
  ConfigPromptActions,
  selectIsSchemaStale,
  selectSchemaByKey,
} from '../../store';
import { SqlQueryDialogComponent } from '../sql-query-dialog/sql-query-dialog.component';

@Component({
  selector: 'app-config-prompt',
  templateUrl: './config-prompt.component.html',
  styleUrls: ['./config-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigPromptComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  promptForm!: FormGroup;
  promptId: string = '';
  selectedPromptType: string = '';
  showAddPromptValues: boolean = false;
  selectedDatasourceName: string = '';
  selectedTabName: string = '';
  selectedSectionName: string = '';
  sectionData: any = null;
  sections: any[] = [];
  isCancelClicked = false;
  schemas: any[] = [];
  tables: { [key: string]: any[] } = {};
  staticSchemaData: any[] = [];

  // Structured multi-hop joins built by <prompt-join-builder>. Emitted as the
  // compiler's join_edges shape and saved alongside the config. Empty = the
  // prompt filters on a base-table column (no join needed).
  joinEdges: any[] = [];
  // Seed for the builder when editing an existing config (join_edges from the
  // stored PromptConfig).
  initialJoinEdges: any[] | null = null;
  // The columns reachable across the base + all joined tables, for the
  // WHERE/column pickers (alias-qualified).
  reachableColumns: {
    label: string;
    value: string;
    schema: string;
    table: string;
    alias: string;
    column: string;
  }[] = [];
  // ── Guided wizard state (mirrors the Add Alert stepper idiom) ───────────
  // Custom step index + per-step validity gates on Next, same pattern as
  // add-alert / add-organisation. Steps are chunked views over ONE reactive
  // form — no logic change, just navigation.
  readonly steps: { key: string; titleKey: string; icon: string }[] = [
    { key: 'source', titleKey: 'PROMPT_MODULE.STEP_SOURCE', icon: 'pi-database' },
    { key: 'joins', titleKey: 'PROMPT_MODULE.STEP_JOINS', icon: 'pi-sitemap' },
    { key: 'filter', titleKey: 'PROMPT_MODULE.STEP_FILTER', icon: 'pi-filter' },
    { key: 'values', titleKey: 'PROMPT_MODULE.STEP_VALUES', icon: 'pi-list' },
    { key: 'review', titleKey: 'PROMPT_MODULE.STEP_REVIEW', icon: 'pi-check-circle' },
  ];
  readonly lastStep = 4;
  currentStep = 0;

  /** Prompt-metadata (Name/Type/Datasource) info popover in the header. */
  showMeta = false;

  // Structured filter (replaces the free-text WHERE box). One prompt = one
  // filter comparison on one column: the compiler builds `filterExpr <op> :val`.
  filterColumn = ''; // alias-qualified, e.g. "reg.name" — from reachableColumns
  operator = ''; // a filter_operator code from the reference-data catalog

  separator: string = ','; // Use comma as separator
  editingChipIndex: number = -1;
  editingChipValue: string | null = null;
  @ViewChild('chipInput') chipInput!: ElementRef;
  saving = this.promptService.saving;
  // Local flag for the SQL-query dialog's Execute button so it can
  // show a spinner while getPromptValuesBySQL is in flight. Tracked
  // separately from `saving` (which covers updateAppearance) because
  // both can run concurrently.
  sqlExecuting = false;
  configData: any = null;
  columnNameControl = new FormControl('');
  showSuggestions = false;
  filteredColumns: any[] = [];
  selectedSuggestionIndex = -1;
  tableColumns: { [key: string]: any[] } = {};
  isLoadingSchema = false;
  availableColumns: any[] = [];
  cachedAvailableTables: any[] = [];

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

  // ── Appearance & Operators (inline prompt-appearance-form) ──────────────
  // The stored appearance object, seeded from GET /prompts/:id/appearance and
  // fed to <prompt-appearance-form>. The validated object it emits is held in
  // `pendingAppearance` and persisted alongside the config on Save.
  loadedAppearance: Record<string, any> | null = null;
  pendingAppearance: Record<string, any> | null = null;
  appearanceErrors: string[] = [];
  // Allowed-operators picker options. The query-builder condition system reads
  // the same DB-driven `filter_operator` family (its meta contract is owned by
  // QB), so we reuse it here for the prompt's allowed-operators list.
  operatorOptions: { label: string; value: string }[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private promptService: PromptService,
    private datasourceService: DatasourceService,
    private referenceData: ReferenceDataService,
    private store: Store,
  ) {
    this.initForm();
    this.setupColumnNameSync();
  }

  ngOnInit(): void {
    this.promptId = this.route.snapshot.params['id'];

    // DB-driven operator catalog for the appearance form's allowed-operators
    // picker. Same `filter_operator` family the query-builder condition rows
    // use. Degrades to [] if the fetch fails (the form handles an empty list).
    this.referenceData
      .getOptions('filter_operator')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(options => {
        this.operatorOptions = options;
        this.cdr.markForCheck();
      });

    if (this.promptId) {
      this.loadPromptData();
    }

    this.promptForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  get isFormDirty(): boolean {
    return this.promptForm.dirty;
  }

  // ── Wizard navigation (mirrors add-alert) ───────────────────────────────
  /** True when this prompt type needs a value list (dropdown/select/etc.). */
  private get typeNeedsValues(): boolean {
    const t = (this.selectedPromptType || '').toLowerCase();
    return ['dropdown', 'multiselect', 'checkbox', 'radio'].includes(t);
  }

  /** Does the current table selection require a join to be valid? */
  private get multiTableNeedsJoin(): boolean {
    const tables = this.promptForm.get('tables')?.value || [];
    // A multi-table selection is only valid once the structured join builder
    // has produced at least one edge. Single table needs no join.
    if (tables.length <= 1) return false;
    return !this.joinEdges?.length;
  }

  /**
   * Per-step validity gate. Only the controls owned by `step` are checked so
   * Next unlocks progressively — the underlying form + validators are unchanged.
   */
  isStepValid(step: number): boolean {
    switch (step) {
      case 0: // Source: schema + at least one table
        return (
          !!this.promptForm.get('schema')?.valid &&
          (this.promptForm.get('tables')?.value?.length ?? 0) > 0
        );
      case 1: // Joins: optional; only invalid if a multi-table selection lacks a join
        return !this.multiTableNeedsJoin;
      case 2: // Column & filter: at least one column selected
        return (this.promptForm.get('columns')?.value?.length ?? 0) > 0;
      case 3: // Values: required only for value-list types
        return (
          !this.typeNeedsValues ||
          (this.promptForm.get('promptValues')?.value?.length ?? 0) > 0
        );
      case 4: // Review: whole-form gate
        return this.canSave;
      default:
        return false;
    }
  }

  /** Save allowed only when the full config is valid AND the user changed something. */
  get canSave(): boolean {
    return this.promptForm.valid && this.isFormDirty && !this.multiTableNeedsJoin;
  }

  nextStep(): void {
    if (this.currentStep < this.lastStep && this.isStepValid(this.currentStep)) {
      this.currentStep++;
      this.cdr.markForCheck();
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.cdr.markForCheck();
    }
  }

  /** Jump backward freely; forward only if every step up to the target is valid. */
  onStepClick(step: number): void {
    if (step <= this.currentStep) {
      this.currentStep = step;
      this.cdr.markForCheck();
      return;
    }
    for (let i = this.currentStep; i < step; i++) {
      if (!this.isStepValid(i)) return;
    }
    this.currentStep = step;
    this.cdr.markForCheck();
  }

  trackByIndex(index: number): number {
    return index;
  }

  /** Admin picked the column this prompt filters on (from reachable columns). */
  onFilterColumnChange(value: string): void {
    this.filterColumn = value || '';
    this.promptForm.markAsDirty();
    this.cdr.markForCheck();
  }

  /** Admin picked the comparison operator (filter_operator catalog code). */
  onOperatorChange(value: string): void {
    this.operator = value || '';
    this.promptForm.markAsDirty();
    this.cdr.markForCheck();
  }

  /** Toggle the header metadata popover (Name/Type/Datasource). */
  toggleMeta(event: MouseEvent): void {
    event.stopPropagation();
    this.showMeta = !this.showMeta;
  }

  /** Close the metadata popover on any outside click. */
  @HostListener('document:click')
  onDocClick(): void {
    if (this.showMeta) {
      this.showMeta = false;
      this.cdr.markForCheck();
    }
  }

  /** Close the metadata popover on Escape. */
  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.showMeta) {
      this.showMeta = false;
      this.cdr.markForCheck();
    }
  }

  initForm(): void {
    this.promptForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      datasource: [''],
      tab: [''],
      section: [''],
      schema: ['', Validators.required],
      tables: [[], Validators.required],
      columns: [[], Validators.required],
      promptJoin: [''],
      // WHERE is optional: Query Builder v2 generates the filter from the
      // operator catalog at compose time, so a static per-prompt WHERE template
      // is no longer mandatory (mirrors the BE configurePrompt validation).
      promptWhere: [''],
      promptValues: [[]], // Initially no validation
      type: [''],
      promptValueSQL: [''],
    });

    this.promptForm
      .get('schema')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
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
            { emitEvent: false },
          );

          // Reset available columns and table columns
          this.availableColumns = [];
          this.tableColumns = {};

          // Load tables for the new schema (async; sets cachedAvailableTables
          // itself once the API returns — don't read it synchronously here).
          void this.loadTablesForSchema(schema.name);
        }
      });

    // Fix #5: Changed from 'promptType' to 'type' (correct form control name)
    // Fix #8: Also sync selectedPromptType when type changes
    this.promptForm
      .get('type')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(type => {
        this.selectedPromptType = type;
        const promptValuesControl = this.promptForm.get('promptValues');
        const typeLC = (type || '').toLowerCase();
        if (['dropdown', 'multiselect', 'checkbox', 'radio'].includes(typeLC)) {
          promptValuesControl?.setValidators([Validators.required]);
        } else {
          promptValuesControl?.clearValidators();
        }
        promptValuesControl?.updateValueAndValidity();
      });

    this.promptForm
      .get('tables')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tables => {
        // Clear where condition when tables change
        this.promptForm.get('promptWhere')?.setValue('');

        // Reset suggestions
        this.showSuggestions = false;
        this.filteredColumns = [];

        // Lazily fetch the selected tables' columns from the API, then prune
        // any previously-selected columns that belong to a now-deselected table.
        void this.loadColumnsForSelectedTables(tables).then(() => {
          this.handleColumnsOnTableChange(tables);
        });

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
    this.columnNameControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(columnName => {
        if (columnName) {
          const tableAlias = this.getSelectedTableAlias();
          const value =
            this.selectedPromptType === 'dropdown'
              ? `${tableAlias}.${columnName} = '{value}'`
              : `${tableAlias}.${columnName} in ('{value}')`;
          this.promptForm.patchValue(
            { promptWhere: value },
            { emitEvent: false },
          );
        }
      });
  }

  getSelectedTableAlias(): string {
    const selectedTables = this.promptForm.get('tables')?.value || [];
    return selectedTables[0]?.alias || 't1';
  }

  loadPromptData(): void {
    this.promptService.resetCurrent();
    this.promptService
      .loadOne(this.promptId)
      .then(() => {
        const data = this.promptService.current();
        if (data) {
          this.sectionData = data;

          // Set basic prompt data. v2 prompts are datasource-scoped: the
          // tab/section relations were removed, so guard those reads.
          this.promptForm.patchValue({
            id: this.sectionData.id,
            name: this.sectionData.name,
            datasource: this.sectionData.datasourceId,
            tab: this.sectionData.section?.tab?.id ?? '',
            section: this.sectionData.section?.id ?? '',
            type: PROMPT_TYPES.find(
              type => type.value === this.sectionData.type,
            )?.label,
          });

          // Set display names
          this.selectedDatasourceName = this.sectionData.datasource?.name || '';
          this.selectedTabName = this.sectionData.section?.tab?.name || '';
          this.selectedSectionName = this.sectionData.section?.name || '';
          this.selectedPromptType = this.sectionData.type || '';

          // Load the stored appearance for the inline appearance form.
          this.loadAppearance();

          // Set prompt type validations
          this.showAddPromptValues =
            this.selectedPromptType === 'dropdown' ||
            this.selectedPromptType === 'multiselect' ||
            this.selectedPromptType === 'checkbox' ||
            this.selectedPromptType === 'radio';

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
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadSchemaData() {
    const dbId = this.sectionData.datasourceId.toString();

    this.isLoadingSchema = true;

    // Check if we have cached data in the store
    this.store
      .select(selectSchemaByKey(dbId))
      .pipe(first())
      .subscribe(cachedEntry => {
        if (cachedEntry && cachedEntry.data) {
          // Check if data is stale
          this.store
            .select(selectIsSchemaStale(dbId))
            .pipe(first())
            .subscribe(isStale => {
              if (isStale) {
                // Data is stale, refresh from API
                this.loadSchemaDataFromAPI(dbId);
              } else {
                // Use cached data
                this.applyCachedSchemaData(cachedEntry.data);
              }
            });
        } else {
          // No cached data, load from API
          this.loadSchemaDataFromAPI(dbId);
        }
      });
  }

  /**
   * Apply cached schema data from store
   */
  private applyCachedSchemaData(schemaData: any): void {
    // The store contains transformed DatasourceSchema format
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
    this.cdr.markForCheck();

    // After schema data is loaded, load config data
    this.loadConfigData();
  }

  /**
   * Load schema data from API and update store
   */
  private loadSchemaDataFromAPI(dbId: string): void {
    // Dispatch loading action
    this.store.dispatch(
      ConfigPromptActions.loadSchemaData({
        dbId,
      }),
    );

    const params = {
      datasourceId: this.sectionData.datasourceId,
    };

    this.datasourceService
      .listDatasourceSchemas(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.staticSchemaData = response.data;
          this.schemas = this.staticSchemaData.map((schema: any) => ({
            name: schema.schema_name,
          }));

          // Dispatch success action to cache in store
          this.store.dispatch(
            ConfigPromptActions.loadSchemaDataSuccess({
              dbId,
              data: { schemas: response.data },
            }),
          );

          this.isLoadingSchema = false;
          this.cdr.markForCheck();

          // After schema data is loaded, load config data
          this.loadConfigData();
        } else {
          // Dispatch failure action
          this.store.dispatch(
            ConfigPromptActions.loadSchemaDataFailure({
              dbId,
              error: 'Failed to load schema data',
            }),
          );
          this.isLoadingSchema = false;
          this.cdr.markForCheck();
        }
      })
      .catch((error: any) => {
        // Dispatch failure action
        this.store.dispatch(
          ConfigPromptActions.loadSchemaDataFailure({
            dbId,
            error: error.message || 'Failed to load schema data',
          }),
        );
        this.isLoadingSchema = false;
        this.cdr.markForCheck();
      });
  }

  async loadConfigData() {
    this.promptService.resetConfig();
    await this.promptService.loadConfig(this.promptId);
    const response = this.promptService.config();
    if (response) {
      const config = response.configuration;
      if (!config) {
        this.cdr.markForCheck();
        return;
      }

      const values = response.values || [];
      this.configData = config;

      // Seed the structured join builder from the stored join_edges (edit flow).
      const savedEdges = (config as any).join_edges;
      this.initialJoinEdges = Array.isArray(savedEdges) ? savedEdges : [];
      this.joinEdges = this.initialJoinEdges;

      // Seed the structured filter (column + operator) from the stored config.
      this.filterColumn =
        (config as any).filter_expr || (config as any).select_expr || '';
      this.operator = (config as any).operator || '';

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
        // Lazy backfill: fetch this schema's table list (so the tables
        // multiselect has matching options) AND each saved table's columns
        // from the API BEFORE patching, keyed by the SAVED alias. The old
        // nested `staticSchemaData` is empty now (schema list is names-only).
        await this.loadTablesForSchema(config.prompt_schema);

        // The saved tables carry their own persisted aliases (e.g. dep_d22),
        // which won't match the client-generated aliases in the freshly-fetched
        // options. Merge the saved {tableName, alias} pairs in as options so the
        // multiselect shows them selected (dedupe by tableName+alias).
        const savedAsOptions = parsedTables.map(t => ({
          name: `${t.tableName}(${t.alias})`,
          value: { tableName: t.tableName, alias: t.alias },
        }));
        const seen = new Set(
          this.cachedAvailableTables.map(
            (o: any) => `${o.value.tableName}|${o.value.alias}`,
          ),
        );
        savedAsOptions.forEach(o => {
          const k = `${o.value.tableName}|${o.value.alias}`;
          if (!seen.has(k)) {
            this.cachedAvailableTables = [...this.cachedAvailableTables, o];
            seen.add(k);
          }
        });

        const nextTableColumns: { [alias: string]: any[] } = {};
        const nextAvailable: any[] = [];
        for (const t of parsedTables) {
          const cols = await this.fetchColumnsFor(
            config.prompt_schema,
            t.tableName,
          );
          nextTableColumns[t.alias] = cols;
          cols.forEach((column: any) => {
            nextAvailable.push({
              alias: t.alias,
              columnName: column.name,
              columnType: column.type,
              fullName: `${t.alias}.${column.name}`,
              displayName: `${t.alias}.${column.name}`,
            });
          });
        }
        this.tableColumns = nextTableColumns;
        this.availableColumns = nextAvailable;

        // Now patch all form values synchronously
        this.promptForm.patchValue(
          {
            tables: parsedTables,
            promptJoin: config.prompt_join,
            promptWhere: config.prompt_where,
            promptValues: values.map((v: any) => ({
              id: v.id,
              value: v.value,
            })),
          },
          { emitEvent: false },
        );

        // Set selected columns now that availableColumns is populated
        if (config.prompt_column) {
          const columnStrings = config.prompt_column
            .split(',')
            .map((c: string) => c.trim());
          const matchedColumns = this.availableColumns.filter((col: any) =>
            columnStrings.includes(col.fullName),
          );

          // If we found matches, use them; otherwise create column objects
          if (matchedColumns.length > 0) {
            this.promptForm.patchValue(
              { columns: matchedColumns },
              { emitEvent: false },
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
              { emitEvent: false },
            );
          }
        }

        // Mark form as pristine since we just loaded saved data
        this.promptForm.markAsPristine();
      }
    }
    this.cdr.markForCheck();
  }

  onSubmit(): void {
    // Honor the same gate the Save button uses (valid + dirty + join-complete)
    // and drop a double-fire while a save is in flight.
    if (this.saving()) return;
    this.promptForm.markAllAsTouched();
    if (this.canSave) {
      const formValues = this.promptForm.value;

      const transformedTables = formValues.tables
        .map((table: any) => `${table.tableName}(${table.alias})`)
        .join(',');

      // Transform columns to alias.columnName format
      const transformedColumns = formValues.columns
        .map((col: any) => col.fullName)
        .join(',');

      const submitData: any = {
        ...formValues,
        tables: transformedTables,
        columns: transformedColumns,
        schema: formValues.schema.name,
        // prompt_where is legacy (the v2 compiler ignores it) — send '' so the
        // BE default is happy; the real filter is the structured operator +
        // filter column below.
        promptWhere: '',
        promptSql: this.generateSqlPreview(),
      };

      // Structured filter: one column + one operator. The compiler builds
      // `filter_expr <op> :value`. filterExpr = the chosen (possibly joined)
      // column; the operator lives on the prompt's appearance/config.
      submitData.filterExpr = this.filterColumn || null;
      submitData.selectExpr = this.filterColumn || null;
      submitData.operator = this.operator || null;

      // Structured joins: carry the full chain so the Query Builder
      // materialises every hop and the compiler can reach the joined columns.
      if (this.joinEdges?.length) {
        submitData.requiredJoins = this.joinEdges.map((e: any) => e.joinKey);
        submitData.joinEdges = this.joinEdges;
      } else {
        // Explicitly clear any prior joins so a re-config removes them.
        submitData.requiredJoins = null;
        submitData.joinEdges = null;
      }

      this.promptService
        .configPrompt(submitData)
        .then(async response => {
          if (this.globalService.handleSuccessService(response)) {
            // Also persist the appearance edited in the inline appearance
            // form, if the admin changed it. Kept separate from the config
            // save so a config-only edit never overwrites appearance.
            if (this.pendingAppearance) {
              try {
                await this.promptService.updateAppearance({
                  id: this.promptId,
                  appearance: this.pendingAppearance,
                });
              } catch {
                // Appearance persistence is best-effort; the config already
                // saved. The service surfaces its own error toast.
              }
            }
            this.router.navigate([PROMPT.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }

  /**
   * Load the stored appearance for the inline appearance form. Non-fatal:
   * an unconfigured prompt returns {} and the form seeds its defaults.
   */
  private loadAppearance(): void {
    if (!this.promptId) return;
    this.promptService
      .getAppearance(this.promptId)
      .then((res: any) => {
        this.loadedAppearance = res?.data?.appearance ?? {};
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.loadedAppearance = {};
        this.cdr.markForCheck();
      });
  }

  /** Store the validated appearance emitted by <prompt-appearance-form>. */
  onAppearanceChange(appearance: Record<string, any>): void {
    this.pendingAppearance = appearance;
  }

  /** Track appearance validation errors (i18n keys) from the appearance form. */
  onAppearanceValidity(errors: string[]): void {
    this.appearanceErrors = errors;
  }

  /** The base table (name only) the FK join picker reaches out from. */
  get promptBaseTable(): string | null {
    const tables = this.promptForm.get('tables')?.value as any[];
    if (!tables?.length) return null;
    const first = tables[0];
    return first?.tableName ?? first?.name ?? null;
  }

  get promptBaseSchema(): string | null {
    return this.promptForm.get('schema')?.value?.name ?? null;
  }

  /** The structured join chain changed (from <prompt-join-builder>). */
  onJoinEdgesChange(edges: any[]): void {
    this.joinEdges = edges || [];
    this.promptForm.markAsDirty();
  }

  /** The reachable columns (base + joined tables) changed. */
  onReachableColumnsChange(cols: any[]): void {
    this.reachableColumns = cols || [];
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
      if (!this.sectionData) return;
      // Fix #6: Reset schema to null instead of empty string
      this.promptForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        datasource: this.sectionData.datasourceId,
        tab: this.sectionData.section?.tab?.id ?? '',
        section: this.sectionData.section?.id ?? '',
        schema: null,
        tables: [],
        columns: [],
        promptJoin: '',
        promptWhere: '',
        promptValues: [],
      });

      this.selectedDatasourceName = this.sectionData.datasource?.name || '';
      this.selectedTabName = this.sectionData.section?.tab?.name || '';
      this.selectedSectionName = this.sectionData.section?.name || '';

      this.tables = {};

      this.isCancelClicked = true;

      this.promptForm.markAsPristine();
      this.promptForm.markAsUntouched();
    }
  }

  // Loading flags for the lazy table/column fetches (button-level busy).
  isLoadingTables = false;
  isLoadingColumns = false;
  // Lazy caches keyed by schema (tables) and `${schema}.${table}` (columns) —
  // avoids re-fetching a schema's tables or a table's columns twice.
  private tablesCacheBySchema: { [schema: string]: any[] } = {};
  private columnsCacheByTable: { [key: string]: any[] } = {};

  /** A stable, readable alias for a table name (departments → dep, else t1…). */
  private aliasFor(tableName: string, index: number): string {
    const base = (tableName || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 3)
      .toLowerCase();
    return base ? `${base}${index + 1}` : `t${index + 1}`;
  }

  /**
   * Lazy step 2: fetch the tables for a schema from the API (the BE returns
   * schema NAMES only now — tables + columns are separate endpoints). Builds
   * the `cachedAvailableTables` options with client-generated aliases.
   */
  private async loadTablesForSchema(schemaName: string): Promise<void> {
    if (!schemaName) return;
    // Serve from cache if we already fetched this schema's tables.
    if (this.tablesCacheBySchema[schemaName]) {
      this.cachedAvailableTables = this.tablesCacheBySchema[schemaName];
      this.tables[schemaName] = this.cachedAvailableTables;
      return;
    }
    const dsId = this.sectionData?.datasourceId;
    if (!dsId) return;

    this.isLoadingTables = true;
    this.cachedAvailableTables = [];
    this.cdr.markForCheck();
    try {
      const res: any = await this.datasourceService.listSchemaTables(
        { datasourceId: dsId, schemaName },
        true,
      );
      if (this.globalService.handleSuccessService(res, false)) {
        const rows: any[] = res.data || [];
        const options = rows.map((row: any, i: number) => {
          const tableName = row.table_name ?? row.tableName ?? row.name;
          const alias = this.aliasFor(tableName, i);
          return {
            name: `${tableName}(${alias})`,
            value: { tableName, alias },
          };
        });
        this.tablesCacheBySchema[schemaName] = options;
        this.tables[schemaName] = options;
        this.cachedAvailableTables = options;
      }
    } catch {
      this.cachedAvailableTables = [];
    } finally {
      this.isLoadingTables = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Lazy step 3: fetch a single table's columns from the API and cache them,
   * keyed by `${schema}.${tableName}`. Returns the column rows.
   */
  private async fetchColumnsFor(
    schemaName: string,
    tableName: string,
  ): Promise<any[]> {
    const key = `${schemaName}.${tableName}`;
    if (this.columnsCacheByTable[key]) return this.columnsCacheByTable[key];

    const dsId = this.sectionData?.datasourceId;
    if (!dsId) return [];
    try {
      const res: any = await this.datasourceService.listTableColumns(
        { datasourceId: dsId, schemaName, tableName },
        true,
      );
      if (this.globalService.handleSuccessService(res, false)) {
        // The columns endpoint returns the array DIRECTLY in `data`
        // (data: [{column_name, data_type, …}]), not data.columns — accept
        // both shapes to be safe.
        const rawCols: any[] = Array.isArray(res.data)
          ? res.data
          : res.data?.columns || [];
        const cols: any[] = rawCols.map((c: any) => ({
          name: c.column_name ?? c.columnName ?? c.name,
          type: c.data_type ?? c.dataType ?? c.type ?? '',
        }));
        this.columnsCacheByTable[key] = cols;
        return cols;
      }
    } catch {
      // fall through to empty
    }
    return [];
  }

  getAvailableTables(schema: any): any[] {
    if (!schema) return [];
    return this.cachedAvailableTables || [];
  }

  clearPromptValues(): void {
    this.promptForm.patchValue({
      promptValues: [],
    });
  }

  /**
   * When p-chips adds a new value, it adds a plain string.
   * Convert it to {id: null, value: string} object to keep format consistent.
   */
  onChipAdd(event: any): void {
    const addedValue = event.value;
    // p-chips already pushed the raw string into the array — replace it with an object
    const values = [...(this.promptForm.get('promptValues')?.value || [])];
    const idx = values.lastIndexOf(addedValue);
    if (idx > -1 && typeof addedValue === 'string') {
      // Check for duplicates by value string
      const isDuplicate = values.some(
        (v: any, i: number) =>
          i !== idx && (typeof v === 'object' ? v.value : v) === addedValue,
      );
      if (isDuplicate) {
        values.splice(idx, 1);
      } else {
        values[idx] = { id: null, value: addedValue };
      }
      this.promptForm.patchValue(
        { promptValues: values },
        { emitEvent: false },
      );
    }
  }

  onChipDoubleClick(event: any): void {
    const item = event.value;
    const values = this.promptForm.get('promptValues')?.value || [];
    this.editingChipIndex = values.indexOf(item);
    this.editingChipValue = item;
    const displayValue = typeof item === 'object' ? item.value : item;
    setTimeout(() => {
      if (this.chipInput) {
        const input = this.chipInput.nativeElement;
        input.style.width = `${Math.max(displayValue.length + 2, 4)}ch`;
        input.focus();
        input.select();
      }
    });
  }

  updateChip(event: any): void {
    if (this.editingChipIndex < 0) return;

    const newValue = event.target.value.trim();
    const values = [...(this.promptForm.get('promptValues')?.value || [])];
    const existing = values[this.editingChipIndex];
    const oldValue = typeof existing === 'object' ? existing.value : existing;

    // No change — just close edit mode
    if (!newValue || newValue === oldValue) {
      this.editingChipIndex = -1;
      this.editingChipValue = null;
      return;
    }

    // Check duplicate by value string
    const isDuplicate = values.some(
      (v: any, i: number) =>
        i !== this.editingChipIndex &&
        (typeof v === 'object' ? v.value : v) === newValue,
    );

    if (!isDuplicate) {
      // Preserve the ID if editing an existing value (case 4: value text updated)
      const existingId = typeof existing === 'object' ? existing.id : null;
      values[this.editingChipIndex] = { id: existingId, value: newValue };
      this.promptForm.patchValue({ promptValues: values });
      this.promptForm.markAsDirty();
    }

    this.editingChipIndex = -1;
    this.editingChipValue = null;
  }

  cancelEdit(): void {
    this.editingChipIndex = -1;
    this.editingChipValue = null;
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
          column.name.toLowerCase().includes(filterText),
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
          this.filteredColumns.length - 1,
        );
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedSuggestionIndex = Math.max(
          this.selectedSuggestionIndex - 1,
          0,
        );
        break;

      case 'Enter':
        event.preventDefault();
        if (this.selectedSuggestionIndex >= 0) {
          this.selectSuggestion(
            this.filteredColumns[this.selectedSuggestionIndex],
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
            column.name.toLowerCase().includes(filterText),
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
          Math.min(
            this.filteredJoinColumns.length - 1,
            this.maxSuggestions - 1,
          ),
        );
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedJoinSuggestionIndex = Math.max(
          this.selectedJoinSuggestionIndex - 1,
          0,
        );
        break;

      case 'Enter':
        if (this.selectedJoinSuggestionIndex >= 0) {
          event.preventDefault();
          this.selectJoinSuggestion(
            this.filteredJoinColumns[this.selectedJoinSuggestionIndex],
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

  /**
   * Populate `tableColumns` (alias → columns, for the WHERE/JOIN autocomplete)
   * AND `availableColumns` (the flat list for the columns multiselect) by
   * lazily fetching each selected table's columns from the API. Columns are
   * cached per `${schema}.${table}`, so re-selecting is instant. Async because
   * the BE serves columns on demand — the old nested `staticSchemaData` is
   * empty now (schema list is names-only).
   */
  private async loadColumnsForSelectedTables(
    selectedTables: any[],
  ): Promise<void> {
    const currentSchema = this.promptForm.get('schema')?.value?.name;
    if (!currentSchema || !selectedTables?.length) {
      this.tableColumns = {};
      this.availableColumns = [];
      this.cdr.markForCheck();
      return;
    }

    this.isLoadingColumns = true;
    this.cdr.markForCheck();

    const nextTableColumns: { [alias: string]: any[] } = {};
    const nextAvailable: any[] = [];
    try {
      for (const selectedTable of selectedTables) {
        const cols = await this.fetchColumnsFor(
          currentSchema,
          selectedTable.tableName,
        );
        // Keyed by the table's alias for the autocomplete helpers.
        nextTableColumns[selectedTable.alias] = cols;
        cols.forEach((column: any) => {
          nextAvailable.push({
            alias: selectedTable.alias,
            columnName: column.name,
            columnType: column.type,
            fullName: `${selectedTable.alias}.${column.name}`,
            displayName: `${selectedTable.alias}.${column.name}`,
          });
        });
      }
      this.tableColumns = nextTableColumns;
      this.availableColumns = nextAvailable;
    } finally {
      this.isLoadingColumns = false;
      this.cdr.markForCheck();
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
      currentAliases.includes(col.alias),
    );

    // Update form only if columns were removed
    if (validColumns.length !== currentSelectedColumns.length) {
      this.promptForm.patchValue(
        { columns: validColumns },
        { emitEvent: false },
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
      // Get current values as {id, value} objects
      let currentValues: any[] =
        this.promptForm.get('promptValues')?.value || [];
      const existingStrings = new Set(
        currentValues.map((v: any) => (typeof v === 'object' ? v.value : v)),
      );
      // Add only truly new values as {id: null, value} objects
      newValues.forEach(val => {
        if (!existingStrings.has(val)) {
          currentValues.push({ id: null, value: val });
          existingStrings.add(val);
        }
      });
      this.promptForm.patchValue({ promptValues: [...currentValues] });
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
      datasourceId: this.sectionData.datasourceId,
      query: query.trim(),
    };

    this.sqlExecuting = true;
    this.cdr.markForCheck();
    this.promptService
      .getPromptValuesBySQL(params)
      .then(response => {
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
            // Replace previous values with new values from query (as {id: null, value} objects)
            this.promptForm.patchValue({
              promptValues: newValues.map(v => ({ id: null, value: v })),
              promptValueSQL: response.data.query,
            });

            this.closeSqlDialog();
          } else {
            if (this.sqlDialogComponent) {
              this.sqlDialogComponent.setError('Query returned no results');
            }
          }
        }
        this.sqlExecuting = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.sqlExecuting = false;
        this.cdr.markForCheck();
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

    if (selectedTables.length === 0) {
      return '-- Select a table to see the preview';
    }

    // SELECT: chosen output columns, or the filter column, or *.
    let sql = '';
    if (selectedColumns.length > 0) {
      sql = `SELECT ${selectedColumns.map((c: any) => c.fullName).join(', ')}\n`;
    } else if (this.filterColumn) {
      sql = `SELECT ${this.filterColumn}\n`;
    } else {
      sql = 'SELECT *\n';
    }

    // FROM base table + structured joins (from the join builder).
    const base = selectedTables[0];
    sql += `FROM ${schema}.${base.tableName} ${base.alias}`;
    (this.joinEdges || []).forEach((j: any) => {
      sql += `\n${j.joinType || 'LEFT'} JOIN ${j.targetSchema}.${j.targetTable} ${j.targetAlias} ON ${j.onClause}`;
    });

    // WHERE from the structured filter column + operator (placeholder value).
    if (this.filterColumn) {
      const opLabel =
        this.operatorOptions.find(o => o.value === this.operator)?.label ||
        this.operator ||
        '=';
      sql += `\nWHERE ${this.filterColumn} ${opLabel} :value`;
    } else {
      sql += '\nWHERE <pick a filter column>';
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

  trackByName(index: number, item: any): any {
    return item.name;
  }

  refreshPromptValues() {
    if (!this.promptId) {
      return;
    }

    const params = {
      datasourceId: this.promptForm.get('datasource')?.value,
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
              promptValues: newValues.map(v => ({ id: null, value: v })),
              promptValueSQL: response.data.query,
            });
          }
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    // Abort in-flight reads if the user navigates away.
    this.promptService.cancelReads();
    if (this.hideDelay) clearTimeout(this.hideDelay);
    if (this.hideJoinDelay) clearTimeout(this.hideJoinDelay);
  }
}
