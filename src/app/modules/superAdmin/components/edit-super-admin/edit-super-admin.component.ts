import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SuperAdminService } from '../../services/superAdmin.service';
import { MessageService } from 'primeng/api';
import { SUPER_ADMIN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-edit-super-admin',
  templateUrl: './edit-super-admin.component.html',
  styleUrls: ['./edit-super-admin.component.scss'],
})
export class EditSuperAdminComponent implements OnInit {
  adminForm!: FormGroup;
  adminId: string = '';
  adminData: any;
  isCancelClicked: boolean = false;

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.adminForm.dirty;
  }

  constructor(
    private fb: FormBuilder,
    private superAdminService: SuperAdminService,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.initForm();

    // Subscribe to form value changes
    this.adminForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
    });
  }

  private initForm(): void {
    this.adminForm = this.fb.group({
      id: [''],
      firstName: [
        '',
        [
          Validators.required,
          Validators.pattern('^[a-zA-Z]+([ -][a-zA-Z]+)*$'),
        ],
      ],
      lastName: [
        '',
        [
          Validators.required,
          Validators.pattern('^[a-zA-Z]+([ -][a-zA-Z]+)*$'),
        ],
      ],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
          Validators.pattern('^[a-zA-Z0-9_]+$'),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      status: [false],
    });

    this.route.params.subscribe(params => {
      this.adminId = params['id'];
      if (this.adminId) {
        this.patchFormValues();
      }
    });
  }

  patchFormValues(): void {
    this.superAdminService
      .viewSuperAdmin(this.adminId)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.adminData = response.data;
          this.adminForm.patchValue(this.adminData);
        }
      });
  }

  // Method to handle number-only input
  onPhoneInput(event: any): void {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');
    this.adminForm.patchValue({ phone: input.value });
  }

  onSubmit(): void {
    if (this.adminForm.valid) {
      this.superAdminService
        .updateSuperAdmin(this.adminForm)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([SUPER_ADMIN.LIST]);
          }
        });
    }
  }

  onCancel(): void {
    this.adminForm.patchValue(this.adminData);
    this.adminForm.markAsPristine();
    this.isCancelClicked = true;
  }
}
