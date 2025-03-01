import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrganisationService } from '../../services/organisation.service';
import { ORGANISATION } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { REGEX } from 'src/app/constants/regex.constant';

@Component({
  selector: 'app-add-organisation',
  templateUrl: './add-organisation.component.html',
  styleUrls: ['./add-organisation.component.scss'],
})
export class AddOrganisationComponent implements OnInit {
  orgForm!: FormGroup;
  currentStep = 0;
  isFormDirty = false;
  showPepperKey = false;
  confirmationChecked = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.orgForm.valueChanges.subscribe(() => {
      this.isFormDirty = true;
    });
  }

  private initForm() {
    this.orgForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(REGEX.orgName)]],
      description: ['', [Validators.required]],
      maxAdmins: ['', [Validators.required, Validators.min(1)]],
      maxUsers: ['', [Validators.required, Validators.min(1)]],
      maxEnvironments: ['', [Validators.required, Validators.min(1)]],
      maxCategories: ['', [Validators.required, Validators.min(1)]],
      maxDatabases: ['', [Validators.required, Validators.min(1)]],
      maxGroups: ['', [Validators.required, Validators.min(1)]],
      encryptionAlgorithm: ['', [Validators.required]],
      pepperKey: [
        '',
        [
          Validators.required,
          Validators.pattern(
            /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{32,}$/
          ),
        ],
      ],
    });
  }

  isBasicInfoValid(): boolean {
    const nameControl = this.orgForm.get('name');
    const descriptionControl = this.orgForm.get('description');
    return (nameControl?.valid && descriptionControl?.valid) || false;
  }

  nextStep() {
    if (this.isBasicInfoValid()) {
      this.currentStep = 1;
    }
  }

  previousStep() {
    this.currentStep = 0;
  }

  onNumberInput(event: any) {
    const input = event.target;
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
    this.currentStep = 0;
    this.isFormDirty = false;
    this.orgForm.markAsPristine();
    // Reset specific form controls to empty strings
    Object.keys(this.orgForm.controls).forEach(key => {
      this.orgForm.get(key)?.setValue('');
    });
  }

  encryptionAlgorithms = [
    { value: 'aes-256-gcm', label: 'aes-256-gcm' },
    { value: 'aes-192-gcm', label: 'aes-192-gcm' },
    { value: 'aes-128-gcm', label: 'aes-128-gcm' },
    { value: 'aes-256-cbc', label: 'aes-256-cbc' },
    { value: 'aes-192-cbc', label: 'aes-192-cbc' },
    { value: 'aes-128-cbc', label: 'aes-128-cbc' },
  ];

  togglePepperKeyVisibility(event: Event) {
    event.preventDefault();
    this.showPepperKey = !this.showPepperKey;
    const pepperKeyInput = document.getElementById(
      'pepperKey'
    ) as HTMLInputElement;
    if (pepperKeyInput) {
      pepperKeyInput.type = this.showPepperKey ? 'text' : 'password';
    }
  }

  isFormValid(): boolean {
    return this.orgForm.valid && this.confirmationChecked;
  }
}
