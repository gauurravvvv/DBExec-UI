import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { PromptService } from '../../services/prompt.service';
import { SectionService } from 'src/app/modules/section/services/section.service';
import { PROMPT } from 'src/app/constants/routes';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-edit-prompt',
  templateUrl: './edit-prompt.component.html',
  styleUrls: ['./edit-prompt.component.scss'],
})
export class EditPromptComponent implements OnInit {
  promptForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  promptId: string = '';
  selectedOrgName: string = '';
  selectedDatabaseName: string = '';
  selectedTabName: string = '';
  sectionData: any;
  sections: any[] = [];
  isCancelClicked = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private messageService: MessageService,
    private sectionService: SectionService,
    private promptService: PromptService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.promptId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.promptId) {
      this.loadPromptData();
    }

    this.promptForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
    });
  }

  get isFormDirty(): boolean {
    return this.promptForm.dirty;
  }

  initForm(): void {
    this.promptForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      description: [''],
      organisation: [''],
      database: [''],
      tab: [''],
      section: ['', Validators.required],
      status: [false],
    });
  }

  loadPromptData(): void {
    this.promptService.viewPrompt(this.orgId, this.promptId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.sectionData = response.data;

        this.promptForm.patchValue({
          id: this.sectionData.id,
          name: this.sectionData.name,
          description: this.sectionData.description,
          organisation: this.sectionData.organisationId,
          database: this.sectionData.databaseId,
          tab: this.sectionData.section.tab.id,
          section: this.sectionData.section.id,
          status: this.sectionData.status,
        });

        this.selectedOrgName = this.sectionData.organisationName || '';
        this.selectedDatabaseName = this.sectionData.databaseName || '';
        this.selectedTabName = this.sectionData.section.tab.name || '';
        this.loadSectionData();

        this.promptForm.markAsPristine();
      }
    });
  }

  loadSectionData() {
    const param = {
      orgId: this.sectionData.organisationId,
      tabId: this.sectionData.section.tab.id,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };
    this.sectionService.listSection(param).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.sections = response.data;
      }
    });
  }

  onSubmit(): void {
    if (this.promptForm.valid) {
      this.promptService.updatePrompt(this.promptForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([PROMPT.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      // Restore basic form values
      this.promptForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        description: this.sectionData.description,
        organisation: this.sectionData.organisationId,
        section: this.sectionData.section.id,
        database: this.sectionData.databaseId,
        status: this.sectionData.status,
      });

      this.selectedOrgName = this.sectionData.organisationName;
      this.isCancelClicked = true;
      this.promptForm.markAsPristine();
    }
  }
}
