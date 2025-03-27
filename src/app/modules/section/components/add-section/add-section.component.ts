import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { SECTION, TAB } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { SectionService } from '../../services/section.service';

@Component({
  selector: 'app-add-section',
  templateUrl: './add-section.component.html',
  styleUrls: ['./add-section.component.scss'],
})
export class AddSectionComponent implements OnInit {
  sectionForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedDatabase: any = null;
  databases: any[] = [];
  tabs: any[] = [];
  hasDuplicates: boolean = false;
  duplicateRows: { [key: string]: Array<[number, number]> } = {};
  isNewlyAdded: boolean = false;
  lastAddedSectionIndex: number = -1;
  lastAddedGroupIndex: number = -1;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private tabService: TabService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private databaseService: DatabaseService,
    private sectionService: SectionService
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.sectionForm.dirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    }
  }

  initForm() {
    this.sectionForm = this.fb.group({
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      database: ['', Validators.required],
      tabGroups: this.fb.array([this.createTabGroup()]),
    });
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
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [
        '',
        [Validators.required, Validators.pattern(REGEX.lastName)],
      ],
    });
  }

  getTabSections(groupIndex: number): FormArray {
    return this.tabGroups.at(groupIndex).get('sections') as FormArray;
  }

  addTabGroup() {
    this.tabGroups.push(this.createTabGroup());

    // Reset any previous highlights
    this.lastAddedGroupIndex = -1;
    this.isNewlyAdded = false;

    // Set new highlights
    setTimeout(() => {
      this.lastAddedGroupIndex = this.tabGroups.length - 1;
      this.isNewlyAdded = true;

      const element = document.querySelector('.schema-group:last-child');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Reset highlight after animation
      setTimeout(() => {
        this.lastAddedGroupIndex = -1;
        this.isNewlyAdded = false;
      }, 500);
    });
  }

  removeTabGroup(index: number) {
    this.tabGroups.removeAt(index);
    this.checkForDuplicates();
  }

  clearAllTabs() {
    while (this.tabGroups.length !== 0) {
      this.tabGroups.removeAt(0);
    }
    this.addTabGroup();
  }

  addSectionToTab(groupIndex: number) {
    const sections = this.getTabSections(groupIndex);
    sections.push(this.createSection());

    // First reset any existing highlights
    this.lastAddedSectionIndex = -1;
    this.lastAddedGroupIndex = -1;
    this.isNewlyAdded = false;

    // Force a reflow
    void document.body.offsetHeight;

    // Then set new highlights
    this.lastAddedSectionIndex = sections.length - 1;
    this.lastAddedGroupIndex = groupIndex;
    this.isNewlyAdded = true;

    // Scroll to new element
    setTimeout(() => {
      const element = document.querySelector(
        `.schema-group:nth-child(${groupIndex + 1}) .mapping-row:last-child`
      );
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    // Reset highlight after animation
    setTimeout(() => {
      this.lastAddedSectionIndex = -1;
      this.lastAddedGroupIndex = -1;
      this.isNewlyAdded = false;
    }, 500);
  }

  removeSectionFromTab(groupIndex: number, sectionIndex: number) {
    const sections = this.getTabSections(groupIndex);
    sections.removeAt(sectionIndex);
    this.checkForDuplicates();
  }

  getAvailableTabs(currentIndex: number): any[] {
    const selectedTabs = this.tabGroups.controls
      .map((group, index) =>
        index !== currentIndex ? group.get('tab')?.value : null
      )
      .filter(tab => tab !== null);

    return this.tabs.filter(tab => !selectedTabs.includes(tab.id));
  }

  isDuplicateRow(groupIndex: number, sectionIndex: number): boolean {
    const currentSection = this.getTabSections(groupIndex).at(sectionIndex);
    const currentName = currentSection.get('name')?.value?.trim().toLowerCase();

    if (!currentName) return false;

    let duplicateFound = false;
    this.tabGroups.controls.forEach((group, gIndex) => {
      const sections = this.getTabSections(gIndex);
      sections.controls.forEach((section, sIndex) => {
        if (gIndex === groupIndex && sIndex === sectionIndex) return;

        const name = section.get('name')?.value?.trim().toLowerCase();
        if (name === currentName) {
          duplicateFound = true;
        }
      });
    });

    return duplicateFound;
  }

  checkForDuplicates() {
    this.hasDuplicates = false;
    const nameMap = new Map<string, Array<[number, number]>>();

    this.tabGroups.controls.forEach((group, groupIndex) => {
      const sections = this.getTabSections(groupIndex);
      sections.controls.forEach((section, sectionIndex) => {
        const name = section.get('name')?.value?.trim().toLowerCase();
        if (name) {
          if (!nameMap.has(name)) {
            nameMap.set(name, [[groupIndex, sectionIndex]]);
          } else {
            nameMap.get(name)?.push([groupIndex, sectionIndex]);
          }
        }
      });
    });

    nameMap.forEach((positions, name) => {
      if (positions.length > 1) {
        this.hasDuplicates = true;
        this.duplicateRows[name] = positions;
      }
    });
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data.orgs;
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  onSubmit() {
    this.checkForDuplicates();
    if (this.hasDuplicates) {
      return;
    }
    if (this.sectionForm.valid) {
      this.sectionService.addSection(this.sectionForm).subscribe({
        next: () => {
          this.router.navigate([SECTION.LIST]);
        },
        error: error => {
          console.error('Error adding section:', error);
        },
      });
    } else {
      Object.keys(this.sectionForm.controls).forEach(key => {
        const control = this.sectionForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
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
    this.loadDatabases();
  }

  private loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).subscribe({
      next: (response: any) => {
        this.databases = response.data;
      },
      error: error => {
        this.databases = [];
        console.error('Error loading databases:', error);
      },
    });
  }

  onDatabaseChange(event: any) {
    if (event.value) {
      this.selectedDatabase = {
        id: event.value,
      };
      this.loadTabs();
      // Reset tab groups when database changes
      while (this.tabGroups.length !== 0) {
        this.tabGroups.removeAt(0);
      }
      this.addTabGroup();
    }
  }

  loadTabs() {
    const param = {
      orgId: this.selectedOrg.id,
      databaseId: this.selectedDatabase.id,
      pageNumber: 1,
      limit: 100,
    };
    this.tabService.listTab(param).subscribe({
      next: (response: any) => {
        this.tabs = response.data;
      },
      error: error => {
        console.error('Error loading tabs:', error);
      },
    });
  }
}
