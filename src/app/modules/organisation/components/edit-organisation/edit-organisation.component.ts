import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ORGANISATION } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from '../../services/organisation.service';
import { REGEX } from 'src/app/constants/regex.constant';

@Component({
  selector: 'app-edit-organisation',
  templateUrl: './edit-organisation.component.html',
  styleUrls: ['./edit-organisation.component.scss'],
})
export class EditOrganisationComponent implements OnInit {
  orgForm!: FormGroup;
  isFormDirty = false;
  organisationId!: string;
  orgData: any;
  isCancelClicked: boolean = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.organisationId = this.route.snapshot.params['id'];
    this.loadOrganisationData();
  }

  private initForm() {
    this.orgForm = this.fb.group({
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
      description: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(500),
        ],
      ],
      status: [],
    });

    this.orgForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
      const currentValue = this.orgForm.value;
      const originalValue: any = {
        id: this.orgData?.id,
        name: this.orgData?.name,
        description: this.orgData?.description,
        status: this.orgData?.status,
      };

      this.isFormDirty = Object.keys(currentValue).some(
        key => currentValue[key] !== originalValue[key],
      );
    });
  }

  private loadOrganisationData() {
    this.organisationService
      .viewOrganisation(this.organisationId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.orgData = response.data;
          this.orgForm.patchValue({
            id: this.orgData.id,
            name: this.orgData.name,
            description: this.orgData.description,
            status: this.orgData.status,
          });
          this.isFormDirty = false;
        }
      });
  }

  onNumberInput(event: Event) {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');
  }

  onSubmit() {
    if (this.orgForm.valid) {
      this.organisationService.editOrganisation(this.orgForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([ORGANISATION.LIST]);
        }
      });
    } else {
      Object.keys(this.orgForm.controls).forEach(key => {
        const control = this.orgForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  onCancel() {
    this.orgForm.patchValue({
      id: this.orgData.id,
      name: this.orgData.name,
      description: this.orgData.description,
      status: this.orgData.status,
    });
    this.orgForm.markAsPristine();
    this.isCancelClicked = true;
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
}
