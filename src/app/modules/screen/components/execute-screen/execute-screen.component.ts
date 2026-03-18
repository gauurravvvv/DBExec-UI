import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
} from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TreeNode } from 'primeng/api';

import { GlobalService } from 'src/app/core/services/global.service';
import { ScreenService } from '../../services/screen.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import { QueryService } from '../../../dataset/services copy/query.service';
import { QueryResult } from '../../../dataset/helpers/dummy-data.helper';
import {
  ExecuteTab,
  ExecuteSection,
  ExecutePrompt,
  SubmissionPayload,
  transformTabResponse,
  transformSectionResponse,
  transformPromptResponse,
} from './models/execute-screen.models';
import { createPromptFormControl } from './helpers/form.helper';
import {
  createPromptSubmission,
  getPlaceholder,
} from './helpers/prompt-renderer.helper';

interface GroupedPrompt {
  promptId: number;
  name: string;
  value: any;
  displayValue: string;
  type: string;
  isRange?: boolean;
  startValue?: any;
  endValue?: any;
}
interface GroupedSection {
  sectionId: number;
  sectionName: string;
  prompts: GroupedPrompt[];
}
interface GroupedTab {
  tabId: number;
  tabName: string;
  sections: GroupedSection[];
}
interface FlatPromptValue {
  tab: string;
  section: string;
  prompt: string;
  value: any;
  type: string;
}

@Component({
  selector: 'app-execute-screen',
  templateUrl: './execute-screen.component.html',
  styleUrls: ['./execute-screen.component.scss'],
})
export class ExecuteScreenComponent implements OnInit, OnDestroy {
  @ViewChild('treeDropdown') treeDropdownRef!: ElementRef;
  @ViewChild('treeSearchInput') treeSearchInputRef!: ElementRef;

  // Route params
  orgId = '';
  databaseId = '';
  screenId = '';
  screenName = '';

  // Data
  tabs: ExecuteTab[] = [];
  activeTabIndex = 0;

  // Loading states
  loadingTabs = true;
  tabError: string | null = null;

  // Form
  promptForm!: FormGroup;

  // Submission
  isSubmitting = false;
  submitError: string | null = null;

  // Save dialog
  showSaveDialog = false;
  saveForm!: FormGroup;
  isSaving = false;

  // Edit mode (for editing existing type=2 datasets)
  editDatasetId: string | null = null;
  editDatasetName: string | null = null;
  isEditMode = false;
  private datasetLoadStarted = false;

  // Execute result dialog
  showExecuteResult = false;
  executePayload: SubmissionPayload | null = null;
  groupedValues: GroupedTab[] = [];
  filledPromptValuesCache: FlatPromptValue[] = [];

  // SQL result dialog
  generatedSql = '';
  sqlComponents: any = null;
  showSqlResult = false;
  executeError: string | null = null;

  // Query execution results
  isExecutingQuery = false;
  queryResult: QueryResult | null = null;
  showResultsPopup = false;
  resultFilterValues: { [key: string]: string } = {};
  resultRows = 25;
  resultPage = 1;
  private resultFilterSubject = new Subject<void>();
  queryRanSuccessfully = false;
  private lastExecutedQuery = '';
  private skipNextLazyLoad = false;

  // Structure tree navigation
  structureTreeNodes: TreeNode[] = [];
  showStructureTree = false;
  loadingStructure = false;
  highlightedElementId: string | null = null;

  // Cleanup
  private destroy$ = new Subject<void>();
  private clickOutsideHandler = (e: MouseEvent) => this.onClickOutside(e);

