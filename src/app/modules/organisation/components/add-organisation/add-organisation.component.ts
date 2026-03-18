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
    private globalService: GlobalService,
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
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(64),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(500),
        ],
      ],
      encryptionAlgorithm: ['', [Validators.required]],
      pepperKey: [
        '',
        [
          Validators.required,
          Validators.minLength(32),
          Validators.pattern(REGEX.pepperKey),
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

    const controlName = input.getAttribute('formControlName');
    if (controlName) {
      this.orgForm.get(controlName)?.setValue(input.value);
    }
  }

  onSubmit(): void {
    if (this.orgForm.valid) {
      this.organisationService.addOrganisation(this.orgForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([ORGANISATION.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    this.orgForm.reset();
    this.currentStep = 0;
    this.isFormDirty = false;
    this.orgForm.markAsPristine();
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
      'pepperKey',
    ) as HTMLInputElement;
    if (pepperKeyInput) {
      pepperKeyInput.type = this.showPepperKey ? 'text' : 'password';
    }
  }

  isFormValid(): boolean {
    return this.orgForm.valid && this.confirmationChecked;
  }

  getNameError(): string {
    const control = this.orgForm.get('name');
    if (control?.errors?.['required']) return 'Organisation name is required';
    if (control?.errors?.['minlength'])
      return `Organisation name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Organisation name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Organisation name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  getDescriptionError(): string {
    const control = this.orgForm.get('description');
    if (control?.errors?.['required']) return 'Description is required';
    if (control?.errors?.['minlength'])
      return `Description must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Description must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    return '';
  }

  getPepperKeyError(): string {
    const control = this.orgForm.get('pepperKey');
    if (control?.errors?.['required']) return 'Pepper key is required';
    if (control?.errors?.['minlength'])
      return `Pepper key must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Pepper key can only contain letters, numbers and special characters (no spaces)';
    return '';
  }
}
