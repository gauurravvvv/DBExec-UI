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
      mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      organisation: ['', Validators.required],
      status: [],
    });
  }

  loadAdminData() {
    this.orgAdminService.viewOrganisationAdmin(this.adminId).subscribe({
      next: (response: any) => {
        this.adminData = response.data;
        this.orgForm.patchValue({
          id: this.adminData.id,
          firstName: this.adminData.firstName,
          lastName: this.adminData.lastName,
          username: this.adminData.username,
          email: this.adminData.email,
          mobile: this.adminData.mobile,
          organisation: this.adminData.organisationId,
          status: this.adminData.status,
        });
        this.selectedOrgName = this.adminData.organisationName;
      },
      error: error => {
        console.error('Error loading admin data:', error);
      },
    });
  }

  onPhoneInput(event: any) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    input.value = value.replace(/\D/g, '');
    this.orgForm.patchValue({ mobile: input.value });
  }

  onSubmit() {
    if (this.orgForm.valid) {
      this.orgAdminService.updateOrgAdmin(this.orgForm).subscribe({
        next: () => {
          this.router.navigate([ORGANISATION_ADMIN.LIST]);
        },
        error: error => {
          console.error('Error updating organisation admin:', error);
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
    this.orgForm.patchValue({
      id: this.adminData.id,
      firstName: this.adminData.firstName,
      lastName: this.adminData.lastName,
      username: this.adminData.username,
      email: this.adminData.email,
      mobile: this.adminData.mobile,
      organisation: this.adminData.organisationId,
      status: this.adminData.status,
    });
    this.selectedOrgName = this.adminData.organisationName;
    this.isCancelClicked = true;
    this.orgForm.markAsPristine();
    this.isCancelClicked = true;
  }
}
