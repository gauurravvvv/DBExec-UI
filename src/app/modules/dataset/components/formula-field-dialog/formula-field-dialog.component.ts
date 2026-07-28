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
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { MonacoLoaderService } from 'src/app/core/services/monaco-loader.service';
import { FORMULA_EDITOR_OPTIONS } from '../../config/formula-editor.config';
import {
  FormulaCatalogService,
  FormulaCategory,
  FormulaFunction,
} from '../../services/formula-catalog.service';
import { DatasetFieldsStore } from '../../services/dataset-fields.store';
import { DatasetService } from '../../services/dataset.service';
import { ANALYTICAL_TYPES } from '../edit-dataset-fields-dialog/edit-dataset-fields-dialog.component';
import {
  createFieldCompletionItem,
  createFunctionCompletionItem,
  createThemeObserver,
  CustomFieldData,
  FORMULA_LANGUAGE_CONFIG,
  FORMULA_TOKENIZER,
  defineDbexecThemes,
  getCurrentMonacoTheme,
} from './formula-monaco.helper';

// Declare Monaco for TypeScript
declare const monaco: any;
declare const window: any;

@Component({
  selector: 'app-formula-field-dialog',
  templateUrl: './formula-field-dialog.component.html',
  styleUrls: ['./formula-field-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormulaFieldDialogComponent
  implements OnInit, OnChanges, AfterViewInit, OnDestroy
{
  @Input() visible = false;
  @ViewChild('formulaEditorContainer')
  formulaEditorContainer!: ElementRef<HTMLDivElement>;
  @Input() datasetId: string = '';
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

  /** What kind of calculation the validated formula is — drives the badge. */
  resolvedStage: 'ROW' | 'AGG' | 'WINDOW' | null = null;
  isValidated = false;
  validationResult: { valid: boolean; message: string } | null = null;
  fieldNameError: string | null = null;

  // Reserved function names — field names cannot collide with these
  // Field names may not shadow a function name. Sourced from the catalog, so it
  // stays correct as the registry grows.
  private reservedNames = new Set<string>();

  // Functions Reference
  // Populated from GET /datasets/formula/catalog. The UI owns no function list
  // of its own, so the palette can never drift from the engine.
  functionCategories: FormulaCategory[] = [];

  /**
   * Icon per catalog category. Purely presentational, so it stays in the UI —
   * the backend serves what the functions ARE, the frontend decides how they
   * look. An unlisted category falls back to a neutral glyph.
   */
  private readonly categoryIcons: Record<string, string> = {
    string: 'pi pi-align-left',
    date: 'pi pi-calendar',
    numeric: 'pi pi-percentage',
    aggregate: 'pi pi-chart-bar',
    conditional: 'pi pi-filter',
    comparison: 'pi pi-sort-alt',
    conversion: 'pi pi-refresh',
    lookup: 'pi pi-search',
    window: 'pi pi-table',
    running: 'pi pi-forward',
    ranking: 'pi pi-sort-amount-down',
    over: 'pi pi-clone',
  };

  categoryIcon(categoryId: string): string {
    return this.categoryIcons[categoryId] ?? 'pi pi-code';
  }
  expandedCategories: { [key: string]: boolean } = {};
  functionSearchQuery = '';
  filteredCategories: FormulaCategory[] = [];
  selectedFunction: FormulaFunction | null = null;

  // Dataset Fields
  fieldSearchQuery = '';
  filteredFields: any[] = [];
  selectedField: any = null;

  // Monaco Editor
  private editor: any = null;
  private completionProviderDisposable: any = null;
  isLoadingEditor = false;
  monacoLoadFailed = false;
  // Light default — Monaco's setTheme is global; a dark default could
  // leak into other editors. getCurrentMonacoTheme() corrects at init.
  private currentTheme: string = 'vs';
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
    private catalog: FormulaCatalogService,
    private fieldsStore: DatasetFieldsStore,
  ) {}

  ngOnInit(): void {
    // The catalog is static and shared, so this is a no-op after the first call.
    this.catalog.load().subscribe({
      next: () => {
        this.functionCategories = this.catalog.categories();
        this.reservedNames = new Set(this.catalog.functionNames());
        this.onFunctionSearch();
        this.cdr.markForCheck();
      },
    });
  }

  // ESC is wired through requestClose() so the unsaved-changes guard
  // runs before the dialog actually closes. p-dialog's built-in
  // closeOnEscape is disabled in the template; we listen at the
  // document level instead to keep the guard centralised.
  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(_event: KeyboardEvent) {
    if (!this.visible) return;
    // If the unsaved-changes prompt is open, let it own ESC (its own
    // closeOnEscape calls cancelClose via onHide).
    if (this.showUnsavedPrompt) return;
    this.requestClose();
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
          // Add mode — default to a numeric (decimal) field. Custom
          // fields are overwhelmingly aggregations (sums, ratios,
          // averages), so seeding "numeric" saves a click for the
          // common case. Users who need a text/date field can change
          // it from the dropdown.
          this.customField = {
            columnToView: '',
            columnToUse: '',
            formula: '',
            dataType: 'numeric',
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
        this.showUnsavedPrompt = false;
        this.formDirty = false;
        // Snapshot the opening state so we can decide whether the
        // form is dirty when the user tries to close.
        this.initialSnapshot = JSON.stringify(this.customField);

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

  // ── Unsaved-changes guard ────────────────────────────────────────
  //
  // The dialog can be closed by four paths: the header ×, footer
  // Cancel, ESC key, and (defensively) p-dialog's onHide. All four
  // route through requestClose() — which only emits the close event
  // if the form is clean, otherwise it opens a small nested confirm
  // prompt. This prevents accidental data loss for users who've
  // typed a long formula.

  showUnsavedPrompt = false;
  formDirty = false;
  private initialSnapshot = '';

  private isDirty(): boolean {
    if (this.formDirty) return true;
    return JSON.stringify(this.customField) !== this.initialSnapshot;
  }

  /** All close paths (header ×, Cancel, ESC) funnel through here. */
  requestClose(): void {
    if (this.isSubmitting) return; // never abandon a save in flight
    if (this.isDirty()) {
      this.showUnsavedPrompt = true;
      this.cdr.markForCheck();
      return;
    }
    this.close.emit(null);
  }

  cancelClose(): void {
    this.showUnsavedPrompt = false;
    this.cdr.markForCheck();
  }

  confirmDiscard(): void {
    this.showUnsavedPrompt = false;
    this.close.emit(null);
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

    // Monaco's language registry is GLOBAL, but the old guard was a
    // per-instance flag — so every new dialog instance re-registered
    // `formulaLang` (and view-analyses mounts the dialog via *ngIf, i.e.
    // a fresh instance on every open), accumulating orphaned config/token
    // providers in Monaco for the app's lifetime. Guard on the global
    // registry so registration happens exactly once per page load.
    const alreadyRegistered = monaco.languages
      .getLanguages()
      .some((lang: any) => lang.id === 'formulaLang');
    if (alreadyRegistered) {
      this.languageRegistered = true;
      return;
    }

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

      // Register the app-matched themes BEFORE any theme is read or applied —
      // getCurrentMonacoTheme falls back to the stock names until they exist.
      defineDbexecThemes();

      // Setup theme observer
      this.setupThemeObserver();

      // Dispose previous editor if exists
      if (this.editor) {
        this.editor.dispose();
      }

      // Re-read the live theme right before create (Monaco theme is
      // global; avoids inheriting a stale theme from another editor).
      this.currentTheme = getCurrentMonacoTheme();

      // Create Monaco Editor instance
      this.editor = monaco.editor.create(container, {
        ...FORMULA_EDITOR_OPTIONS,
        value: this.customField.columnToUse || '',
        theme: this.currentTheme,
      });

      // Assert the global theme after create to correct any leak.
      monaco.editor.setTheme(this.currentTheme);

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

    this.completionProviderDisposable =
      monaco.languages.registerCompletionItemProvider('formulaLang', {
        triggerCharacters: ['{', '(', ',', ' '],
        provideCompletionItems: (model: any, position: any) => {
          // Resolved on EVERY keystroke, not captured when the provider was
          // registered. An earlier version snapshotted both lists here, so a
          // field created moments ago did not appear in the next formula's
          // suggestions until the dialog was reopened — the opposite of the
          // seamless create -> pick -> create loop the store exists to give.
          const allFunctions = this.getAllFunctions();
          const availableFields = this.suggestableFields();
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
          allFunctions.forEach((fn: FormulaFunction) => {
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

  /**
   * Fields offerable as `{name}` right now.
   *
   * Union of the live store (so a field saved seconds ago is immediately
   * suggestable, regardless of how the host screen wires its @Input) and the
   * @Input itself (so a host that has not adopted the store still works).
   * The field being edited is excluded — a formula cannot reference itself, and
   * the backend rejects it, so offering it would only invite a 400.
   */
  private suggestableFields(): any[] {
    const byName = new Map<string, any>();

    for (const f of this.datasetFields ?? []) {
      const name = (f?.columnToUse || f?.columnToView || '').trim();
      if (name) byName.set(name, f);
    }
    for (const f of this.fieldsStore.fields()) {
      if (f.name && !byName.has(f.name)) {
        byName.set(f.name, { columnToUse: f.name, columnToView: f.label, dataType: f.dataType });
      }
    }

    const selfName = this.editMode
      ? (this.editFieldData?.columnToUse || this.editFieldData?.columnToView || '').trim()
      : '';
    const selfId = this.editMode ? this.editFieldData?.id : null;

    return [...byName.values()].filter(f => {
      if (selfId && f.id === selfId) return false;
      const name = (f?.columnToUse || f?.columnToView || '').trim();
      return !(selfName && name === selfName);
    });
  }

  /** Flat function list, from the catalog. */
  private getAllFunctions(): FormulaFunction[] {
    return this.functionCategories.reduce(
      (acc: FormulaFunction[], cat: FormulaCategory) =>
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
    // Disconnect the body-class theme observer on close too, not only on
    // destroy — a persistent ([visible]) mount would otherwise keep an idle
    // MutationObserver firing on every theme toggle while the dialog is shut.
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
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
      this.fieldNameError = this.translate.instant(
        'DATASET.RESERVED_FUNCTION_NAME',
        { name },
      );
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

    // Monaco's onDidChangeModelContent fires outside the Angular zone,
    // so OnPush change detection doesn't pick up the new column value
    // on its own. Without this, the Validate button stays disabled
    // until some unrelated event (hover, click) wakes CD up — which
    // looked like a bug ("I typed a formula, why is Validate greyed
    // out?"). The textarea fallback path triggers CD via ngModel
    // already, so marking here is safe in both paths.
    this.formDirty = true;
    this.cdr.markForCheck();
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

  // Public cancel entry point — kept for backwards compatibility with
  // anything still wiring (click)="onCancel()" directly. New template
  // uses requestClose() which gates on dirty state; this just forwards.
  onCancel(): void {
    this.requestClose();
  }

  /**
   * Tooltip body shown over the disabled Save button so users see
   * *why* the button is greyed out instead of having to guess. Two
   * distinct states map to two different hints:
   *   - missing required field → "fill the label, data type, formula"
   *   - everything filled but not validated → "validate the formula"
   * Empty string when Save is enabled (PrimeNG hides the tooltip).
   */
  get saveDisabledHint(): string {
    if (this.isSaveEnabled || this.isSubmitting) return '';
    const name = this.customField.columnToView?.trim() || '';
    const dataType = this.customField.dataType || '';
    const formula = this.customField.columnToUse?.trim() || '';
    // Required-field state takes priority: tell users to fill the
    // form before pointing them at Validate.
    if (!name || !dataType || !formula || this.fieldNameError) {
      return this.translate.instant('DATASET.CUSTOM_FIELD_SAVE_DISABLED_HINT');
    }
    // Everything filled — what's missing is the validation step.
    return this.translate.instant('DATASET.CUSTOM_FIELD_VALIDATE_FIRST_HINT');
  }

  onDataTypeChange(): void {
    // Changing data type doesn't invalidate the formula, so we don't
    // reset validation. Just track dirtiness so the unsaved-changes
    // guard catches a stray dropdown change.
    this.formDirty = true;
  }

  // ── Field type pill helpers ──────────────────────────────────────
  // Renders a compact pill on each field row showing its data type.
  // Glyphs (abc / 123 / yn / 📅 / 🕓 / { }) are picked to be readable
  // at micro size where a full label wouldn't fit.

  private fieldTypeMap(field: any): {
    cls: string;
    glyph: string;
    labelKey: string;
  } {
    const dt = (field?.dataType || field?.type_name || '').toLowerCase();
    if (
      dt.includes('int') ||
      dt.includes('numeric') ||
      dt.includes('decimal') ||
      dt.includes('float') ||
      dt.includes('double') ||
      dt.includes('real') ||
      dt.includes('number')
    ) {
      return { cls: 'number', glyph: '#', labelKey: 'DATASET.DATA_TYPE' };
    }
    if (dt.includes('bool')) {
      return { cls: 'bool', glyph: '✓', labelKey: 'DATASET.DATA_TYPE' };
    }
    if (dt.includes('timestamp') || dt.includes('datetime') || dt === 'time') {
      return { cls: 'datetime', glyph: '⏱', labelKey: 'DATASET.DATA_TYPE' };
    }
    if (dt.includes('date')) {
      return { cls: 'date', glyph: '📅', labelKey: 'DATASET.DATA_TYPE' };
    }
    if (dt.includes('json')) {
      return { cls: 'json', glyph: '{}', labelKey: 'DATASET.DATA_TYPE' };
    }
    return { cls: 'text', glyph: 'Aa', labelKey: 'DATASET.DATA_TYPE' };
  }

  getFieldTypeClass(field: any): string {
    return this.fieldTypeMap(field).cls;
  }

  getFieldTypeGlyph(field: any): string {
    return this.fieldTypeMap(field).glyph;
  }

  getFieldTypeLabel(field: any): string {
    const dt = field?.dataType || field?.type_name || '';
    return dt || this.translate.instant(this.fieldTypeMap(field).labelKey);
  }

  // ── Keyboard navigation on the two list rails ────────────────────
  // ArrowUp/ArrowDown moves selection; Enter inserts the highlighted
  // row at the editor cursor. This lets keyboard-only users build a
  // formula without ever touching the mouse.

  onFieldsListKeydown(event: KeyboardEvent): void {
    if (this.filteredFields.length === 0) return;
    const currentIdx = this.selectedField
      ? this.filteredFields.findIndex(
          (f: any) => f.columnToUse === this.selectedField.columnToUse,
        )
      : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(currentIdx + 1, this.filteredFields.length - 1);
      this.selectDatasetField(this.filteredFields[Math.max(0, next)]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = Math.max(currentIdx - 1, 0);
      this.selectDatasetField(this.filteredFields[prev]);
    } else if (event.key === 'Enter' && this.selectedField) {
      event.preventDefault();
      this.insertField(this.selectedField);
    }
  }

  onFunctionsListKeydown(event: KeyboardEvent): void {
    // Build a flat ordered list of functions across expanded categories
    // — keyboard nav should feel continuous even though the UI groups
    // them. Collapsed categories are skipped.
    const flat: FormulaFunction[] = [];
    for (const cat of this.filteredCategories) {
      if (this.isCategoryExpanded(cat.id)) {
        flat.push(...cat.functions);
      }
    }
    if (flat.length === 0) return;

    const currentIdx = this.selectedFunction
      ? flat.findIndex(fn => fn.name === this.selectedFunction!.name)
      : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(currentIdx + 1, flat.length - 1);
      this.selectFunction(flat[Math.max(0, next)]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = Math.max(currentIdx - 1, 0);
      this.selectFunction(flat[prev]);
    } else if (event.key === 'Enter' && this.selectedFunction) {
      event.preventDefault();
      this.insertFunction(this.selectedFunction);
    }
  }

  onValidate() {
    if (!this.customField.columnToUse || this.isValidating) {
      return;
    }

    this.isValidating = true;
    this.validationResult = null;
    this.isValidated = false;

    // Capture the exact formula being validated. If the user keeps typing
    // while this request is in flight, the response is stale and must NOT
    // flip the UI back to "validated" for a formula that has since changed
    // (that would show a green checkmark on an unvalidated formula and
    // re-enable Save). Both the success and failure branches bail out when
    // the current formula no longer matches what was sent.
    const validatedFormula = this.customField.columnToUse;

    const payload = {
      datasetId: this.editMode ? this.editFieldData?.datasetId : this.datasetId,
      customLogic: validatedFormula,
    };

    this.datasetService
      .validateCustomField(payload)
      .then((response: any) => {
        // Stale response — the formula changed since this validate started.
        // Clear the in-flight flag (onFormulaChange doesn't) so the user can
        // re-validate the new formula, but do NOT mark it validated.
        if (this.customField.columnToUse !== validatedFormula) {
          this.isValidating = false;
          this.cdr.markForCheck();
          return;
        }
        if (this.globalService.handleSuccessService(response, false, false)) {
          this.isValidating = false;
          this.isValidated = true;
          this.validationResult = {
            valid: true,
            message:
              response.message ||
              this.translate.instant('DATASET.FORMULA_VALIDATED'),
          };
          // The engine reports what kind of calculation this is. Surfaced as a
          // badge because the three kinds behave differently: a row calculation
          // is per row, an aggregate collapses the column, and a window
          // calculation depends on row order or partition.
          this.resolvedStage = response?.data?.stage ?? null;
          // Enable Save only when name + formula are present AND there is no
          // outstanding inline name error (e.g. a reserved function name).
          // Without the !fieldNameError guard, validating re-enabled Save
          // even while the inline name error was still shown.
          this.isSaveEnabled =
            !this.fieldNameError &&
            this.customField.columnToView?.trim() !== '' &&
            this.customField.columnToUse?.trim() !== '';
        } else {
          this.isValidating = false;
          this.isValidated = false;
          this.resolvedStage = null;
          this.validationResult = {
            valid: false,
            message:
              response.message ||
              this.translate.instant('DATASET.VALIDATION_FAILED'),
          };
        }
        this.cdr.markForCheck();
      })
      .catch((error: any) => {
        // Stale response — the formula changed since this validate started.
        if (this.customField.columnToUse !== validatedFormula) return;
        this.isValidating = false;
        this.isValidated = false;
        this.resolvedStage = null;
        // The engine returns a source offset with its message, so point the
        // caret at the offending token rather than only printing the text.
        const position = error?.error?.data?.position;
        this.validationResult = {
          valid: false,
          message:
            error?.error?.message ||
            this.translate.instant('DATASET.VALIDATION_FAILED_RETRY'),
        };
        if (typeof position === 'number') this.markErrorPosition(position);
        this.cdr.markForCheck();
      });
  }

  /** i18n key for the stage badge, or null when there is nothing to show. */
  get stageBadgeKey(): string | null {
    if (!this.isValidated || !this.resolvedStage) return null;
    switch (this.resolvedStage) {
      case 'AGG':
        return 'DATASET.STAGE_AGGREGATE';
      case 'WINDOW':
        return 'DATASET.STAGE_WINDOW';
      default:
        return 'DATASET.STAGE_ROW';
    }
  }

  get stageBadgeIcon(): string {
    if (this.resolvedStage === 'AGG') return 'pi-chart-bar';
    if (this.resolvedStage === 'WINDOW') return 'pi-sort-amount-down';
    return 'pi-list';
  }

  /**
   * Put a Monaco marker on the character the engine objected to, so the author
   * sees WHERE the problem is instead of only what it is.
   */
  private markErrorPosition(position: number): void {
    try {
      const model = this.editor?.getModel?.();
      if (!model || typeof monaco === 'undefined') return;
      const at = model.getPositionAt(position);
      monaco.editor.setModelMarkers(model, 'formula', [
        {
          severity: monaco.MarkerSeverity.Error,
          message: this.validationResult?.message ?? '',
          startLineNumber: at.lineNumber,
          startColumn: at.column,
          endLineNumber: at.lineNumber,
          endColumn: at.column + 1,
        },
      ]);
    } catch {
      // A marker is a nicety; never let it break validation feedback.
    }
  }

  // Functions Panel Methods
  getTotalFunctionCount(): number {
    return this.functionCategories.reduce(
      (total: number, cat: FormulaCategory) => total + cat.functions.length,
      0,
    );
  }

  getFilteredFunctionCount(): number {
    return this.filteredCategories.reduce(
      (total: number, cat: FormulaCategory) => total + cat.functions.length,
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
      .map((category: FormulaCategory) => {
        const nameMatches: FormulaFunction[] = [];
        const otherMatches: FormulaFunction[] = [];

        category.functions.forEach((fn: FormulaFunction) => {
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
      .filter((category: FormulaCategory) => category.functions.length > 0);

    // Auto-expand categories that have results
    this.expandedCategories = {};
    this.filteredCategories.forEach((cat: FormulaCategory) => {
      this.expandedCategories[cat.id] = true;
    });
  }

  insertFunction(fn: FormulaFunction) {
    this.insertTextAtCursor(fn.usage);
    this.onFormulaChange();
  }

  selectFunction(fn: FormulaFunction) {
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
