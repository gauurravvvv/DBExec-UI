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
import { Router } from '@angular/router';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { REGEX } from 'src/app/constants/regex.constant';
import { CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { TranslateService } from '@ngx-translate/core';
import { ConnectionService } from '../../services/connection.service';

@Component({
  selector: 'app-add-connection',
  templateUrl: './add-connection.component.html',
  styleUrls: ['./add-connection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddConnectionComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  connectionForm!: FormGroup;
  organisations: any[] = [];
  showPassword = false;
  datasources: any[] = [];
  isFormDirty: boolean = false;

  saving = this.connectionService.saving;

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SYSTEM_ADMIN;
  selectedOrg: any = null;
  selectedDatasource: any = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private connectionService: ConnectionService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatasources();
    }
  }

  private initForm() {
    this.connectionForm = this.fb.group({
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
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      datasource: ['', Validators.required],
      dbUsername: ['', Validators.required],
      dbPassword: ['', Validators.required],
    });

    this.connectionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateFormDirtyState();
      });
  }

  private loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
      }
      this.cdr.markForCheck();
    });
  }

  private loadDatasources() {
    const orgId = this.connectionForm.get('organisation')?.value;
    if (!orgId) return;
    const params = {
      orgId: orgId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasourceService.listDatasource(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasources = [...(response.data.datasources || [])];
      }
      this.cdr.markForCheck();
    });
  }

  onOrganisationChange() {
    this.connectionForm.patchValue({ datasource: null }, { emitEvent: false });
    this.datasources = [];
    this.loadDatasources();
    this.updateFormDirtyState();
  }

  async onSubmit() {
    if (this.connectionForm.valid) {
      const response = await this.connectionService.add(this.connectionForm);
      if (this.globalService.handleSuccessService(response)) {
        this.isFormDirty = false;
        this.router.navigate([CONNECTION.LIST]);
      }
    }
  }

  togglePassword(event: Event) {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  onCancel() {
    if (this.isFormDirty) {
      this.connectionForm.reset();
      this.isFormDirty = false;
    }
  }

  private updateFormDirtyState() {
    this.isFormDirty =
      this.connectionForm.dirty ||
      this.connectionForm.get('organisation')?.value !== '' ||
      this.connectionForm.get('datasource')?.value !== '';
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
