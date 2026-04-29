import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { REGEX } from 'src/app/constants/regex.constant';
import { PROMPT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { SectionService } from 'src/app/modules/section/services/section.service';
import { PromptService } from '../../services/prompt.service';

@Component({
  selector: 'app-edit-prompt',
  templateUrl: './edit-prompt.component.html',
  styleUrls: ['./edit-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditPromptComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  promptForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
  orgId: string = '';
  promptId: string = '';
  selectedOrgName: string = '';
  selectedDatasourceName: string = '';
  selectedTabName: string = '';
  sectionData: any = null;
  sections: any[] = [];
  isCancelClicked = false;
  showSaveConfirm = false;
  saveJustification = '';
  saving = this.promptService.saving;

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

    this.promptForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  get isFormDirty(): boolean {
    return this.promptForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm(): void {
    this.promptForm = this.fb.group({
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
      datasource: [''],
      tab: [''],
      section: ['', Validators.required],
      status: [false],
    });
  }

  loadPromptData(): void {
    this.promptService.resetCurrent();
    this.promptService
      .loadOne(this.orgId, this.promptId)
      .then(() => {
        const data = this.promptService.current();
        if (data) {
          this.sectionData = data;

          this.promptForm.patchValue({
            id: this.sectionData.id,
            name: this.sectionData.name,
            description: this.sectionData.description,
            organisation: this.sectionData.organisationId,
            datasource: this.sectionData.datasourceId,
            tab: this.sectionData.section.tab.id,
            section: this.sectionData.section.id,
            status: this.sectionData.status,
          });

          this.selectedOrgName = this.sectionData.organisationName || '';
          this.selectedDatasourceName = this.sectionData.datasource?.name || '';
          this.selectedTabName = this.sectionData.section.tab.name || '';
          this.loadSectionData();

          this.promptForm.markAsPristine();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadSectionData() {
    const param = {
      orgId: this.sectionData.organisationId,
      tabId: this.sectionData.section.tab.id,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };
    this.sectionService
      .listSection(param)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.sections = response.data.sections ?? response.data ?? [];
        }
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  getNameError(): string {
    const control = this.promptForm.get('name');
    if (control?.errors?.['required']) return 'Prompt name is required';
    if (control?.errors?.['minlength'])
      return `Prompt name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Prompt name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Prompt name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  onSubmit(): void {
    if (this.promptForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      this.promptService
        .update(this.promptForm, this.saveJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.promptForm.markAsPristine();
            this.router.navigate([PROMPT.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.cdr.markForCheck();
        });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      if (!this.sectionData) return;
      // Restore basic form values
      this.promptForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        description: this.sectionData.description,
        organisation: this.sectionData.organisationId,
        section: this.sectionData.section.id,
        datasource: this.sectionData.datasourceId,
        status: this.sectionData.status,
      });

      this.selectedOrgName = this.sectionData.organisationName;
      this.isCancelClicked = true;
      this.promptForm.markAsPristine();
    }
  }
}
