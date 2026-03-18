import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { TAB } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-edit-tab',
  templateUrl: './edit-tab.component.html',
  styleUrls: ['./edit-tab.component.scss'],
})
export class EditTabComponent implements OnInit {
  tabForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  tabId: string = '';
  selectedOrgName: string = '';
  selectedDatabaseName: string = '';
  tabData: any;
  isCancelClicked = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private tabService: TabService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.tabId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.tabId) {
      this.loadTabData();
    }

    this.tabForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
    });
  }

  get isFormDirty(): boolean {
    return this.tabForm.dirty;
  }

  initForm(): void {
    this.tabForm = this.fb.group({
      id: [''],
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
      organisation: [''],
      database: [''],
      status: [false],
    });
  }

  loadTabData(): void {
    this.tabService.viewTab(this.orgId, this.tabId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabData = response.data;

        this.tabForm.patchValue({
          id: this.tabData.id,
          name: this.tabData.name,
          description: this.tabData.description,
          organisation: this.tabData.organisationId,
          database: this.tabData.databaseId,
          status: this.tabData.status,
        });

        this.selectedOrgName = this.tabData.organisationName || '';
        this.selectedDatabaseName = this.tabData.databaseName || '';

        this.tabForm.markAsPristine();
      }
    });
  }

  onSubmit(): void {
    if (this.tabForm.valid) {
      this.tabService.updateTab(this.tabForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([TAB.LIST]);
        }
      });
    }
  }

  getNameError(): string {
    const control = this.tabForm.get('name');
    if (control?.errors?.['required']) return 'Tab name is required';
    if (control?.errors?.['minlength'])
      return `Tab name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Tab name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Tab name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  onCancel(): void {
    if (this.isFormDirty) {
      // Restore basic form values
      this.tabForm.patchValue({
        id: this.tabData.id,
        name: this.tabData.name,
        description: this.tabData.description,
        organisation: this.tabData.organisationId,
        database: this.tabData.databaseId,
        status: this.tabData.status,
      });

      this.selectedOrgName = this.tabData.organisationName;
      this.isCancelClicked = true;
      this.tabForm.markAsPristine();
    } else {
      this.router.navigate([TAB.LIST]);
    }
  }
}
