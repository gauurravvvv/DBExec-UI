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
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { REGEX } from 'src/app/constants/regex.constant';
import { TAB } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
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
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedDatasource: any = null;
  datasources: any[] = [];
  isNewlyAdded: boolean = false;
  lastAddedTabIndex: number = -1;
  hasDuplicates: boolean = false;
  duplicateRows: { [key: string]: Array<[number, number]> } = {};

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private tabService: TabService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
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
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatasources();
    }

    // Subscribe to form changes to check for duplicates
    this.tabGroups.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkForDuplicates();
      });
  }

  initForm() {
    this.tabForm = this.fb.group({
      organisation: [
        {
          value:
            this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
              ? ''
              : this.globalService.getTokenDetails('organisationId'),
          disabled: false,
        },
        Validators.required,
      ],
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
    if (control?.errors?.['required']) return 'Tab name is required';
    if (control?.errors?.['minlength'])
      return `Tab name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Tab name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Tab name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
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

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
      }
      this.cdr.markForCheck();
    });
  }

  onSubmit() {
    this.checkForDuplicates();
    if (this.hasDuplicates) {
      return; // Prevent submission if duplicates exist
    }
    if (this.tabForm.valid) {
      const { organisation, datasource, tabs } = this.tabForm.value;
      this.tabService
        .add({ organisation, datasource, tabs })
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

  onOrganisationChange(event: any) {
    this.selectedOrg = {
      id: event.value,
    };
    this.selectedDatasource = null;

    this.tabForm.get('datasource')?.setValue('');

    this.clearAllTabs();
    this.loadDatasources();
  }

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
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasourceService.listDatasource(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasources = [...(response.data.datasources || [])];
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
