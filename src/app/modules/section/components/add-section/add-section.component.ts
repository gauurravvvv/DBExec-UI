import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [
        '',
        [Validators.required, Validators.pattern(REGEX.lastName)],
      ],
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      database: ['', Validators.required],
      tab: ['', Validators.required],
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
    this.selectedDatabase = {
      id: event.value,
    };
    this.loadTabs();
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
