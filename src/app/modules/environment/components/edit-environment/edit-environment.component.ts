import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { EnvironmentService } from '../../services/environment.service';
import { ENVIRONMENT } from 'src/app/constants/routes';

@Component({
  selector: 'app-edit-environment',
  templateUrl: './edit-environment.component.html',
  styleUrls: ['./edit-environment.component.scss'],
})
export class EditEnvironmentComponent implements OnInit {
  envForm!: FormGroup;
  isCancelClicked = false;
  organisations: any[] = [];
  envId: string = '';
  orgId: string = '';
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrgName: string = '';
  envData: any;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private environmentService: EnvironmentService
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.envId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    this.loadEnvironmentData();
  }

  get isFormDirty(): boolean {
    return this.envForm.dirty;
  }

  initForm() {
    this.envForm = this.fb.group({
      id: [''],
      name: [
        '',
        [
          Validators.required,
          Validators.pattern('^[a-zA-Z]+([ -][a-zA-Z]+)*$'),
        ],
      ],
      description: [''],
      organisation: [
        {
          value:
            this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
              ? ''
              : this.globalService.getTokenDetails('organisationId'),
          disabled: true,
        },
        Validators.required,
      ],
      status: [],
    });
  }

  loadEnvironmentData() {
    this.environmentService
      .viewEnvironment(this.orgId, this.envId)
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.envData = response.data;

          this.envForm.patchValue({
            id: this.envData.id,
            name: this.envData.name,
            description: this.envData.description,
            organisation: this.envData.organisationId,
            status: this.envData.status,
          });

          this.selectedOrgName = this.envData.organisationName;
        }
      });
  }

  onSubmit() {
    console.log(this.envForm.getRawValue());
    if (this.envForm.valid) {
      this.environmentService.editEnvironment(this.envForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([ENVIRONMENT.LIST]);
        }
      });
    }
  }

  onCancel() {
    this.envForm.patchValue({
      id: this.envData.id,
      name: this.envData.name,
      description: this.envData.description,
      organisation: this.envData.organisationId,
      status: this.envData.status,
    });
    this.selectedOrgName = this.envData.organisationName;
    this.envForm.markAsPristine();
    this.isCancelClicked = true;
  }
}
