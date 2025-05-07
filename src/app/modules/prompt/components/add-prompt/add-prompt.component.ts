import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { PROMPT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { PromptService } from 'src/app/modules/prompt/services/prompt.service';
import { SectionService } from 'src/app/modules/section/services/section.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { PROMPT_TYPES } from '../../constants/prompt.constant';

@Component({
  selector: 'app-add-prompt',
  templateUrl: './add-prompt.component.html',
  styleUrls: ['./add-prompt.component.scss'],
})
export class AddPromptComponent implements OnInit {
  sectionForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedTab: any = null;
  selectedDatabase: any = null;
  databases: any[] = [];
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

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private tabService: TabService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private databaseService: DatabaseService,
    private sectionService: SectionService,
    private promptService: PromptService
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.sectionForm.dirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatabases();
    }

    this.sectionForm.valueChanges.subscribe(() => {
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
      database: [{ value: '', disabled: true }, Validators.required],
      tab: [{ value: '', disabled: true }, Validators.required],
      sectionGroups: this.fb.array([]),
    });

    if (this.selectedTab) {
      this.addSectionGroup();
    }

    if (!this.showOrganisationDropdown) {
      this.sectionForm.get('database')?.enable();
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
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [''],
      type: ['', Validators.required],
    });
  }

  addSectionGroup() {
    this.sectionGroups.push(this.createSectionGroup());
    this.lastAddedGroupIndex = this.sectionGroups.length - 1;

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
    this.checkForDuplicates();
  }

  addPromptToSection(groupIndex: number) {
    const prompts = this.getPrompts(groupIndex);
    prompts.push(this.createPrompt());
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
            index => [groupIndex, index] as [number, number]
          );
        }
      });
    });
  }

  isDuplicateRow(groupIndex: number, promptIndex: number): boolean {
    return Object.values(this.duplicateRows).some(positions =>
      positions.some(([g, s]) => g === groupIndex && s === promptIndex)
    );
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
      }
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
        database: formValue.database,
        tab: formValue.tab,
        prompts: this.transformPrompts(),
      };

      this.promptService.addPrompt(transformedData).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([PROMPT.LIST]);
        }
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
    this.sectionForm.reset();
    Object.keys(this.sectionForm.controls).forEach(key => {
      this.sectionForm.get(key)?.setValue('');
    });
  }

  onOrganisationChange(event: any) {
    this.selectedOrg = {
      id: event.value,
    };
    this.selectedDatabase = null;

    const databaseControl = this.sectionForm.get('database');
    const tabControl = this.sectionForm.get('tab');

    databaseControl?.enable();
    tabControl?.disable();

    databaseControl?.setValue('');
    tabControl?.setValue('');

    this.clearAllSectionGroups();
    this.loadDatabases();
  }

  private loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = response.data;
      }
    });
  }

  onDatabaseChange(event: any) {
    if (event.value) {
      this.selectedDatabase = {
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
    const param = {
      orgId: this.selectedOrg.id,
      databaseId: this.selectedDatabase.id,
      pageNumber: 1,
      limit: 100,
    };
    this.tabService.listTab(param).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabs = response.data;
      }
    });
  }

  loadSections() {
    const params = {
      orgId: this.selectedOrg.id,
      databaseId: this.selectedDatabase.id,
      tabId: this.selectedTab.id,
      pageNumber: 1,
      limit: 100,
    };
    this.sectionService.listSection(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.sections = response.data;
        if (this.sectionGroups.length === 0) {
          this.addSectionGroup();
        }
      }
    });
  }

  onSectionChange(event: any) {
    if (event.value) {
      this.selectedSection = {
        id: event.value,
      };
      this.clearAllSectionGroups();
      this.addSectionGroup();
    }
  }

  getAvailableSections(currentIndex: number): any[] {
    const selectedSections = this.sectionGroups.controls
      .map((group, index) =>
        index !== currentIndex ? group.get('sectionId')?.value : null
      )
      .filter(section => section !== null);

    return this.sections.filter(
      section => !selectedSections.includes(section.id)
    );
  }
}
