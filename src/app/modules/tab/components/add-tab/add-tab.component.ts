import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { TAB } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-add-tab',
  templateUrl: './add-tab.component.html',
  styleUrls: ['./add-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddTabComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  saving = this.tabService.saving;

  tabForm!: FormGroup;
  showPassword = false;
  selectedDatasource: any = null;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  isNewlyAdded: boolean = false;
  lastAddedTabIndex: number = -1;
  hasDuplicates: boolean = false;
  duplicateRows: { [key: string]: Array<[number, number]> } = {};

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private tabService: TabService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.tabForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit() {
    this.loadDatasources();

    // Subscribe to form changes to check for duplicates
    this.tabGroups.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkForDuplicates();
      });
  }

  initForm() {
    this.tabForm = this.fb.group({
      datasource: [{ value: '', disabled: false }, Validators.required],
      tabs: this.fb.array([]),
    });
  }

  createTabGroup(): FormGroup {
    return this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(64),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: [''],
    });
  }

  getNameError(control: any): string {
    if (control?.errors?.['required'])
      return this.translate.instant('TAB.NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('TAB.NAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('TAB.NAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('TAB.NAME_PATTERN');
    return '';
  }

  trackByIndex(index: number): number {
    return index;
  }

  get tabGroups(): FormArray {
    return this.tabForm.get('tabs') as FormArray;
  }

  addTabGroup() {
    this.tabGroups.push(this.createTabGroup());
    this.lastAddedTabIndex = this.tabGroups.length - 1;

    // First scroll, then highlight
    this.scrollToBottom();
    setTimeout(() => {
      this.isNewlyAdded = true;
      setTimeout(() => {
        this.isNewlyAdded = false;
        this.lastAddedTabIndex = -1;
      }, 500);
    }, 300);
  }

  removeTabGroup(index: number) {
    if (this.tabGroups.length > 1) {
      this.tabGroups.removeAt(index);
    } else {
      this.clearAllTabs();
    }
  }

  scrollToBottom(): void {
    setTimeout(() => {
      const fieldsList = document.querySelector('.fields-list');
      if (fieldsList) {
        fieldsList.scrollTo({
          top: fieldsList.scrollHeight,
          behavior: 'smooth',
        });
      }
    }, 100);
  }

  onSubmit() {
    this.checkForDuplicates();
    if (this.hasDuplicates) {
      return; // Prevent submission if duplicates exist
    }
    if (this.tabForm.valid) {
      const { datasource, tabs } = this.tabForm.value;
      this.tabService
        .add({ datasource, tabs })
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.tabForm.markAsPristine();
            this.router.navigate([TAB.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          // global interceptor shows error toast; ensure UI recovers
          this.cdr.markForCheck();
        });
    }
  }

  onCancel() {
    this.tabGroups.clear();
    this.addTabGroup(); // restore at least one empty row
    this.tabForm.reset();
    this.cdr.markForCheck();
  }

  /**
   * Fetcher for the server-mode datasource dropdown.
   */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  onDatasourceChange(event: any) {
    if (event.value) {
      this.selectedDatasource = {
        id: event.value,
      };

      // Clear existing tabs and add a default one (same as org change)
      this.clearAllTabs();
    }
  }

  private loadDatasources() {
    const params = {
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.datasourceService.listDatasource(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const items = response?.data?.datasources ?? [];
        this.preloadedDatasources = items;
        this.preloadedDatasourcesTotal = response?.data?.count ?? items.length;
        this.datasources = [...items];
      }
      this.cdr.markForCheck();
    });
  }

  // Add new method to check for duplicates
  checkForDuplicates() {
    this.hasDuplicates = false;
    this.duplicateRows = {};

    const tabGroups = this.tabGroups.controls;
    const nameMap = new Map<string, number[]>();

    // Build map of names and their indices
    tabGroups.forEach((group, index) => {
      const name = group.get('name')?.value?.trim().toLowerCase();
      if (name) {
        if (!nameMap.has(name)) {
          nameMap.set(name, [index]);
        } else {
          nameMap.get(name)?.push(index);
        }
      }
    });

    // Check for duplicates
    nameMap.forEach((indices, name) => {
      if (indices.length > 1) {
        this.hasDuplicates = true;
        this.duplicateRows[name] = indices.map(i => [i, 0]); // Using 0 as column index
      }
    });
  }

  isDuplicateRow(rowIndex: number): boolean {
    return Object.values(this.duplicateRows).some(duplicates =>
      duplicates.some(([index]) => index === rowIndex),
    );
  }

  clearAllTabs() {
    while (this.tabGroups.length !== 0) {
      this.tabGroups.removeAt(0);
    }
    this.addTabGroup();
  }
}
