import {
  AfterViewInit,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  FUNCTION_CATEGORIES,
  FunctionCategory,
  FunctionDefinition,
} from '../../constants/functions-reference';
import {
  FORMULA_EDITOR_OPTIONS,
  FORMULA_EDITOR_LOADING_CONFIG,
} from '../../config/formula-editor.config';
import { DatasetService } from '../../services/dataset.service';
import { GlobalService } from 'src/app/core/services/global.service';

// Declare Monaco for TypeScript
declare const monaco: any;
declare const window: any;

export interface CustomFieldData {
  columnToView: string;
  columnToUse: string;
  formula: string;
}

@Component({
  selector: 'app-add-custom-field-dialog',
  templateUrl: './add-custom-field-dialog.component.html',
  styleUrls: ['./add-custom-field-dialog.component.scss'],
})
export class AddCustomFieldDialogComponent
  implements OnChanges, AfterViewInit, OnDestroy
{
  @Input() visible = false;
  @Input() datasetId: string = '';
  @Input() organisationId: string = '';
  @Input() datasetFields: any[] = [];
  @Input() editMode: boolean = false;
  @Input() editFieldData: any = null;
  @Output() close = new EventEmitter<any>();

  customField: CustomFieldData = {
    columnToView: '',
    columnToUse: '',
    formula: '',
  };

  isSaveEnabled = false;
  isSubmitting = false;
  isValidating = false;
  isValidated = false;
  validationResult: { valid: boolean; message: string } | null = null;

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

  constructor(
    private datasetService: DatasetService,
    private globalService: GlobalService
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
          };
        } else {
          // Add mode - reset form
          this.customField = {
            columnToView: '',
            columnToUse: '',
            formula: '',
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
        this.filteredFields = [...this.datasetFields];
        this.selectedField = null;

        // Initialize Monaco editor after DOM is ready
        setTimeout(() => this.initializeMonacoEditor(), 100);
      } else {
        // Dispose editor when dialog closes
        this.disposeEditor();
      }
    }
  }

  private getCurrentTheme(): string {
    const isDarkTheme = document.body.classList.contains('dark-theme');
    return isDarkTheme ? 'vs-dark' : 'vs';
  }

  private setupThemeObserver(): void {
    this.currentTheme = this.getCurrentTheme();

    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }

    this.themeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          const newTheme = this.getCurrentTheme();
          if (newTheme !== this.currentTheme) {
            this.currentTheme = newTheme;
            if (this.editor) {
              monaco.editor.setTheme(this.currentTheme);
            }
          }
        }
      });
    });

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  private initializeMonacoEditor(): void {
    if (typeof monaco !== 'undefined') {
      setTimeout(() => this.createEditor(), 0);
      return;
    }

    this.isLoadingEditor = true;

    let attempts = 0;
    const maxAttempts = FORMULA_EDITOR_LOADING_CONFIG.MAX_ATTEMPTS;
    const checkInterval = FORMULA_EDITOR_LOADING_CONFIG.CHECK_INTERVAL_MS;

    const checkMonaco = setInterval(() => {
      attempts++;

      if (typeof monaco !== 'undefined') {
        clearInterval(checkMonaco);
        this.createEditor();
        return;
      }

      if (window.monacoLoading === false) {
        clearInterval(checkMonaco);
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkMonaco);
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
      }
    }, checkInterval);

    setTimeout(() => {
      clearInterval(checkMonaco);
      if (typeof monaco === 'undefined') {
        this.isLoadingEditor = false;
        this.monacoLoadFailed = true;
      }
    }, FORMULA_EDITOR_LOADING_CONFIG.TIMEOUT_MS);
  }

  private registerFormulaLanguage(): void {
    if (this.languageRegistered) return;

    // Register custom language
    monaco.languages.register({ id: 'formulaLang' });

    // Set language configuration
    monaco.languages.setLanguageConfiguration('formulaLang', {
      brackets: [
        ['(', ')'],
        ['{', '}'],
        ['[', ']'],
      ],
      autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
      ],
      surroundingPairs: [
        { open: '(', close: ')' },
        { open: '{', close: '}' },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
      ],
    });

    // Set token provider for syntax highlighting
    monaco.languages.setMonarchTokensProvider('formulaLang', {
      tokenizer: {
        root: [
          // Field references like {field_name}
          [/\{[^}]+\}/, 'variable'],
          // Function names followed by (
          [/[a-zA-Z_]\w*(?=\s*\()/, 'function'],
          // String literals
          [/'[^']*'/, 'string'],
          [/"[^"]*"/, 'string'],
          // Numbers
          [/\d+(\.\d+)?/, 'number'],
          // Operators
          [/[+\-*/%=<>!&|,]/, 'operator'],
          // Brackets
          [/[(){}[\]]/, 'bracket'],
          // Keywords
          [/\b(if|else|then|and|or|not|true|false|null)\b/i, 'keyword'],
        ],
      },
    });

    this.languageRegistered = true;
  }

  private createEditor(): void {
    const container = document.getElementById('formula-editor-container');
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
    const datasetFields = this.datasetFields || [];

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
            // Suggest dataset fields
            datasetFields.forEach((field: any) => {
              suggestions.push({
                label: field.columnToView || field.columnToUse,
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: 'Dataset Field',
                documentation: `Column: ${field.columnToUse}\nDisplay: ${field.columnToView}`,
                insertText: (field.columnToUse || field.columnToView) + '}',
                range: {
                  ...range,
                  startColumn: range.startColumn,
                },
              });
            });
            return { suggestions };
          }

          // Add function suggestions
          allFunctions.forEach((fn: FunctionDefinition) => {
            suggestions.push({
              label: fn.name,
              kind: monaco.languages.CompletionItemKind.Function,
              detail: `Function: ${fn.name}()`,
              documentation: {
                value: `**${fn.name}**\n\n\`\`\`\n${fn.usage}\n\`\`\`\n\n${fn.description}`,
                isTrusted: true,
              },
              insertText: fn.usage,
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range: range,
            });
          });

          // Add field suggestions with { wrapper
          datasetFields.forEach((field: any) => {
            suggestions.push({
              label: `{${field.columnToUse || field.columnToView}}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: 'Dataset Field',
              documentation: `Column: ${field.columnToUse}\nDisplay: ${field.columnToView}`,
              insertText: `{${field.columnToUse || field.columnToView}}`,
              range: range,
            });
          });

          return { suggestions };
        },
      });
  }

  private getAllFunctions(): FunctionDefinition[] {
    return this.functionCategories.reduce(
      (acc: FunctionDefinition[], cat: FunctionCategory) =>
        acc.concat(cat.functions),
      []
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
    // Field name changed - update save button but DON'T reset validation
    this.isSaveEnabled =
      this.customField.columnToView?.trim() !== '' &&
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

    this.isSubmitting = true;

    if (this.editMode && this.editFieldData) {
      // Edit mode - call update API
      const payload = {
        fieldId: this.editFieldData.id,
        datasetId: this.editFieldData.datasetId,
        organisation: this.editFieldData.organisationId,
        columnNameToView: this.customField.columnToView,
        customLogic: this.customField.columnToUse,
      };

      this.datasetService
        .updateDatasetMapping(payload)
        .then((response: any) => {
          this.isSubmitting = false;
          if (this.globalService.handleSuccessService(response, true)) {
            this.close.emit({ field: response.data });
          }
        })
        .catch(() => {
          this.isSubmitting = false;
        });
    } else {
      // Add mode - call add API
      const payload = {
        organisation: this.organisationId,
        datasetId: this.datasetId,
        name: this.customField.columnToView,
        customLogic: this.customField.columnToUse,
      };

      this.datasetService
        .addCustomField(payload)
        .then((response: any) => {
          this.isSubmitting = false;
          if (this.globalService.handleSuccessService(response, true)) {
            this.close.emit({ field: response.data });
          }
        })
        .catch(() => {
          this.isSubmitting = false;
        });
    }
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
        if (this.globalService.handleSuccessService(response, false)) {
          this.isValidating = false;
          this.isValidated = true;
          this.validationResult = {
            valid: true,
            message: response.message || 'Formula validated successfully!',
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
            message: response.message || 'Validation failed',
          };
        }
      })
      .catch((error: any) => {
        this.isValidating = false;
        this.isValidated = false;
        this.validationResult = {
          valid: false,
          message:
            error?.error?.message || 'Validation failed. Please try again.',
        };
      });
  }

  // Functions Panel Methods
  getTotalFunctionCount(): number {
    return this.functionCategories.reduce(
      (total: number, cat: FunctionCategory) => total + cat.functions.length,
      0
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
      return;
    }

    this.filteredCategories = this.functionCategories
      .map((category: FunctionCategory) => ({
        ...category,
        functions: category.functions.filter(
          (fn: FunctionDefinition) =>
            fn.name.toLowerCase().includes(query) ||
            fn.description.toLowerCase().includes(query)
        ),
      }))
      .filter((category: FunctionCategory) => category.functions.length > 0);

    // Auto-expand categories that have results
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
    if (!query) {
      this.filteredFields = [...this.datasetFields];
      return;
    }
    this.filteredFields = this.datasetFields.filter(
      (field: any) =>
        field.columnToView?.toLowerCase().includes(query) ||
        field.columnToUse?.toLowerCase().includes(query)
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
