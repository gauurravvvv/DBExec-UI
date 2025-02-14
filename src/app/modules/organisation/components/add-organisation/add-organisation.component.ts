import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrganisationService } from '../../services/organisation.service';
import { ORGANISATION } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-add-organisation',
  templateUrl: './add-organisation.component.html',
  styleUrls: ['./add-organisation.component.scss'],
})
export class AddOrganisationComponent implements OnInit {
  orgForm: FormGroup;
  isFormDirty: boolean = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService
  ) {
    this.orgForm = this.fb.group({
      name: ['', [Validators.required]],
      maxAdmins: ['', [Validators.required, Validators.min(1)]],
      maxUsers: ['', [Validators.required, Validators.min(1)]],
      maxEnvironments: ['', [Validators.required, Validators.min(1)]],
      maxCategories: ['', [Validators.required, Validators.min(1)]],
      maxDatabases: ['', [Validators.required, Validators.min(1)]],
    });
  }

  ngOnInit(): void {
    this.watchFormChanges();
  }

  private watchFormChanges(): void {
    this.orgForm.valueChanges.subscribe(() => {
      this.isFormDirty = this.orgForm.dirty;
    });
  }

  onNumberInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');

    // Update form control value
    const controlName = input.getAttribute('formControlName');
    if (controlName) {
      this.orgForm.get(controlName)?.setValue(input.value);
    }
  }

  onSubmit(): void {
    if (this.orgForm.valid) {
      this.organisationService.addOrganisation(this.orgForm).subscribe({
        next: response => {
          if (this.globalService.handleAPIResponse(response)) {
            this.router.navigate([ORGANISATION.LIST]);
          }
        },
        error: error => {
          // Handle error response directly from error object
          this.globalService.handleAPIResponse({
            status: false,
            message:
              error?.error?.message ||
              error?.message ||
              'Failed to add super admin',
          });
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

  onCancel(): void {
    this.orgForm.reset();
    // Reset specific form controls to empty strings
    Object.keys(this.orgForm.controls).forEach(key => {
      this.orgForm.get(key)?.setValue('');
    });
  }
}
