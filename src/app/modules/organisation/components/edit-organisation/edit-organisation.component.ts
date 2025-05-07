import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { OrganisationService } from '../../services/organisation.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION } from 'src/app/constants/routes';
import { MessageService } from 'primeng/api';

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
  currentStep = 0;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private messageService: MessageService
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
      maxAdmins: ['', [Validators.required, Validators.min(1)]],
      maxUsers: ['', [Validators.required, Validators.min(1)]],
      maxEnvironments: ['', [Validators.required, Validators.min(1)]],
      maxCategories: ['', [Validators.required, Validators.min(1)]],
      maxDatabases: ['', [Validators.required, Validators.min(1)]],
      maxGroups: ['', [Validators.required, Validators.min(1)]],
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
        maxDatabases: this.orgData?.config?.maxDatabases,
        maxAdmins: this.orgData?.config?.maxAdmins,
        maxUsers: this.orgData?.config?.maxUsers,
        maxEnvironments: this.orgData?.config?.maxEnvironment,
        maxCategories: this.orgData?.config?.maxCategories,
        maxGroups: this.orgData?.config?.maxGroups,
      };

      // Check if any value is different from original
      this.isFormDirty = Object.keys(currentValue).some(
        key => currentValue[key] !== originalValue[key]
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
            maxDatabases: this.orgData.config.maxDatabases,
            maxAdmins: this.orgData.config.maxAdmins,
            maxUsers: this.orgData.config.maxUsers,
            maxEnvironments: this.orgData.config.maxEnvironment,
            maxCategories: this.orgData.config.maxCategories,
            maxGroups: this.orgData.config.maxGroups,
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
      maxDatabases: this.orgData.config.maxDatabases,
      maxAdmins: this.orgData.config.maxAdmins,
      maxUsers: this.orgData.config.maxUsers,
      maxEnvironments: this.orgData.config.maxEnvironment,
      maxCategories: this.orgData.config.maxCategories,
    });
    this.orgForm.markAsPristine();
    this.isCancelClicked = true;
  }

  nextStep(): void {
    if (this.currentStep < 1 && this.isBasicInfoValid()) {
      this.currentStep++;
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  goToStep(step: number): void {
    if (step === 1 && !this.isBasicInfoValid()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please complete the basic information first',
      });
      return;
    }
    this.currentStep = step;
  }

  isBasicInfoValid(): boolean {
    const basicControls = ['name'];
    return basicControls.every(control => this.orgForm.get(control)?.valid);
  }
}
