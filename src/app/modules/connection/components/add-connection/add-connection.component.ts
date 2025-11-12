import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ConnectionService } from '../../services/connection.service';
import { REGEX } from 'src/app/constants/regex.constant';

@Component({
  selector: 'app-add-connection',
  templateUrl: './add-connection.component.html',
  styleUrls: ['./add-connection.component.scss'],
})
export class AddConnectionComponent implements OnInit {
  connectionForm!: FormGroup;
  organisations: any[] = [];
  showPassword = false;
  databases: any[] = [];
  isFormDirty: boolean = false;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedDatabase: any = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private databaseService: DatabaseService,
    private connectionService: ConnectionService
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
      this.loadDatabases();
    }
  }

  private initForm() {
    this.connectionForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [''],
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      database: ['', Validators.required],
      dbUsername: ['', Validators.required],
      dbPassword: ['', Validators.required],
    });

    this.connectionForm.valueChanges.subscribe(() => {
      this.updateFormDirtyState();
    });
  }

  private loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
      }
    });
  }

  private loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = [...response.data];
      }
    });
  }

  onOrganisationChange(event: any) {
    this.connectionForm.get('database')?.reset();

    this.selectedOrg = {
      id: event.value,
    };
    this.selectedDatabase = null;
    this.loadDatabases();
    this.updateFormDirtyState();
  }

  onSubmit() {
    if (this.connectionForm.valid) {
      const formValue = this.connectionForm.value;

      this.connectionService
        .addConnection(this.connectionForm)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([CONNECTION.LIST]);
          }
        });
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
      this.connectionForm.get('database')?.value !== '';
  }
}
