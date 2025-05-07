import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { SECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { SectionService } from '../../services/section.service';

@Component({
  selector: 'app-edit-section',
  templateUrl: './edit-section.component.html',
  styleUrls: ['./edit-section.component.scss'],
})
export class EditSectionComponent implements OnInit {
  sectionForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  sectionId: string = '';
  selectedOrgName: string = '';
  selectedDatabaseName: string = '';
  sectionData: any;
  tabs: any[] = [];
  isCancelClicked = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private messageService: MessageService,
    private tabService: TabService,
    private sectionService: SectionService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.sectionId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.sectionId) {
      this.loadSectionData();
    }

    this.sectionForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
    });
  }

  get isFormDirty(): boolean {
    return this.sectionForm.dirty;
  }

  initForm(): void {
    this.sectionForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      description: [''],
      organisation: [''],
      database: [''],
      status: [false],
      tab: ['', Validators.required],
    });
  }

  loadSectionData(): void {
    this.sectionService
      .viewSection(this.orgId, this.sectionId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.sectionData = response.data;

          this.sectionForm.patchValue({
            id: this.sectionData.id,
            name: this.sectionData.name,
            description: this.sectionData.description,
            organisation: this.sectionData.organisationId,
            database: this.sectionData.databaseId,
            tab: this.sectionData.tabId,
            status: this.sectionData.status,
          });

          this.selectedOrgName = this.sectionData.organisationName || '';
          this.selectedDatabaseName = this.sectionData.databaseName || '';

          this.loadTabData();

          this.sectionForm.markAsPristine();
        }
      });
  }

  loadTabData() {
    const param = {
      orgId: this.sectionData.organisationId,
      databaseId: this.sectionData.databaseId,
      pageNumber: 1,
      limit: 100,
    };
    this.tabService.listTab(param).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabs = [...response.data];
      }
    });
  }

  onSubmit(): void {
    if (this.sectionForm.valid) {
      this.sectionService.updateSection(this.sectionForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([SECTION.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.sectionForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        description: this.sectionData.description,
        organisation: this.sectionData.organisation,
        database: this.sectionData.database,
        status: this.sectionData.status,
      });

      this.selectedOrgName = this.sectionData.organisationName;
      this.isCancelClicked = true;
      this.sectionForm.markAsPristine();
    }
  }
}
