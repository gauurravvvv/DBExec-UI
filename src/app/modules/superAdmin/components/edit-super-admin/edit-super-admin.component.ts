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
    private messageService: MessageService,
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
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      username: ['', [Validators.required, Validators.minLength(4)]],
      email: ['', [Validators.required, Validators.email]],
      mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      status: [],
    });

    this.route.params.subscribe(params => {
      this.adminId = params['id'];
      if (this.adminId) {
        this.patchFormValues();
      }
    });
  }

  patchFormValues(): void {
    this.superAdminService.viewSuperAdmin(this.adminId).subscribe(response => {
      if (this.globalService.handleAPIResponse(response)) {
        this.adminData = response.data;
        this.adminForm.patchValue(this.adminData);
        this.adminForm.get('username')?.disable();
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
      this.superAdminService.updateSuperAdmin(this.adminForm).subscribe({
        next: response => {
          if (this.globalService.handleAPIResponse(response)) {
            this.router.navigate([SUPER_ADMIN.LIST]);
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
      // Mark all fields as touched to trigger validation messages
      Object.keys(this.adminForm.controls).forEach(key => {
        const control = this.adminForm.get(key);
        control?.markAsTouched();
      });
    }
  }

  onCancel(): void {
    this.adminForm.patchValue(this.adminData);
    this.adminForm.markAsPristine();
    this.isCancelClicked = true;
  }
}
