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
import { SECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { SectionService } from '../../services/section.service';

@Component({
  selector: 'app-edit-section',
  templateUrl: './edit-section.component.html',
  styleUrls: ['./edit-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditSectionComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  saving = this.sectionService.saving;

  sectionForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  sectionId: string = '';
  selectedOrgName: string = '';
  selectedDatasourceName: string = '';
  sectionData: any;
  tabs: any[] = [];
  isCancelClicked = false;
  showSaveConfirm = false;
  saveJustification = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private messageService: MessageService,
    private tabService: TabService,
    private sectionService: SectionService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.sectionId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.sectionId) {
      this.loadSectionData();
    }

    this.sectionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  get isFormDirty(): boolean {
    return this.sectionForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm(): void {
    this.sectionForm = this.fb.group({
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
      status: [false],
      tab: ['', Validators.required],
    });
  }

  loadSectionData(): void {
    this.sectionService.resetCurrent();
    this.sectionService
      .loadOne(this.orgId, this.sectionId)
      .then(() => {
        const data = this.sectionService.current();
        if (data) {
          this.sectionData = data;

          this.sectionForm.patchValue({
            id: this.sectionData.id,
            name: this.sectionData.name,
            description: this.sectionData.description,
            organisation: this.sectionData.organisationId,
            datasource: this.sectionData.datasourceId,
            tab: this.sectionData.tabId,
            status: this.sectionData.status,
          });

          this.selectedOrgName = this.sectionData.organisationName || '';
          this.selectedDatasourceName = this.sectionData.datasource?.name || '';

          this.loadTabData();

          this.sectionForm.markAsPristine();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadTabData() {
    if (!this.sectionData) return;
    const param = {
      orgId: this.sectionData.organisationId,
      datasourceId: this.sectionData.datasourceId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };
    this.tabService
      .listTab(param)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.tabs = [...(response.data.tabs ?? response.data ?? [])];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  getNameError(): string {
    const control = this.sectionForm.get('name');
    if (control?.errors?.['required']) return 'Section name is required';
    if (control?.errors?.['minlength'])
      return `Section name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Section name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Section name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  onSubmit(): void {
    if (this.sectionForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      const { id, name, description, organisation, datasource, tab, status } =
        this.sectionForm.value;
      const payload = {
        id,
        name,
        description,
        organisation,
        datasource,
        tab,
        status: status ? 1 : 0,
        justification: this.saveJustification.trim(),
      };
      this.sectionService
        .update(payload)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.sectionForm.markAsPristine();
            this.router.navigate([SECTION.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => {
          this.saveJustification = '';
          this.cdr.markForCheck();
        });
    }
  }

  onCancel(): void {
    if (!this.sectionData) return;
    if (this.isFormDirty) {
      this.sectionForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        description: this.sectionData.description,
        organisation: this.sectionData.organisationId,
        datasource: this.sectionData.datasourceId,
        tab: this.sectionData.tabId,
        status: this.sectionData.status,
      });

      this.selectedOrgName = this.sectionData.organisationName;
      this.isCancelClicked = true;
      this.sectionForm.markAsPristine();
      this.cdr.markForCheck();
    }
  }
}