  // Skeleton arrays (cached to avoid recreating in template)
  readonly skeletonTabs = Array.from({ length: 3 }, (_, i) => i);
  readonly skeletonSections = Array.from({ length: 3 }, (_, i) => i);
  readonly skeletonPrompts = Array.from({ length: 4 }, (_, i) => i);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private globalService: GlobalService,
    private screenService: ScreenService,
    private datasetService: DatasetService,
    private queryService: QueryService,
  ) {
    this.orgId = this.route.snapshot.params['orgId'];
    this.databaseId = this.route.snapshot.params['dbId'];
    this.screenId = this.route.snapshot.params['screenId'];

    // Check for edit mode via query params
    const queryParams = this.route.snapshot.queryParams;
    if (queryParams['editDatasetId']) {
      this.editDatasetId = queryParams['editDatasetId'];
      this.editDatasetName = queryParams['editDatasetName'] || null;
      this.isEditMode = true;
    }
  }

  ngOnInit(): void {
    this.initForm();
    this.loadTabs();
    this.loadScreenStructure();

    // Edit mode: loadDatasetForEdit() is called automatically
    // after ALL tabs/sections/prompts finish loading (see checkAndLoadDatasetForEdit)

    // Debounce server-side result filters
    this.resultFilterSubject.pipe(debounceTime(500)).subscribe(() => {
      if (!this.lastExecutedQuery) return;
      this.resultPage = 1;
      const filter: { [key: string]: string } = {};
      for (const col of Object.keys(this.resultFilterValues)) {
        if (this.resultFilterValues[col]) {
          filter[col] = this.resultFilterValues[col];
        }
      }
      this.executeQueryForResults(
        this.lastExecutedQuery,
        1,
        this.resultRows,
        filter,
      );
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resultFilterSubject.complete();
    document.removeEventListener('click', this.clickOutsideHandler);
  }

  private initForm(): void {
    this.promptForm = this.fb.group({});
    this.saveForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],
    });
  }

  /**
   * Step 1: Load screen tabs from API
   */
  loadTabs(): void {
    this.loadingTabs = true;
    this.tabError = null;

    this.screenService
      .getScreenTabs(this.orgId, this.screenId)
      .then((response: any) => {
        if (response.status) {
          this.tabs = (response.data || []).map(transformTabResponse);
          this.loadingTabs = false;

          if (this.tabs.length > 0) {
            if (this.isEditMode) {
              // Edit mode: load ALL tabs so we can patch saved values
              this.tabs.forEach(tab => this.loadSections(tab));
            } else {
              // Normal mode: only load first tab
              this.loadSections(this.tabs[0]);
            }
          }
        } else {
          this.tabError = response.message || 'Failed to load tabs';
          this.loadingTabs = false;
        }
      })
      .catch(() => {
        this.tabError = 'Failed to load tabs';
        this.loadingTabs = false;
      });
  }

  /**
   * Step 2: Load sections for a tab
   */
  loadSections(tab: ExecuteTab): void {
    if (tab.loaded || tab.loading) return;

    tab.loading = true;
    tab.error = null;

    this.screenService
      .getTabSections(this.orgId, this.screenId, String(tab.id))
      .then((response: any) => {
        if (response.status) {
          tab.sections = (response.data || []).map(transformSectionResponse);
          tab.loaded = true;
          tab.loading = false;

          // Expand all sections and load all prompts in parallel
          tab.sections.forEach(section => {
            section.expanded = true;
            this.loadPrompts(section, tab);
          });
        } else {
          tab.error = response.message || 'Failed to load sections';
          tab.loading = false;
        }
      })
      .catch(() => {
        tab.error = 'Failed to load sections';
        tab.loading = false;
      });
  }

  /**
   * Step 3: Load prompts for a section
   */
  loadPrompts(section: ExecuteSection, tab?: ExecuteTab): void {
    if (section.loaded || section.loading) return;

    section.loading = true;
    section.error = null;

    // Find parent tab to get tabId
    const parentTab = tab || this.tabs.find(t => t.sections.includes(section));
    const tabId = parentTab ? String(parentTab.id) : '';

    this.screenService
      .getSectionPrompts(this.orgId, this.screenId, tabId, String(section.id))
      .then((response: any) => {
        if (response.status) {
          section.prompts = (response.data || []).map(transformPromptResponse);
          section.loaded = true;
          section.loading = false;

          // Add controls to form
          this.addPromptControls(section.prompts);

          // In edit mode, check if all prompts are now loaded to trigger patching
          if (this.isEditMode) {
            this.checkAndLoadDatasetForEdit();
          }
        } else {
          section.error = response.message || 'Failed to load prompts';
          section.loading = false;
        }
      })
      .catch(() => {
        section.error = 'Failed to load prompts';
        section.loading = false;
      });
  }

  private addPromptControls(prompts: ExecutePrompt[]): void {
    prompts.forEach(prompt => {
      if (!this.promptForm.contains(prompt.formControlName)) {
        this.promptForm.addControl(
          prompt.formControlName,
          createPromptFormControl(prompt),
        );
      }
    });
  }

  getPromptControl(prompt: ExecutePrompt): FormControl {
    return this.promptForm.get(prompt.formControlName) as FormControl;
  }

  hasValue(prompt: ExecutePrompt): boolean {
    const v = this.promptForm.get(prompt.formControlName)?.value;
    if (v == null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0 && v.some(item => item != null);
    return true;
  }

  onTabChange(event: { index: number }): void {
    this.activeTabIndex = event.index;
    const tab = this.tabs[event.index];
    if (tab && !tab.loaded && !tab.loading) {
      this.loadSections(tab);
    }
  }

  onSectionToggle(section: ExecuteSection, expanded: boolean): void {
    section.expanded = expanded;
  }

  getPlaceholder(prompt: ExecutePrompt): string {
    return getPlaceholder(prompt.type);
  }

  isFormValid(): boolean {
    return this.promptForm.valid;
  }

  get hasAnyValue(): boolean {
    const controls = this.promptForm.controls;
    return Object.keys(controls).some(key => {
      const v = controls[key].value;
      if (v == null || v === '') return false;
      if (Array.isArray(v)) return v.length > 0 && v.some(item => item != null);
      return true;
    });
  }

  onExecute(): void {
    if (!this.isFormValid()) {
      Object.keys(this.promptForm.controls).forEach(key => {
        this.promptForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.executePayload = this.collectFormValues();
    this.buildValueSnapshots();
    this.showExecuteResult = true;
  }

  onCloseExecuteResult(): void {
    this.showExecuteResult = false;
    this.executePayload = null;
  }

  onExecuteConfirm(): void {
    if (!this.executePayload) return;

    this.isSubmitting = true;
    this.executeError = null;

    // Build prompt lookup for ID → string value resolution
    const promptMap = new Map<number, ExecutePrompt>();
    this.tabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(p => promptMap.set(p.id, p));
      });
    });

    this.screenService
      .executeScreen({
        screenId: this.screenId,
        organisation: this.orgId,
        prompts: this.executePayload.prompts.map(p => {
          const prompt = promptMap.get(p.promptId);
          return {
            promptId: p.promptId,
            type: p.type,
            value: prompt
              ? this.resolveFormValueToString(prompt, p.value)
              : p.value,
            isRange: p.isRange,
            startValue: p.startValue,
            endValue: p.endValue,
          };
        }),
      })
      .then((response: any) => {
        this.isSubmitting = false;
        if (response.status) {
          this.generatedSql = response.data?.sql || '';
          this.sqlComponents = response.data?.components || null;
          this.showExecuteResult = false;
          this.showSqlResult = true;
        } else {
          this.executeError = response.message || 'Failed to generate SQL';
          this.globalService.handleSuccessService(response, false);
        }
      })
      .catch(() => {
        this.isSubmitting = false;
        this.executeError = 'Failed to generate SQL';
      });
  }

  onCloseSqlResult(): void {
    this.showSqlResult = false;
    this.generatedSql = '';
    this.sqlComponents = null;
  }

  copySqlToClipboard(): void {
    navigator.clipboard.writeText(this.generatedSql);
  }

  runGeneratedSql(): void {
    if (!this.generatedSql.trim()) return;
    this.resultFilterValues = {};
    this.resultPage = 1;
    this.skipNextLazyLoad = true;
    this.executeQueryForResults(this.generatedSql, 1, this.resultRows);
  }

  private executeQueryForResults(
    query: string,
    page: number = 1,
    limit: number = this.resultRows,
    filter: { [key: string]: string } = {},
  ): void {
    if (!query.trim()) return;

    this.isExecutingQuery = true;
    this.lastExecutedQuery = query;

    const startTime = Date.now();

    const payload: any = {
      orgId: Number(this.orgId),
      databaseId: Number(this.databaseId),
      query,
      page,
      limit,
    };

    if (Object.keys(filter).length > 0) {
      payload.filter = JSON.stringify(filter);
    }

    this.queryService.executeQuery(payload).subscribe({
      next: (response: any) => {
        if (response.status === false) {
          this.queryResult = {
            columns: [],
            rows: [],
            rowCount: 0,
            executionTime: `${Date.now() - startTime}ms`,
            error: response.message || 'Query execution failed',
          };
          this.isExecutingQuery = false;
          this.showResultsPopup = true;
          return;
        }

        const dataObj = response.data || response;

        let executionTime = dataObj.executionTime || response.executionTime;
        if (executionTime && typeof executionTime === 'string') {
          // keep as-is
        } else if (executionTime && typeof executionTime === 'number') {
          executionTime = `${executionTime}ms`;
        } else {
          executionTime = `${Date.now() - startTime}ms`;
        }

        const data = dataObj.data || dataObj.rows || [];
        const columns =
          dataObj.columns ||
          (Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : []);
        const rowCount =
          dataObj.rowCount !== undefined
            ? dataObj.rowCount
            : Array.isArray(data)
              ? data.length
              : 0;

        this.queryResult = {
          columns,
          rows: Array.isArray(data) ? data : [],
          rowCount,
          executionTime,
          query: dataObj.query || response.query,
        };

        this.queryRanSuccessfully = true;
        this.isExecutingQuery = false;
        this.showResultsPopup = true;
      },
      error: (error: any) => {
        let errorMessage = 'Query execution failed';
        if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (typeof error.error === 'string') {
          errorMessage = error.error;
        }

        this.queryResult = {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTime: `${Date.now() - startTime}ms`,
          error: errorMessage,
        };
        this.isExecutingQuery = false;
        this.showResultsPopup = true;
      },
    });
  }

  closeResultsPopup(): void {
    this.showResultsPopup = false;
  }

  get isPaginationEnabled(): boolean {
    return !!this.queryResult;
  }

  get isResultFilterActive(): boolean {
    return Object.values(this.resultFilterValues).some(v => !!v);
  }

  onResultFilterChange(): void {
    this.resultFilterSubject.next();
  }

  clearResultFilters(): void {
    this.resultFilterValues = {};
    this.resultPage = 1;
    if (this.lastExecutedQuery) {
      this.executeQueryForResults(this.lastExecutedQuery, 1, this.resultRows);
    }
  }

  onResultsLazyLoad(event: any): void {
    if (this.skipNextLazyLoad) {
      this.skipNextLazyLoad = false;
      return;
    }
    if (!this.lastExecutedQuery || this.isExecutingQuery) return;

    const page =
      Math.floor((event.first || 0) / (event.rows || this.resultRows)) + 1;
    const limit = event.rows || this.resultRows;

    this.resultPage = page;
    this.resultRows = limit;

    const filter: { [key: string]: string } = {};
    for (const col of Object.keys(this.resultFilterValues)) {
      if (this.resultFilterValues[col]) {
        filter[col] = this.resultFilterValues[col];
      }
    }

    this.executeQueryForResults(this.lastExecutedQuery, page, limit, filter);
  }

  onSave(): void {
    this.buildValueSnapshots();
    this.showSaveDialog = true;

    // In edit mode, the form is already pre-filled from loadDatasetForEdit
    // In create mode, it starts empty
  }

  onSaveCancel(): void {
    this.saveForm.reset();
    this.showSaveDialog = false;
  }

  onSaveConfirm(): void {
    if (!this.saveForm.valid) return;

    const formValues = this.collectFormValues();
    const name = this.saveForm.get('name')?.value.trim();
    const description = (this.saveForm.get('description')?.value || '').trim();

    // Build promptId → prompt lookup from loaded prompts
    const promptMap = new Map<number, ExecutePrompt>();
    this.tabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(p => {
          promptMap.set(p.id, p);
        });
      });
    });

    // Flat prompts for backend SQL building (resolve IDs to string values)
    const prompts = formValues.prompts.map(p => {
      const prompt = promptMap.get(p.promptId);
      return {
        promptId: p.promptId,
        type: p.type,
        value: prompt
          ? this.resolveFormValueToString(prompt, p.value)
          : p.value,
        isRange: p.isRange,
        startValue: p.startValue,
        endValue: p.endValue,
      };
    });

    // Rich config with names, value IDs + grouped display for view/edit
    const enrichedPrompts = formValues.prompts.map(p => {
      const prompt = promptMap.get(p.promptId);
      return {
        promptId: p.promptId,
        name: prompt?.name || '',
        type: p.type,
        value: prompt ? this.enrichValueWithIds(prompt, p.value) : p.value,
        isRange: p.isRange,
        startValue: p.startValue,
        endValue: p.endValue,
      };
    });

    const payload: any = {
      name,
      description,
      organisation: Number(this.orgId),
      database: Number(this.databaseId),
      screenId: Number(this.screenId),
      prompts,
      promptConfig: {
        prompts: enrichedPrompts,
        display: this.groupedValues,
      },
    };

    this.isSaving = true;

    if (this.isEditMode && this.editDatasetId) {
      // Update existing dataset
      payload.id = this.editDatasetId;
      this.datasetService
        .updateDatasetViaBuilder(payload)
        .then((response: any) => {
          this.isSaving = false;
          if (this.globalService.handleSuccessService(response, true)) {
            this.saveForm.reset();
            this.showSaveDialog = false;
            this.router.navigate(['/app/dataset']);
          }
        })
        .catch(() => {
          this.isSaving = false;
        });
    } else {
      // Create new dataset
      this.datasetService
        .addDatasetViaBuilder(payload)
        .then((response: any) => {
          this.isSaving = false;
          if (this.globalService.handleSuccessService(response, true)) {
            this.saveForm.reset();
            this.showSaveDialog = false;
            this.router.navigate(['/app/dataset']);
          }
        })
        .catch(() => {
          this.isSaving = false;
        });
    }
  }

  /**
   * Called after each section's prompts finish loading.
   * Once ALL tabs/sections/prompts are loaded, triggers dataset fetch for edit mode.
   */
  private checkAndLoadDatasetForEdit(): void {
    if (this.datasetLoadStarted) return;

    const allLoaded =
      this.tabs.length > 0 &&
      this.tabs.every(
        tab => tab.loaded && tab.sections.every(section => section.loaded),
      );

    if (allLoaded) {
      this.datasetLoadStarted = true;
      this.loadDatasetForEdit();
    }
  }

  /**
   * Load dataset data for edit mode and patch saved prompt values.
   * Called only AFTER all tabs/sections/prompts are fully loaded.
   */
  private loadDatasetForEdit(): void {
    this.datasetService
      .viewDataset(this.orgId, this.editDatasetId!)
      .then((response: any) => {
        if (response.status && response.data) {
          const dataset = response.data;

          // Pre-fill the save form with dataset name/description
          this.saveForm.patchValue({
            name: dataset.name || '',
            description: dataset.description || '',
          });

          // Extract prompts array from config (handle both old flat and new rich format)
          if (dataset.promptConfig) {
            const config = dataset.promptConfig;
            const savedPrompts =
              config.prompts || (Array.isArray(config) ? config : []);
            this.patchSavedPromptValues(savedPrompts);
          }
        }
      });
  }

  /**
   * Patch saved prompt values into the form.
   * All tabs/sections/prompts are guaranteed to be loaded at this point.
   * Handles enriched values: {id, value} objects for selection types.
   */
  private patchSavedPromptValues(savedPrompts: any[]): void {
    // Build a map of promptId → saved prompt data
    const savedMap = new Map<number, any>();
    savedPrompts.forEach((p: any) => {
      savedMap.set(Number(p.promptId), p);
    });

    // Patch each prompt's form control using promptId to match
    this.tabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(prompt => {
          const saved = savedMap.get(prompt.id);
          if (!saved) return;

          const control = this.promptForm.get(prompt.formControlName);
          if (!control) return;

          // Restore value based on type
          if (
            saved.isRange &&
            (saved.startValue != null || saved.endValue != null)
          ) {
            if (prompt.type === 'daterange') {
              const start = saved.startValue
                ? new Date(saved.startValue)
                : null;
              const end = saved.endValue ? new Date(saved.endValue) : null;
              control.setValue([start, end]);
            } else if (prompt.type === 'rangeslider') {
              control.setValue([
                saved.startValue != null ? Number(saved.startValue) : null,
                saved.endValue != null ? Number(saved.endValue) : null,
              ]);
            }
          } else if (saved.value != null && saved.value !== '') {
            if (prompt.type === 'date' || prompt.type === 'calendar') {
              control.setValue(new Date(saved.value));
            } else if (prompt.type === 'number') {
              control.setValue(Number(saved.value));
            } else if (
              prompt.type === 'multiselect' ||
              prompt.type === 'checkbox'
            ) {
              // Values are [{id, value}] objects — extract IDs for form (form stores IDs)
              // Filter out stale IDs that no longer exist in current prompt options
              const validIds = new Set(prompt.values.map(v => v.id));
              const arr = Array.isArray(saved.value)
                ? saved.value
                : [saved.value];
              const ids = arr
                .map((v: any) =>
                  typeof v === 'object' && v?.id != null ? v.id : v,
                )
                .filter((id: any) => validIds.has(id));
              if (ids.length > 0) {
                control.setValue(ids);
              }
            } else if (prompt.type === 'dropdown' || prompt.type === 'radio') {
              // Value is {id, value} object — extract ID for form
              // Only patch if the ID still exists in current prompt options
              const val =
                typeof saved.value === 'object' && saved.value?.id != null
                  ? saved.value.id
                  : saved.value;
              const validIds = new Set(prompt.values.map(v => v.id));
              if (validIds.has(val)) {
                control.setValue(val);
              }
            } else {
              // text
              control.setValue(saved.value);
            }
          }
        });
      });
    });
  }

  /** Build both flat and grouped snapshots of filled prompt values */
  private buildValueSnapshots(): void {
    const flat: FlatPromptValue[] = [];
    const grouped: GroupedTab[] = [];

    this.tabs.forEach(tab => {
      const sections: GroupedSection[] = [];

      tab.sections.forEach(section => {
        const prompts: GroupedPrompt[] = [];

        section.prompts.forEach(prompt => {
          const control = this.getPromptControl(prompt);
          if (
            control &&
            control.value != null &&
            control.value !== '' &&
            !(Array.isArray(control.value) && control.value.length === 0)
          ) {
            const submission = createPromptSubmission(prompt, control.value);

            // Enrich selection values with prompt value IDs for storage
            const enrichedValue = this.enrichValueWithIds(
              prompt,
              submission.value,
            );
            // Resolve IDs to string values for display
            const resolvedValue = this.resolveFormValueToString(
              prompt,
              control.value,
            );
            const displayStr = this.formatDisplayValue(
              resolvedValue,
              prompt.type,
            );

            prompts.push({
              promptId: prompt.id,
              name: prompt.name,
              value: enrichedValue,
              displayValue: displayStr,
              type: prompt.type,
              isRange: submission.isRange,
              startValue: submission.startValue,
              endValue: submission.endValue,
            });
            flat.push({
              tab: tab.name,
              section: section.name,
              prompt: prompt.name,
              value: displayStr,
              type: prompt.type,
            });
          }
        });

        if (prompts.length > 0) {
          sections.push({
            sectionId: section.id,
            sectionName: section.name,
            prompts,
          });
        }
      });

      if (sections.length > 0) {
        grouped.push({ tabId: tab.id, tabName: tab.name, sections });
      }
    });

    this.filledPromptValuesCache = flat;
    this.groupedValues = grouped;
  }

  /**
   * Convert form IDs back to string values for backend SQL building.
   * Form stores PromptValue IDs for selection types; backend needs actual string values.
   */
  private resolveFormValueToString(prompt: ExecutePrompt, formValue: any): any {
    if (formValue == null) return formValue;

    if (
      (prompt.type === 'multiselect' || prompt.type === 'checkbox') &&
      Array.isArray(formValue)
    ) {
      return formValue.map((id: any) => {
        const match = prompt.values.find(v => v.id === id);
        return match ? match.value : id;
      });
    }

    if (prompt.type === 'dropdown' || prompt.type === 'radio') {
      const match = prompt.values.find(v => v.id === formValue);
      return match ? match.value : formValue;
    }

    return formValue;
  }

  /**
   * For selection-based prompt types, enrich form IDs with {id, value} objects
   * for storage in promptConfig.
   */
  private enrichValueWithIds(prompt: ExecutePrompt, formValue: any): any {
    if (formValue == null) return formValue;

    if (
      (prompt.type === 'multiselect' || prompt.type === 'checkbox') &&
      Array.isArray(formValue)
    ) {
      return formValue.map((id: any) => {
        const matched = prompt.values.find(v => v.id === id);
        return matched
          ? { id: matched.id, value: matched.value }
          : { value: id };
      });
    }

    if (prompt.type === 'dropdown' || prompt.type === 'radio') {
      const matched = prompt.values.find(v => v.id === formValue);
      return matched ? { id: matched.id, value: matched.value } : formValue;
    }

    // text, number, date, calendar, daterange, rangeslider — return as-is
    return formValue;
  }

  formatDisplayValue(value: any, type: string): string {
    if (value == null) return '-';
    if (Array.isArray(value)) {
      if (type === 'daterange' || type === 'rangeslider') {
        return value
          .map((v: any) => (v instanceof Date ? v.toLocaleDateString() : v))
          .join(' – ');
      }
      return value.join(', ');
    }
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    return String(value);
  }

  private collectFormValues(): SubmissionPayload {
    const payload: SubmissionPayload = {
      screenId: this.screenId,
      prompts: [],
    };

    this.tabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(prompt => {
          const control = this.getPromptControl(prompt);
          if (control) {
            payload.prompts.push(createPromptSubmission(prompt, control.value));
          }
        });
      });
    });

    return payload;
  }

  // =========================================
  // Structure Tree Navigation
  // =========================================

  private loadScreenStructure(): void {
    this.loadingStructure = true;
    this.screenService
      .getScreenStructure(this.orgId, this.screenId)
      .then((response: any) => {
        if (response.status && response.data) {
          this.structureTreeNodes = this.buildTreeNodes(response.data);
        }
        this.loadingStructure = false;
      })
      .catch(() => {
        this.loadingStructure = false;
      });
  }

  private buildTreeNodes(screen: any): TreeNode[] {
    return (screen.tabs || []).map((tab: any) => ({
      label: tab.name,
      icon: 'pi pi-bookmark',
      expanded: false,
      data: { type: 'tab', tabId: tab.id },
      children: (tab.sections || []).map((section: any) => ({
        label: section.name,
        icon: 'pi pi-list',
        expanded: false,
        data: { type: 'section', tabId: tab.id, sectionId: section.id },
        children: (section.prompts || []).map((prompt: any) => ({
          label: prompt.name,
          icon: this.getPromptTypeIcon(prompt.type),
          data: {
            type: 'prompt',
            tabId: tab.id,
            sectionId: section.id,
            promptId: prompt.id,
            promptType: prompt.type,
          },
        })),
      })),
    }));
  }

  private getPromptTypeIcon(type: string): string {
    switch (type) {
      case 'text':
        return 'pi pi-pencil';
      case 'number':
        return 'pi pi-hashtag';
      case 'date':
      case 'calendar':
      case 'daterange':
        return 'pi pi-calendar';
      case 'dropdown':
        return 'pi pi-chevron-down';
      case 'multiselect':
        return 'pi pi-check-square';
      case 'radio':
        return 'pi pi-circle';
      case 'checkbox':
        return 'pi pi-check-square';
      case 'rangeslider':
        return 'pi pi-sliders-h';
      default:
        return 'pi pi-circle';
    }
  }

  onTreeFilter(event: any): void {
    const query = event?.filter || event?.originalEvent?.target?.value || '';
    const expand = query.trim().length > 0;
    this.setTreeExpanded(this.structureTreeNodes, expand);
  }

  private setTreeExpanded(nodes: TreeNode[], expanded: boolean): void {
    nodes.forEach(node => {
      node.expanded = expanded;
      if (node.children) {
        this.setTreeExpanded(node.children, expanded);
      }
    });
  }

  toggleStructureTree(): void {
    this.showStructureTree = !this.showStructureTree;
    if (this.showStructureTree) {
      setTimeout(() => {
        document.addEventListener('click', this.clickOutsideHandler);
      });
    } else {
      document.removeEventListener('click', this.clickOutsideHandler);
    }
  }

  private onClickOutside(event: MouseEvent): void {
    const dropdown = this.treeDropdownRef?.nativeElement;
    const input = this.treeSearchInputRef?.nativeElement;
    if (
      dropdown &&
      !dropdown.contains(event.target) &&
      input &&
      !input.contains(event.target)
    ) {
      this.showStructureTree = false;
      document.removeEventListener('click', this.clickOutsideHandler);
    }
  }

  onStructureNodeSelect(event: any): void {
    const node: TreeNode = event.node;
    if (!node?.data) return;

    const { type, tabId, sectionId, promptId } = node.data;

    // Find the tab index
    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    // Switch to the tab
    this.activeTabIndex = tabIndex;
    const tab = this.tabs[tabIndex];

    // Ensure sections are loaded, then navigate
    const navigate = () => {
      if (type === 'tab') {
        this.closeTreeAndScroll(() => {
          this.highlightElement(`tab-${tabId}`);
        });
        return;
      }

      // Find and expand the section
      const section = tab.sections.find(s => s.id === sectionId);
      if (section) {
        section.expanded = true;
      }

      if (type === 'section') {
        this.closeTreeAndScroll(() => {
          this.waitForElement(`section-${sectionId}`, () => {
            this.highlightElement(`section-${sectionId}`);
          });
        });
        return;
      }

      if (type === 'prompt') {
        // Ensure prompts are loaded before scrolling
        const waitForPrompts = () => {
          if (section && section.loaded) {
            this.closeTreeAndScroll(() => {
              this.waitForElement(`prompt-${promptId}`, () => {
                this.highlightElement(`prompt-${promptId}`);
              });
            });
          } else {
            setTimeout(waitForPrompts, 100);
          }
        };
        waitForPrompts();
      }
    };

    if (!tab.loaded && !tab.loading) {
      this.loadSections(tab);
      // Wait for sections+prompts to load
      const waitForLoad = () => {
        if (tab.loaded) {
          navigate();
        } else {
          setTimeout(waitForLoad, 100);
        }
      };
      setTimeout(waitForLoad, 100);
    } else {
      navigate();
    }
  }

  private closeTreeAndScroll(scrollFn?: () => void): void {
    this.showStructureTree = false;
    this.setTreeExpanded(this.structureTreeNodes, false);
    document.removeEventListener('click', this.clickOutsideHandler);
    if (scrollFn) {
      setTimeout(scrollFn, 200);
    }
  }

  private waitForElement(id: string, callback: () => void, retries = 20): void {
    const el = document.getElementById(id);
    if (el) {
      callback();
    } else if (retries > 0) {
      setTimeout(() => this.waitForElement(id, callback, retries - 1), 50);
    }
  }

  private highlightElement(id: string): void {
    this.highlightedElementId = id;
    this.scrollToElement(id);

    // Also apply class directly on DOM for host elements like p-accordionTab
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('nav-highlight');
      setTimeout(() => {
        el.classList.remove('nav-highlight');
      }, 2500);
    }

    setTimeout(() => {
      this.highlightedElementId = null;
    }, 2500);
  }

  private scrollToElement(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;

    // Scroll within the tab panels container, not the whole page
    const scrollContainer = document.querySelector(
      '.full-height-tabs .p-tabview-panels',
    );
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset =
        elRect.top -
        containerRect.top +
        scrollContainer.scrollTop -
        containerRect.height / 2 +
        elRect.height / 2;
      scrollContainer.scrollTo({
        top: Math.max(0, offset),
        behavior: 'smooth',
      });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  onBack(): void {
    this.router.navigate(['/app/screen']);
  }

  onReset(): void {
    this.promptForm.reset();
    this.queryRanSuccessfully = false;
  }
}
