import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TAB, CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { ConnectionService } from '../../services/connection.service';
import { REGEX } from 'src/app/constants/regex.constant';

@Component({
  selector: 'app-edit-connection',
  templateUrl: './edit-connection.component.html',
  styleUrls: ['./edit-connection.component.scss'],
})
export class EditConnectionComponent implements OnInit {
  connectionForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  connectionId: string = '';
  selectedOrgName: string = '';
  selectedDatabaseName: string = '';
  connectionData: any;
  isCancelClicked = false;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private tabService: TabService,
    private connectionService: ConnectionService
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

  initForm(): void {
    this.connectionForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [''],
      organisation: [''],
      database: [''],
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
            database: this.connectionData.databaseId,
            status: this.connectionData.status,
            dbUsername: this.connectionData.dbUsername,
          });

          this.selectedOrgName = this.connectionData.organisationName || '';
          this.selectedDatabaseName = this.connectionData.databaseName || '';

          this.connectionForm.markAsPristine();
        }
      });
  }

  onSubmit(): void {
    if (this.connectionForm.valid) {
      this.connectionService
        .updateConnection(this.connectionForm)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([CONNECTION.LIST]);
          }
        });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      // Restore basic form values
      this.connectionForm.patchValue({
        id: this.connectionData.id,
        name: this.connectionData.name,
        description: this.connectionData.description,
        organisation: this.connectionData.organisationId,
        database: this.connectionData.databaseId,
        status: this.connectionData.status,
        dbUserName: this.connectionData.dbUsername,
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
}
