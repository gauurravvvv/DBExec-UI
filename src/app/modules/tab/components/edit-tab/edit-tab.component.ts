import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { TAB } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from '../../services/tab.service';

@Component({
  selector: 'app-edit-tab',
  templateUrl: './edit-tab.component.html',
  styleUrls: ['./edit-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditTabComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  saving = this.tabService.saving;

  tabForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  tabId: string = '';
  selectedOrgName: string = '';
  selectedDatasourceName: string = '';
  tabData: any;
  isCancelClicked = false;
  showSaveConfirm = false;
  saveJustification = '';

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

    this.tabForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
    });
  }

  get isFormDirty(): boolean {
    return this.tabForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
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
      datasource: [''],
      status: [false],
    });
  }

  async loadTabData(): Promise<void> {
    this.tabService.resetCurrent();
    await this.tabService.loadOne(this.orgId, this.tabId);
    const data = this.tabService.current();
    if (data) {
      this.tabData = data;

      this.tabForm.patchValue({
        id: this.tabData.id,
        name: this.tabData.name,
        description: this.tabData.description,
        organisation: this.tabData.organisationId,
        datasource: this.tabData.datasourceId,
        status: this.tabData.status,
      });

      this.selectedOrgName = this.tabData.organisationName || '';
      this.selectedDatasourceName = this.tabData.datasource?.name || '';

      this.tabForm.markAsPristine();
    }
    this.cdr.markForCheck();
  }

  onSubmit(): void {
    if (this.tabForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  async proceedSave(): Promise<void> {
    if (this.saveJustification.trim()) {
      const { id, name, description, organisation, datasource, status } = this.tabForm.getRawValue();
      const response = await this.tabService.update({
        id,
        name,
        description,
        organisation,
        datasource,
        status: status ? 1 : 0,
        justification: this.saveJustification.trim(),
      });
      if (this.globalService.handleSuccessService(response)) {
        this.showSaveConfirm = false;
        this.saveJustification = '';
        this.tabForm.markAsPristine();
        this.router.navigate([TAB.LIST]);
      }
      this.cdr.markForCheck();
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
        datasource: this.tabData.datasourceId,
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