import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { OrganisationAdminService } from '../../services/organisationAdmin.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION_ADMIN } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';

@Component({
  selector: 'app-add-org-admin',
  templateUrl: './add-org-admin.component.html',
  styleUrls: ['./add-org-admin.component.scss'],
})
export class AddOrgAdminComponent implements OnInit {
  orgForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private orgAdminService: OrganisationAdminService,
    private organisationService: OrganisationService,
    private globalService: GlobalService
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.orgForm.dirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    }
  }

  initForm() {
    this.orgForm = this.fb.group({
      firstName: [
        '',
        [
          Validators.required,
          Validators.pattern('^[a-zA-Z]+([ -][a-zA-Z]+)*$'),
        ],
      ],
      lastName: [
        '',
        [
          Validators.required,
          Validators.pattern('^[a-zA-Z]+([ -][a-zA-Z]+)*$'),
        ],
      ],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
          Validators.pattern('^[a-zA-Z0-9_]+$'),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        Validators.pattern(
          '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'
        ),
      ],
      mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
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
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data.orgs;
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  togglePassword(event: Event) {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    if (this.orgForm.valid) {
      this.orgAdminService.addOrganisationAdmin(this.orgForm).subscribe({
        next: () => {
          this.router.navigate([ORGANISATION_ADMIN.LIST]);
        },
        error: error => {
          console.error('Error adding organisation admin:', error);
        },
      });
    } else {
      Object.keys(this.orgForm.controls).forEach(key => {
        const control = this.orgForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  onCancel() {
    this.orgForm.reset();
    // Reset specific form controls to empty strings
    Object.keys(this.orgForm.controls).forEach(key => {
      this.orgForm.get(key)?.setValue('');
    });
  }

  onPhoneInput(event: any) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    input.value = value.replace(/\D/g, ''); // Remove non-digit characters
    this.orgForm.patchValue({ mobile: input.value });
  }
}
