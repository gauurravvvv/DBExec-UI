import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
    private tabService: TabService
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
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
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

  onCancel(): void {
    if (this.isFormDirty) {
      // Restore basic form values
      this.tabForm.patchValue({
        id: this.tabData.id,
        name: this.tabData.name,
        description: this.tabData.description,
        organisation: this.tabData.organisation,
        database: this.tabData.database,
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
