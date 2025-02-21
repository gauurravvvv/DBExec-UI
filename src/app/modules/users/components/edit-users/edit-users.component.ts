import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-edit-users',
  templateUrl: './edit-users.component.html',
  styleUrls: ['./edit-users.component.scss'],
})
export class EditUsersComponent implements OnInit {
  userForm!: FormGroup;
  isCancelClicked = false;
  organisations: any[] = [];
  userId: string = '';
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrgName: string = '';
  userData: any;
  orgId: string = '';
  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private userService: UserService,
    private globalService: GlobalService
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.userId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadAdminData();
  }

  get isFormDirty(): boolean {
    return this.userForm.dirty;
  }

  initForm() {
    this.userForm = this.fb.group({
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
      password: [
        '',
        Validators.pattern(
          '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'
        ),
      ],
      mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
      organisation: ['', Validators.required],
      status: [],
    });
  }

  loadAdminData() {
    this.userService.viewOrgUser(this.orgId, this.userId).subscribe({
      next: (response: any) => {
        this.userData = response.data;
        this.userForm.patchValue({
          id: this.userData.id,
          firstName: this.userData.firstName,
          lastName: this.userData.lastName,
          username: this.userData.username,
          email: this.userData.email,
          mobile: this.userData.mobile,
          organisation: this.userData.organisationId,
          status: this.userData.status,
        });
        this.selectedOrgName = this.userData.organisationName;
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
    this.userForm.patchValue({ mobile: input.value });
  }

  onSubmit() {
    if (this.userForm.valid) {
      this.userService.updateUser(this.userForm).subscribe({
        next: () => {
          this.router.navigate([USER.LIST]);
        },
        error: error => {
          console.error('Error updating user:', error);
        },
      });
    } else {
      Object.keys(this.userForm.controls).forEach(key => {
        const control = this.userForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  onCancel() {
    this.userForm.patchValue({
      id: this.userData.id,
      firstName: this.userData.firstName,
      lastName: this.userData.lastName,
      username: this.userData.username,
      email: this.userData.email,
      mobile: this.userData.mobile,
      organisation: this.userData.organisationId,
      status: this.userData.status,
    });
    this.selectedOrgName = this.userData.organisationName;
    this.isCancelClicked = true;
    this.userForm.markAsPristine();
    this.isCancelClicked = true;
  }
}
