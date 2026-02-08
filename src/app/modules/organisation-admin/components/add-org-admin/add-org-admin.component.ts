import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { OrganisationAdminService } from '../../services/organisationAdmin.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION_ADMIN } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { REGEX } from 'src/app/constants/regex.constant';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-add-org-admin',
  templateUrl: './add-org-admin.component.html',
  styleUrls: ['./add-org-admin.component.scss'],
})
export class AddOrgAdminComponent implements OnInit {
  adminFrom!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private orgAdminService: OrganisationAdminService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.adminFrom.dirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    }
  }

  initForm() {
    this.adminFrom = this.fb.group({
      firstName: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
          Validators.maxLength(30),
          Validators.pattern(REGEX.firstName),
        ],
      ],
      lastName: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
          Validators.maxLength(30),
          Validators.pattern(REGEX.lastName),
        ],
      ],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(6),
          Validators.maxLength(30),
          Validators.pattern(REGEX.username),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.pattern(REGEX.password)]],
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
    });
  }

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
      }
    });
  }

  togglePassword(event: Event) {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    if (this.adminFrom.valid) {
      this.orgAdminService
        .addOrganisationAdmin(this.adminFrom)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([ORGANISATION_ADMIN.LIST]);
          }
        });
    }
  }

  onCancel() {
    this.adminFrom.reset();
    // Reset specific form controls to empty strings
    Object.keys(this.adminFrom.controls).forEach(key => {
      this.adminFrom.get(key)?.setValue('');
    });
  }
}
