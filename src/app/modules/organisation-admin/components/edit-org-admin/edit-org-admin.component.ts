import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganisationAdminService } from '../../services/organisationAdmin.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ORGANISATION_ADMIN } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';

@Component({
  selector: 'app-edit-org-admin',
  templateUrl: './edit-org-admin.component.html',
  styleUrls: ['./edit-org-admin.component.scss'],
})
export class EditOrgAdminComponent implements OnInit {
  orgForm!: FormGroup;
  isCancelClicked = false;
  organisations: any[] = [];
  adminId: string = '';
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrgName: string = '';
  selectedOrgId: string = '';
  adminData: any;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private orgAdminService: OrganisationAdminService,
    private globalService: GlobalService
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.adminId = this.route.snapshot.params['id'];
    this.selectedOrgId = this.route.snapshot.params['orgId'];
    this.loadAdminData();
  }

  get isFormDirty(): boolean {
    return this.orgForm.dirty;
  }

  initForm() {
    this.orgForm = this.fb.group({
      id: [''],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      username: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      organisation: ['', Validators.required],
      status: [],
    });
  }

  loadAdminData() {
    this.orgAdminService
      .viewOrganisationAdmin(this.selectedOrgId, this.adminId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.adminData = response.data;
          this.orgForm.patchValue({
            id: this.adminData.id,
            firstName: this.adminData.firstName,
            lastName: this.adminData.lastName,
            username: this.adminData.username,
            email: this.adminData.email,
            organisation: this.adminData.organisationId,
            status: this.adminData.status,
          });
          this.selectedOrgName = this.adminData.organisationName;
        }
      });
  }

  onSubmit() {
    if (this.orgForm.valid) {
      this.orgAdminService.updateOrgAdmin(this.orgForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([ORGANISATION_ADMIN.LIST]);
        }
      });
    }
  }

  onCancel() {
    this.orgForm.patchValue({
      id: this.adminData.id,
      firstName: this.adminData.firstName,
      lastName: this.adminData.lastName,
      username: this.adminData.username,
      email: this.adminData.email,
      organisation: this.adminData.organisationId,
      status: this.adminData.status,
    });
    this.selectedOrgName = this.adminData.organisationName;
    this.isCancelClicked = true;
    this.orgForm.markAsPristine();
    this.isCancelClicked = true;
  }
}
