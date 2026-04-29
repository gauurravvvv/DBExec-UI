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
import { SECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { TranslateService } from '@ngx-translate/core';
import { SectionService } from '../../services/section.service';

@Component({
  selector: 'app-add-section',
  templateUrl: './add-section.component.html',
  styleUrls: ['./add-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSectionComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  saving = this.sectionService.saving;

  sectionForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN;
  selectedOrg: any = null;
  selectedDatasource: any = null;
  datasources: any[] = [];
  tabs: any[] = [];
  hasDuplicates: boolean = false;
  duplicateRows: { [key: string]: Array<[number, number]> } = {};
  isNewlyAdded: boolean = false;
  isNewlyAddedSection: boolean = false;
  lastAddedSectionIndex: number = -1;
  lastAddedGroupIndex: number = -1;
  expandedGroups: Set<number> = new Set();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private tabService: TabService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private sectionService: SectionService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.sectionForm.dirty;
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

    this.sectionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkForDuplicates();
      });
  }

  initForm() {
    this.sectionForm = this.fb.group({
      organisation: [
        {
          value:
            this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN
              ? ''
              : this.globalService.getTokenDetails('organisationId'),
          disabled: false,
        },
        Validators.required,
      ],
      datasource: [{ value: '', disabled: false }, Validators.required],
      tabGroups: this.fb.array([]),
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  get tabGroups(): FormArray {
    return this.sectionForm.get('tabGroups') as FormArray;
  }

  createTabGroup(): FormGroup {
    return this.fb.group({
      tab: ['', Validators.required],
      sections: this.fb.array([this.createSection()]),
    });
  }

  createSection(): FormGroup {
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
    if (control?.errors?.['required']) return this.translate.instant('SECTION_MODULE.NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('SECTION_MODULE.NAME_MIN', { min: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('SECTION_MODULE.NAME_MAX', { max: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('SECTION_MODULE.NAME_PATTERN');
    return '';
  }

  getTabSections(groupIndex: number): FormArray {
    return this.tabGroups.at(groupIndex).get('sections') as FormArray;
  }

  addTabGroup() {
    this.tabGroups.push(this.createTabGroup());
    const newIndex = this.tabGroups.length - 1;
    this.lastAddedGroupIndex = newIndex;
    this.expandedGroups.add(newIndex);

    this.scrollToBottom();
    setTimeout(() => {
      this.isNewlyAdded = true;
      setTimeout(() => {
        this.isNewlyAdded = false;
        this.lastAddedGroupIndex = -1;
      }, 500);
    }, 300);
  }

  removeTabGroup(index: number) {
    this.tabGroups.removeAt(index);
    this.expandedGroups.delete(index);
    // Re-index expanded groups above the removed index
    const newExpanded = new Set<number>();
    this.expandedGroups.forEach(i => {
      if (i > index) {
        newExpanded.add(i - 1);
      } else {
        newExpanded.add(i);
      }
    });
    this.expandedGroups = newExpanded;
    this.checkForDuplicates();
  }

  clearAllTabs() {
    while (this.tabGroups.length !== 0) {
      this.tabGroups.removeAt(0);
    }
    this.expandedGroups.clear();
    this.addTabGroup();
  }

  addSectionToTab(groupIndex: number) {
    const sections = this.getTabSections(groupIndex);
    sections.push(this.createSection());
    this.expandedGroups.add(groupIndex);

    this.lastAddedSectionIndex = sections.length - 1;
    this.lastAddedGroupIndex = groupIndex;

    this.scrollToBottom();
    setTimeout(() => {
      this.isNewlyAddedSection = true;
      setTimeout(() => {
        this.isNewlyAddedSection = false;
        this.lastAddedSectionIndex = -1;
        this.lastAddedGroupIndex = -1;
      }, 500);
    }, 300);
  }

  toggleGroup(index: number) {
    if (this.expandedGroups.has(index)) {
      this.expandedGroups.delete(index);
    } else {
      this.expandedGroups.add(index);
    }
  }

  isGroupExpanded(index: number): boolean {
    return this.expandedGroups.has(index);
  }

  expandAll() {
    for (let i = 0; i < this.tabGroups.length; i++) {
      this.expandedGroups.add(i);
    }
  }

  collapseAll() {
    this.expandedGroups.clear();
  }

  get areAllExpanded(): boolean {
    return (
      this.tabGroups.length > 0 &&
      this.expandedGroups.size === this.tabGroups.length
    );
  }

  get hasEmptySections(): boolean {
    return this.tabGroups.controls.some(
      group => (group.get('sections') as FormArray).length === 0,
    );
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

  removeSectionFromTab(groupIndex: number, sectionIndex: number) {
    const sections = this.getTabSections(groupIndex);
    sections.removeAt(sectionIndex);
    this.checkForDuplicates();
  }

  getAvailableTabs(currentIndex: number): any[] {
    const selectedTabs = this.tabGroups.controls
      .map((group, index) =>
        index !== currentIndex ? group.get('tab')?.value : null,
      )
      .filter(tab => tab !== null);

    return this.tabs.filter(tab => !selectedTabs.includes(tab.id));
  }

  checkForDuplicates() {
    this.hasDuplicates = false;
    this.duplicateRows = {};

    this.tabGroups.controls.forEach((group, groupIndex) => {
      const nameMap = new Map<string, Array<number>>();
      const sections = this.getTabSections(groupIndex);

      sections.controls.forEach((section, sectionIndex) => {
        const name = section.get('name')?.value?.trim().toLowerCase();
        if (name) {
          if (!nameMap.has(name)) {
            nameMap.set(name, [sectionIndex]);
          } else {
            nameMap.get(name)?.push(sectionIndex);
          }
        }
      });

      nameMap.forEach((sectionIndices, name) => {
        if (sectionIndices.length > 1) {
          this.hasDuplicates = true;
          this.duplicateRows[`${groupIndex}-${name}`] = sectionIndices.map(
            index => [groupIndex, index],
          );
        }
      });
    });
  }

  isDuplicateRow(groupIndex: number, sectionIndex: number): boolean {
    return Object.values(this.duplicateRows).some(positions =>
      positions.some(([g, s]) => g === groupIndex && s === sectionIndex),
    );
  }

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService
      .listOrganisation(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = [...response.data.orgs];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onSubmit() {
    this.checkForDuplicates();
    if (this.hasDuplicates) {
      return;
    }

    if (this.sectionForm.valid) {
      const formValue = this.sectionForm.value;

      const transformedData = {
        organisation: formValue.organisation,
        datasource: formValue.datasource,
        sections: this.transformSections(formValue.tabGroups),
      };

      this.sectionService
        .add(transformedData)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.sectionForm.markAsPristine();
            this.router.navigate([SECTION.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }

  private transformSections(tabGroups: any[]): any[] {
    const sections: any[] = [];

    tabGroups.forEach(group => {
      if (group.tab) {
        group.sections.forEach((section: any) => {
          sections.push({
            name: section.name,
            description: section.description,
            tabId: group.tab,
          });
        });
      }
    });

    return sections;
  }

  onCancel() {
    this.tabGroups.clear();
    this.expandedGroups.clear();
    this.sectionForm.reset();
    this.addTabGroup();
    this.cdr.markForCheck();
  }

  onOrganisationChange(event: any) {
    this.selectedOrg = {
      id: event.value,
    };
    this.selectedDatasource = null;

    this.sectionForm.get('datasource')?.setValue('');

    this.clearAllTabs();
    this.loadDatasources();
  }

  private loadDatasources() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasourceService
      .listDatasource(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasources = [...(response.data.datasources || [])];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onDatasourceChange(event: any) {
    if (event.value) {
      this.selectedDatasource = {
        id: event.value,
      };
      this.loadTabs();
      while (this.tabGroups.length !== 0) {
        this.tabGroups.removeAt(0);
      }
      this.addTabGroup();
    }
  }

  loadTabs() {
    const param = {
      orgId: this.selectedOrg.id,
      datasourceId: this.selectedDatasource.id,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };
    this.tabService
      .listTab(param)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.tabs = [...response.data.tabs];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onTabChange(event: any, groupIndex: number) {
    if (event.value) {
      const sections = this.getTabSections(groupIndex);
      while (sections.length !== 0) {
        sections.removeAt(0);
      }
      sections.push(this.createSection());
    }
  }
}
