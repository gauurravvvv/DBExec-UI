import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ORGANISATION } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from '../../services/organisation.service';

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
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      status: [],
    });

    this.orgForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
      // Compare current form value with original data
      const currentValue = this.orgForm.value;
      const originalValue: any = {
        id: this.orgData?.id,
        name: this.orgData?.name,
        description: this.orgData?.description,
        status: this.orgData?.status,
      };

      // Check if any value is different from original
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
      // Mark all fields as touched to trigger validation messages
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
}
