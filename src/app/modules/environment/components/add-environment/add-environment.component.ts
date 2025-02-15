import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { EnvironmentService } from '../../services/environment.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ENVIRONMENT } from 'src/app/constants/routes';

@Component({
  selector: 'app-add-environment',
  templateUrl: './add-environment.component.html',
  styleUrls: ['./add-environment.component.scss'],
})
export class AddEnvironmentComponent implements OnInit {
  envForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private environmentService: EnvironmentService
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.envForm.dirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    }
  }

  initForm() {
    this.envForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.pattern('^[a-zA-Z]+([ -][a-zA-Z]+)*$'),
        ],
      ],
      description: [''],
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
    if (this.envForm.valid) {
      this.environmentService.addEnvironment(this.envForm).subscribe({
        next: () => {
          this.router.navigate([ENVIRONMENT.LIST]);
        },
        error: error => {
          console.error('Error adding environment:', error);
        },
      });
    } else {
      Object.keys(this.envForm.controls).forEach(key => {
        const control = this.envForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  onCancel() {
    this.envForm.reset();
    // Reset specific form controls to empty strings
    Object.keys(this.envForm.controls).forEach(key => {
      this.envForm.get(key)?.setValue('');
    });
  }

  onPhoneInput(event: any) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    input.value = value.replace(/\D/g, ''); // Remove non-digit characters
    this.envForm.patchValue({ mobile: input.value });
  }
}
