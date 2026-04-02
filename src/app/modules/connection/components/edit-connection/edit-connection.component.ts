import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TAB, CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { ConnectionService } from '../../services/connection.service';
import { REGEX } from 'src/app/constants/regex.constant';

@Component({
  selector: 'app-edit-connection',
  templateUrl: './edit-connection.component.html',
  styleUrls: ['./edit-connection.component.scss'],
})
export class EditConnectionComponent implements OnInit, HasUnsavedChanges {
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

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private tabService: TabService,
    private connectionService: ConnectionService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.connectionId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.connectionId) {
      this.loadConnectionData();
    }

    this.connectionForm.valueChanges.subscribe(() => {
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

  loadConnectionData(): void {
    this.connectionService
      .viewConnection(this.orgId, this.connectionId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.connectionData = response.data;

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
          this.selectedDatasourceName =
            this.connectionData.datasource?.name || '';

          this.connectionForm.markAsPristine();
        }
      });
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

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      this.connectionService
        .updateConnection(this.connectionForm, this.saveJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.connectionForm.markAsPristine();
            this.router.navigate([CONNECTION.LIST]);
          }
        });
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
    if (control?.errors?.['required']) return 'Connection name is required';
    if (control?.errors?.['minlength'])
      return `Connection name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Connection name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Connection name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }
}
