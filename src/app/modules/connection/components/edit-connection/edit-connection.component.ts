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
import { REGEX } from 'src/app/constants/regex.constant';
import { CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { TranslateService } from '@ngx-translate/core';
import { ConnectionService } from '../../services/connection.service';

@Component({
  selector: 'app-edit-connection',
  templateUrl: './edit-connection.component.html',
  styleUrls: ['./edit-connection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditConnectionComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  connectionForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  connectionId: string = '';
  selectedOrgName: string = '';
  selectedDatasourceName: string = '';
  connectionData: any;
  isCancelClicked = false;
  showPassword = false;
  showSaveConfirm = false;
  saveJustification = '';

  saving = this.connectionService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private connectionService: ConnectionService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.connectionId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.connectionId) {
      this.loadConnectionData();
    }

    this.connectionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  get isFormDirty(): boolean {
    return this.connectionForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm(): void {
    this.connectionForm = this.fb.group({
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
      dbUsername: ['', Validators.required],
      dbPassword: ['', Validators.required],
    });
  }

  async loadConnectionData(): Promise<void> {
    await this.connectionService.loadOne(this.orgId, this.connectionId);
    const data = this.connectionService.current();
    if (data) {
      this.connectionData = data;

      this.connectionForm.patchValue({
        id: this.connectionData.id,
        name: this.connectionData.name,
        description: this.connectionData.description,
        organisation: this.connectionData.organisationId,
        datasource: this.connectionData.datasourceId,
        status: this.connectionData.status,
        dbUsername: this.connectionData.dbUsername,
      });

      this.selectedOrgName = this.connectionData.organisationName || '';
      this.selectedDatasourceName = this.connectionData.datasource?.name || '';

      this.connectionForm.markAsPristine();
    }
    this.cdr.markForCheck();
  }

  onSubmit(): void {
    if (this.connectionForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  async proceedSave(): Promise<void> {
    if (this.saveJustification.trim()) {
      const response = await this.connectionService.update(
        this.connectionForm,
        this.saveJustification.trim(),
      );
      if (this.globalService.handleSuccessService(response)) {
        this.showSaveConfirm = false;
        this.saveJustification = '';
        this.connectionForm.markAsPristine();
        this.router.navigate([CONNECTION.LIST]);
      }
      this.cdr.markForCheck();
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.connectionForm.patchValue({
        id: this.connectionData.id,
        name: this.connectionData.name,
        description: this.connectionData.description,
        organisation: this.connectionData.organisationId,
        datasource: this.connectionData.datasourceId,
        status: this.connectionData.status,
        dbUsername: this.connectionData.dbUsername,
        dbPassword: '',
      });

      this.selectedOrgName = this.connectionData.organisationName;
      this.isCancelClicked = true;
      this.connectionForm.markAsPristine();
    } else {
      this.router.navigate([CONNECTION.LIST]);
    }
  }

  togglePassword(event: Event) {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  getNameError(): string {
    const control = this.connectionForm.get('name');
    if (control?.errors?.['required']) return this.translate.instant('VALIDATION.CONNECTION_NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('VALIDATION.CONNECTION_NAME_MIN_LENGTH', { length: control.errors['minlength'].requiredLength });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('VALIDATION.CONNECTION_NAME_MAX_LENGTH', { length: control.errors['maxlength'].requiredLength });
    if (control?.errors?.['pattern'])
      return this.translate.instant('VALIDATION.CONNECTION_NAME_PATTERN');
    return '';
  }
}
