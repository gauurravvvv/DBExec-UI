import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import { FORMULA_EDITOR_OPTIONS } from '../../config/formula-editor.config';
import {
  FunctionCategory,
  FunctionDefinition,
  FUNCTION_CATEGORIES,
  getAllFunctions,
} from '../../constants/functions-reference';
import { DatasetService } from '../../services/dataset.service';
import { TranslateService } from '@ngx-translate/core';
import { ANALYTICAL_TYPES } from '../edit-dataset-fields-dialog/edit-dataset-fields-dialog.component';
import {
  createFieldCompletionItem,
  createFunctionCompletionItem,
  createThemeObserver,
  CustomFieldData,
  FORMULA_LANGUAGE_CONFIG,
  FORMULA_TOKENIZER,
  getCurrentMonacoTheme,
} from './add-custom-field-dialog.helper';

// Declare Monaco for TypeScript
declare const monaco: any;
declare const window: any;

@Component({
  selector: 'app-add-custom-field-dialog',
  templateUrl: './add-custom-field-dialog.component.html',
  styleUrls: ['./add-custom-field-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddCustomFieldDialogComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @Input() visible = false;
  @ViewChild('formulaEditorContainer')
  formulaEditorContainer!: ElementRef<HTMLDivElement>;
  @Input() datasetId: string = '';
  @Input() organisationId: string = '';
  @Input() datasetFields: any[] = [];
  @Input() editMode: boolean = false;
  @Input() editFieldData: any = null;
  @Input() analysisId: string = '';
  @Output() close = new EventEmitter<any>();

  customField: CustomFieldData = {
    columnToView: '',
    columnToUse: '',
    formula: '',
    dataType: 'text',
  };
  analyticalTypes = ANALYTICAL_TYPES;

  isSaveEnabled = false;
  isSubmitting = false;
  isValidating = false;
  isValidated = false;
  validationResult: { valid: boolean; message: string } | null = null;
  fieldNameError: string | null = null;

  // Reserved function names — field names cannot collide with these
  private reservedNames = new Set(getAllFunctions().map(fn => fn.name));

  // Functions Reference
  functionCategories: FunctionCategory[] = FUNCTION_CATEGORIES;
  expandedCategories: { [key: string]: boolean } = {};
  functionSearchQuery = '';
  filteredCategories: FunctionCategory[] = [];
  selectedFunction: FunctionDefinition | null = null;

  // Dataset Fields
  fieldSearchQuery = '';
  filteredFields: any[] = [];
  selectedField: any = null;

  // Monaco Editor
  private editor: any = null;
  private completionProviderDisposable: any = null;
  isLoadingEditor = false;
  monacoLoadFailed = false;
  private currentTheme: string = 'vs-dark';
  private themeObserver: MutationObserver | null = null;
  private languageRegistered = false;

  trackById(index: number, item: any): any {
    return item.id;
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  saving = this.datasetService.saving;

  constructor(
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private monacoLoader: MonacoLoaderService,
    private translate: TranslateService,
  ) {}

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onCancel();
    }
  }

  ngAfterViewInit() {
    // Theme observer will be setup when dialog opens
  }

  ngOnDestroy() {
    this.disposeEditor();
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']) {
      if (this.visible) {
        // Reset or patch form when dialog opens
        if (this.editMode && this.editFieldData) {
          // Edit mode - patch form with existing data
          this.customField = {
            columnToView: this.editFieldData.columnToView || '',
            columnToUse:
              this.editFieldData.customLogic ||
              this.editFieldData.columnToUse ||
              '',
            formula: this.editFieldData.formula || '',
            dataType: this.editFieldData.dataType || 'text',
          };
        } else {
          // Add mode - reset form
          this.customField = {
            columnToView: '',
            columnToUse: '',
            formula: '',
            dataType: 'text',
          };
        }

        this.isSaveEnabled = false;
        this.isSubmitting = false;
        this.isValidated = false;
        this.validationResult = null;
        this.functionSearchQuery = '';
        this.filteredCategories = [...this.functionCategories];
        this.expandedCategories = {};
        this.selectedFunction = null;
        this.fieldSearchQuery = '';

        // Filter out the current field being edited to prevent self-reference
        if (this.editMode && this.editFieldData) {
          this.filteredFields = this.datasetFields.filter(
            (field: any) => field.id !== this.editFieldData.id,
          );
        } else {
          this.filteredFields = [...this.datasetFields];
        }

        this.selectedField = null;

        // Initialize Monaco editor after DOM is ready
        setTimeout(() => this.initializeMonacoEditor(), 100);
      } else {
        // Dispose editor when dialog closes
        this.disposeEditor();
      }
    }
  }

  private setupThemeObserver(): void {
    this.currentTheme = getCurrentMonacoTheme();

    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }

    this.themeObserver = createThemeObserver((newTheme: string) => {
      if (newTheme !== this.currentTheme) {
        this.currentTheme = newTheme;
        if (this.editor) {
          monaco.editor.setTheme(this.currentTheme);
        }
      }
    });
  }

  private initializeMonacoEditor(): void {
    this.isLoadingEditor = true;
    this.monacoLoader
      .load()
      .then(() => {
        this.createEditor();
      })
      .catch(() => {
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
        this.cdr.markForCheck();
      });
  }

  private registerFormulaLanguage(): void {
    if (this.languageRegistered) return;

    // Register custom language
    monaco.languages.register({ id: 'formulaLang' });

    // Set language configuration from helper
    monaco.languages.setLanguageConfiguration(
      'formulaLang',
      FORMULA_LANGUAGE_CONFIG,
    );

    // Set token provider for syntax highlighting from helper
    monaco.languages.setMonarchTokensProvider('formulaLang', FORMULA_TOKENIZER);

    this.languageRegistered = true;
  }

  private createEditor(): void {
    const container = this.formulaEditorContainer?.nativeElement;
    if (!container) {
      this.isLoadingEditor = false;
      return;
    }

    try {
      // Register custom language
      this.registerFormulaLanguage();

      // Setup theme observer
      this.setupThemeObserver();

      // Dispose previous editor if exists
      if (this.editor) {
        this.editor.dispose();
      }

      // Create Monaco Editor instance
      this.editor = monaco.editor.create(container, {
        ...FORMULA_EDITOR_OPTIONS,
        value: this.customField.columnToUse || '',
        theme: this.currentTheme,
      });

      // Setup content change listener
      this.editor.onDidChangeModelContent(() => {
        this.customField.columnToUse = this.editor.getValue();
        this.onFormulaChange();
      });

      // Register IntelliSense
      this.registerCompletionProvider();

      // Focus the editor
      this.editor.focus();

      this.isLoadingEditor = false;
    } catch (error) {
      console.error('Error creating Monaco editor:', error);
      this.isLoadingEditor = false;
      this.monacoLoadFailed = true;
    }
  }

  private registerCompletionProvider(): void {
    // Dispose previous provider
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose();
    }

    const allFunctions = this.getAllFunctions();

    // Filter out current field in edit mode to prevent self-reference
    let availableFields = this.datasetFields || [];
    if (this.editMode && this.editFieldData) {
      availableFields = availableFields.filter(
        (field: any) => field.id !== this.editFieldData.id,
      );
    }

    this.completionProviderDisposable =
      monaco.languages.registerCompletionItemProvider('formulaLang', {
        triggerCharacters: ['{', '(', ',', ' '],
        provideCompletionItems: (model: any, position: any) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions: any[] = [];

          // Check if we're inside a { for field reference
          const openBraceMatch = textUntilPosition.match(/\{([^}]*)$/);
          if (openBraceMatch) {
            // Suggest dataset fields using helper
            availableFields.forEach((field: any) => {
              suggestions.push(
                createFieldCompletionItem(field, range, monaco, true),
              );
            });
            return { suggestions };
          }

          // Add function suggestions using helper
          allFunctions.forEach((fn: FunctionDefinition) => {
            suggestions.push(createFunctionCompletionItem(fn, range, monaco));
          });

          // Add field suggestions with { wrapper using helper
          availableFields.forEach((field: any) => {
            suggestions.push(
              createFieldCompletionItem(field, range, monaco, false),
            );
          });

          return { suggestions };
        },
      });
  }

  private getAllFunctions(): FunctionDefinition[] {
    return this.functionCategories.reduce(
      (acc: FunctionDefinition[], cat: FunctionCategory) =>
        acc.concat(cat.functions),
      [],
    );
  }

  private disposeEditor(): void {
    if (this.completionProviderDisposable) {
      this.completionProviderDisposable.dispose();
      this.completionProviderDisposable = null;
    }
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
    this.isLoadingEditor = false;
    this.monacoLoadFailed = false;
  }

  // Insert text at cursor position in Monaco editor
  private insertTextAtCursor(text: string): void {
    if (!this.editor) {
      // Fallback to direct model update
      this.customField.columnToUse = this.customField.columnToUse
        ? this.customField.columnToUse + ' ' + text
        : text;
      return;
    }

    const selection = this.editor.getSelection();
    const id = { major: 1, minor: 1 };
    const op = {
      identifier: id,
      range: selection,
      text: text,
      forceMoveMarkers: true,
    };

    this.editor.executeEdits('insert', [op]);
    this.editor.focus();
  }

  onFieldNameChange() {
    const name = this.customField.columnToView?.trim() || '';

    // Check if field name conflicts with a formula function name
    if (name && this.reservedNames.has(name)) {
      this.fieldNameError = this.translate.instant('DATASET.RESERVED_FUNCTION_NAME', { name });
      this.isSaveEnabled = false;
      return;
    }

    this.fieldNameError = null;
    // Field name changed - update save button but DON'T reset validation
    this.isSaveEnabled =
      name !== '' &&
      this.customField.columnToUse?.trim() !== '' &&
      this.isValidated;
  }

  onFormulaChange() {
    // Formula changed - reset validation
    this.isValidated = false;
    this.validationResult = null;

    // Save button requires: field name, custom logic, AND successful validation
    this.isSaveEnabled = false;
  }

  onSubmit() {
    if (!this.isSaveEnabled || this.isSubmitting) {
      return;
    }

    // Get IDs of custom fields used in the formula
    const usedCustomFieldIds = this.getUsedCustomFieldIds();

    this.isSubmitting = true;

    if (this.editMode && this.editFieldData) {
      // Edit mode - call update API
      const payload = {
        fieldId: this.editFieldData.id,
        datasetId: this.editFieldData.datasetId,
        organisation: this.editFieldData.organisationId,
        columnNameToView: this.customField.columnToView,
        customLogic: this.customField.columnToUse,
        used_field_ids: usedCustomFieldIds,
        dataType: this.customField.dataType,
      };

      this.datasetService
        .updateDatasetMapping(payload)
        .then((response: any) => {
          this.isSubmitting = false;
          if (this.globalService.handleSuccessService(response, true)) {
            this.close.emit({ field: response.data });
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        });
    } else {
      // Add mode - call add API
      const payload: any = {
        organisation: this.organisationId,
        datasetId: this.datasetId,
        name: this.customField.columnToView,
        customLogic: this.customField.columnToUse,
        used_field_ids: usedCustomFieldIds,
        dataType: this.customField.dataType,
      };

      // Include analysisId for analysis-level custom fields
      if (this.analysisId) {
        payload.analysisId = this.analysisId;
      }

      this.datasetService
        .addCustomField(payload)
        .then((response: any) => {
          this.isSubmitting = false;
          if (this.globalService.handleSuccessService(response, true)) {
            this.close.emit({ field: response.data });
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        });
    }
  }

  /**
   * Get IDs of all fields that are referenced in the formula
   * Returns an array of field IDs (both default and custom fields)
   */
  private getUsedCustomFieldIds(): number[] {
    const formula = this.customField.columnToUse || '';

    // Extract all field references from formula (e.g., {fieldName})
    const fieldReferences = formula.match(/\{([^}]+)\}/g);
    if (!fieldReferences || fieldReferences.length === 0) {
      return [];
    }

    const usedIds: number[] = [];

    // Check each field reference against ALL dataset fields
    for (const ref of fieldReferences) {
      // Remove braces to get field name
      const fieldName = ref.slice(1, -1);

      // Find matching field by columnToUse or columnToView (any type)
      const matchedField = this.datasetFields.find(
        (field: any) =>
          field.columnToUse === fieldName || field.columnToView === fieldName,
      );

      if (matchedField && !usedIds.includes(matchedField.id)) {
        usedIds.push(matchedField.id);
      }
    }

    return usedIds;
  }

  onCancel() {
    this.close.emit(null);
  }

  onValidate() {
    if (!this.customField.columnToUse || this.isValidating) {
      return;
    }

    this.isValidating = true;
    this.validationResult = null;
    this.isValidated = false;

    const payload = {
      datasetId: this.editMode ? this.editFieldData?.datasetId : this.datasetId,
      organisation: this.editMode
        ? this.editFieldData?.organisationId
        : this.organisationId,
      customLogic: this.customField.columnToUse,
    };

    this.datasetService
      .validateCustomField(payload)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false, false)) {
          this.isValidating = false;
          this.isValidated = true;
          this.validationResult = {
            valid: true,
            message: response.message || this.translate.instant('DATASET.FORMULA_VALIDATED'),
          };
          // Update save button state - we just set isValidated to true above
          this.isSaveEnabled =
            this.customField.columnToView?.trim() !== '' &&
            this.customField.columnToUse?.trim() !== '';
        } else {
          this.isValidating = false;
          this.isValidated = false;
          this.validationResult = {
            valid: false,
            message: response.message || this.translate.instant('DATASET.VALIDATION_FAILED'),
          };
        }
        this.cdr.markForCheck();
      })
      .catch((error: any) => {
        this.isValidating = false;
        this.isValidated = false;
        this.validationResult = {
          valid: false,
          message:
            error?.error?.message || this.translate.instant('DATASET.VALIDATION_FAILED_RETRY'),
        };
        this.cdr.markForCheck();
      });
  }

  // Functions Panel Methods
  getTotalFunctionCount(): number {
    return this.functionCategories.reduce(
      (total: number, cat: FunctionCategory) => total + cat.functions.length,
      0,
    );
  }

  getFilteredFunctionCount(): number {
    return this.filteredCategories.reduce(
      (total: number, cat: FunctionCategory) => total + cat.functions.length,
      0,
    );
  }

  toggleCategory(categoryId: string) {
    this.expandedCategories[categoryId] = !this.expandedCategories[categoryId];
  }

  isCategoryExpanded(categoryId: string): boolean {
    return this.expandedCategories[categoryId] || false;
  }

  onFunctionSearch() {
    const query = this.functionSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredCategories = [...this.functionCategories];
      // Collapse all accordions when search is cleared
      this.expandedCategories = {};
      return;
    }

    this.filteredCategories = this.functionCategories
      .map((category: FunctionCategory) => {
        const nameMatches: FunctionDefinition[] = [];
        const otherMatches: FunctionDefinition[] = [];

        category.functions.forEach((fn: FunctionDefinition) => {
          if (fn.name.toLowerCase().includes(query)) {
            nameMatches.push(fn);
          } else if (
            fn.usage.toLowerCase().includes(query) ||
            category.name.toLowerCase().includes(query)
          ) {
            otherMatches.push(fn);
          }
        });

        return {
          ...category,
          functions: [...nameMatches, ...otherMatches],
        };
      })
      .filter((category: FunctionCategory) => category.functions.length > 0);

    // Auto-expand categories that have results
    this.expandedCategories = {};
    this.filteredCategories.forEach((cat: FunctionCategory) => {
      this.expandedCategories[cat.id] = true;
    });
  }

  insertFunction(fn: FunctionDefinition) {
    this.insertTextAtCursor(fn.usage);
    this.onFormulaChange();
  }

  selectFunction(fn: FunctionDefinition) {
    this.selectedFunction = fn;
    this.selectedField = null;
  }

  // Dataset Fields Methods
  onFieldSearch() {
    const query = this.fieldSearchQuery.toLowerCase().trim();

    // Get the base list of fields (excluding current field in edit mode)
    let baseFields = this.datasetFields;
    if (this.editMode && this.editFieldData) {
      baseFields = this.datasetFields.filter(
        (field: any) => field.id !== this.editFieldData.id,
      );
    }

    if (!query) {
      this.filteredFields = [...baseFields];
      return;
    }

    this.filteredFields = baseFields.filter(
      (field: any) =>
        field.columnToView?.toLowerCase().includes(query) ||
        field.columnToUse?.toLowerCase().includes(query),
    );
  }

  selectDatasetField(field: any) {
    this.selectedField = field;
    this.selectedFunction = null;
  }

  insertField(field: any) {
    const fieldRef = '{' + (field.columnToUse || field.columnToView) + '}';
    this.insertTextAtCursor(fieldRef);
    this.onFormulaChange();
  }
}
