import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { TAB } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-add-tab',
  templateUrl: './add-tab.component.html',
  styleUrls: ['./add-tab.component.scss'],
})
export class AddTabComponent implements OnInit {
  tabForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedDatabase: any = null;
  databases: any[] = [];
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
    private databaseService: DatabaseService
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.tabForm.dirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    }

    // Subscribe to form changes to check for duplicates
    this.tabGroups.valueChanges.subscribe(() => {
      this.checkForDuplicates();
    });
  }

  initForm() {
    this.tabForm = this.fb.group({
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      database: ['', Validators.required],
      tabs: this.fb.array([this.createTabGroup()]), // Initialize with one tab group
    });
  }

  createTabGroup(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: ['', [Validators.pattern(REGEX.lastName)]],
    });
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
      return; // Prevent submission if duplicates exist
    }
    if (this.tabForm.valid) {
      this.tabService.addTab(this.tabForm).subscribe({
        next: () => {
          this.router.navigate([TAB.LIST]);
        },
        error: error => {
          console.error('Error adding tab:', error);
        },
      });
    } else {
      Object.keys(this.tabForm.controls).forEach(key => {
        const control = this.tabForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  onCancel() {
    this.tabForm.reset();
    Object.keys(this.tabForm.controls).forEach(key => {
      this.tabForm.get(key)?.setValue('');
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
      duplicates.some(([index]) => index === rowIndex)
    );
  }
}
