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
import { PROMPT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { PromptService } from 'src/app/modules/prompt/services/prompt.service';
import { SectionService } from 'src/app/modules/section/services/section.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { PROMPT_TYPES } from '../../constants/prompt.constant';

@Component({
  selector: 'app-add-prompt',
  templateUrl: './add-prompt.component.html',
  styleUrls: ['./add-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddPromptComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  sectionForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedTab: any = null;
  selectedDatasource: any = null;
  datasources: any[] = [];
  tabs: any[] = [];
  hasDuplicates: boolean = false;
  duplicateRows: { [key: string]: Array<[number, number]> } = {};
  isNewlyAdded: boolean = false;
  isNewlyAddedSection: boolean = false;
  lastAddedSectionIndex: number = -1;
  lastAddedGroupIndex: number = -1;
  sections: any[] = [];
  selectedSection: any = null;
  lastAddedPromptIndex: number = -1;
  promptTypes = PROMPT_TYPES;
  expandedGroups: Set<number> = new Set();
  saving = this.promptService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private tabService: TabService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private sectionService: SectionService,
    private promptService: PromptService,
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
            this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
              ? ''
              : this.globalService.getTokenDetails('organisationId'),
          disabled: false,
        },
        Validators.required,
      ],
      datasource: [{ value: '', disabled: true }, Validators.required],
      tab: [{ value: '', disabled: true }, Validators.required],
      sectionGroups: this.fb.array([]),
    });

    if (this.selectedTab) {
      this.addSectionGroup();
    }

    if (!this.showOrganisationDropdown) {
      this.sectionForm.get('datasource')?.enable();
    }
  }

  get sectionGroups(): FormArray {
    return this.sectionForm.get('sectionGroups') as FormArray;
  }

  createSectionGroup(): FormGroup {
    return this.fb.group({
      sectionId: ['', Validators.required],
      prompts: this.fb.array([this.createPrompt()]),
    });
  }

  getPrompts(groupIndex: number): FormArray {
    return this.sectionGroups.at(groupIndex).get('prompts') as FormArray;
  }

  createPrompt(): FormGroup {
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
      type: ['', Validators.required],
    });
  }

  getNameError(control: any): string {
    if (control?.errors?.['required']) return 'Prompt name is required';
    if (control?.errors?.['minlength'])
      return `Prompt name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Prompt name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Prompt name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  addSectionGroup() {
    this.sectionGroups.push(this.createSectionGroup());
    const newIndex = this.sectionGroups.length - 1;
    this.lastAddedGroupIndex = newIndex;
    this.expandedGroups.add(newIndex);

    this.scrollToBottom();
    setTimeout(() => {
      this.isNewlyAdded = true; // For group highlighting
      setTimeout(() => {
        this.isNewlyAdded = false;
        this.lastAddedGroupIndex = -1;
      }, 500);
    }, 300);
  }

  removeSectionGroup(index: number) {
    this.sectionGroups.removeAt(index);
    this.expandedGroups.delete(index);
    const newExpanded = new Set<number>();
    this.expandedGroups.forEach(i => {
      newExpanded.add(i > index ? i - 1 : i);
    });
    this.expandedGroups = newExpanded;
    this.checkForDuplicates();
  }

  addPromptToSection(groupIndex: number) {
    const prompts = this.getPrompts(groupIndex);
    prompts.push(this.createPrompt());
    this.expandedGroups.add(groupIndex);
    this.lastAddedPromptIndex = prompts.length - 1;
    this.lastAddedGroupIndex = groupIndex;
    this.scrollToBottom();

    setTimeout(() => {
      this.isNewlyAddedSection = true; // For prompt highlighting
      setTimeout(() => {
        this.isNewlyAddedSection = false;
        this.lastAddedPromptIndex = -1;
        this.lastAddedGroupIndex = -1;
      }, 500);
    }, 300);
  }

  removePromptFromSection(groupIndex: number, promptIndex: number) {
    const prompts = this.getPrompts(groupIndex);
    prompts.removeAt(promptIndex);
    this.checkForDuplicates();
  }

  clearAllSectionGroups() {
    while (this.sectionGroups.length !== 0) {
      this.sectionGroups.removeAt(0);
    }
    this.expandedGroups.clear();
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
    for (let i = 0; i < this.sectionGroups.length; i++) {
      this.expandedGroups.add(i);
    }
  }

  collapseAll() {
    this.expandedGroups.clear();
  }

  get areAllExpanded(): boolean {
    return (
      this.sectionGroups.length > 0 &&
      this.expandedGroups.size === this.sectionGroups.length
    );
  }

  get hasEmptyPrompts(): boolean {
    return this.sectionGroups.controls.some(
      group => (group.get('prompts') as FormArray).length === 0,
    );
  }

  scrollToBottom(): void {
    setTimeout(() => {
      const formElement = document.querySelector('.admin-form');
      if (formElement) {
        formElement.scrollTo({
          top: formElement.scrollHeight,
          behavior: 'smooth',
        });
      }
    }, 100);
  }

  checkForDuplicates() {
    this.hasDuplicates = false;
    this.duplicateRows = {};

    this.sectionGroups.controls.forEach((group, groupIndex) => {
      const nameMap = new Map<string, Array<number>>();
      const prompts = this.getPrompts(groupIndex);

      prompts.controls.forEach((prompt, promptIndex) => {
        const name = prompt.get('name')?.value?.trim().toLowerCase();
        if (name) {
          if (!nameMap.has(name)) {
            nameMap.set(name, [promptIndex]);
          } else {
            nameMap.get(name)?.push(promptIndex);
          }
        }
      });

      nameMap.forEach((promptIndices, name) => {
        if (promptIndices.length > 1) {
          this.hasDuplicates = true;
          this.duplicateRows[`${groupIndex}-${name}`] = promptIndices.map(
            index => [groupIndex, index] as [number, number],
          );
        }
      });
    });
  }

  isDuplicateRow(groupIndex: number, promptIndex: number): boolean {
    return Object.values(this.duplicateRows).some(positions =>
      positions.some(([g, s]) => g === groupIndex && s === promptIndex),
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
          this.organisations = response.data.orgs;
        }
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
        tab: formValue.tab,
        prompts: this.transformPrompts(),
      };

      this.promptService
        .add(transformedData)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.sectionForm.markAsPristine();
            this.router.navigate([PROMPT.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }

  private transformPrompts(): any[] {
    const prompts: any[] = [];
    this.sectionGroups.controls.forEach(group => {
      const sectionId = group.get('sectionId')?.value;
      const sectionPrompts = (group.get('prompts') as FormArray).controls;

      sectionPrompts.forEach(prompt => {
        prompts.push({
          name: prompt.get('name')?.value,
          description: prompt.get('description')?.value,
          type: prompt.get('type')?.value,
          sectionId: sectionId,
        });
      });
    });
    return prompts;
  }

  onCancel() {
    // Fix #4: Properly reset form, FormArray, and component states
    this.sectionForm.reset();
    this.clearAllSectionGroups();

    // Reset component state
    this.selectedOrg = this.showOrganisationDropdown
      ? null
      : { id: this.globalService.getTokenDetails('organisationId') };
    this.selectedDatasource = null;
    this.selectedTab = null;
    this.datasources = [];
    this.tabs = [];
    this.sections = [];
    this.hasDuplicates = false;
    this.duplicateRows = {};

    // Re-disable dependent controls
    this.sectionForm.get('datasource')?.disable();
    this.sectionForm.get('tab')?.disable();

    // Re-enable database for non-super-admin
    if (!this.showOrganisationDropdown) {
      this.sectionForm.get('datasource')?.enable();
      this.loadDatasources();
    }
  }

  onOrganisationChange(event: any) {
    this.selectedOrg = {
      id: event.value,
    };
    this.selectedDatasource = null;

    const datasourceControl = this.sectionForm.get('datasource');
    const tabControl = this.sectionForm.get('tab');

    datasourceControl?.enable();
    tabControl?.disable();

    datasourceControl?.setValue('');
    tabControl?.setValue('');

    this.clearAllSectionGroups();
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
          this.datasources = response.data.datasources || [];
        }
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

      const tabControl = this.sectionForm.get('tab');
      tabControl?.enable();
      tabControl?.setValue('');

      this.clearAllSectionGroups();
      this.loadTabs();
    }
  }

  onTabChange(event: any) {
    if (event.value) {
      this.selectedTab = {
        id: event.value,
      };
      this.clearAllSectionGroups();
      this.loadSections();
    }
  }

  loadTabs() {
    // Fix #2: Add null check to prevent crash
    if (!this.selectedOrg || !this.selectedDatasource) {
      console.warn('loadTabs: selectedOrg or selectedDatasource is null');
      return;
    }

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
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadSections() {
    // Fix #3: Add null check to prevent crash
    if (!this.selectedOrg || !this.selectedDatasource || !this.selectedTab) {
      console.warn('loadSections: Required selections are missing');
      return;
    }

    const params = {
      orgId: this.selectedOrg.id,
      datasourceId: this.selectedDatasource.id,
      tabId: this.selectedTab.id,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };
    this.sectionService
      .listSection(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.sections = [...response.data.sections];
          if (this.sectionGroups.length === 0) {
            this.addSectionGroup();
          }
        }
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onSectionChange(event: any, groupIndex: number) {
    if (event.value) {
      // Only reset prompts within this specific section group, not all groups
      const prompts = this.getPrompts(groupIndex);
      while (prompts.length > 0) {
        prompts.removeAt(0);
      }
      prompts.push(this.createPrompt());
    }
  }

  getAvailableSections(currentIndex: number): any[] {
    const selectedSections = this.sectionGroups.controls
      .map((group, index) =>
        index !== currentIndex ? group.get('sectionId')?.value : null,
      )
      .filter(section => section !== null);

    return this.sections.filter(
      section => !selectedSections.includes(section.id),
    );
  }

  trackByIndex(index: number): number {
    return index;
  }
}
