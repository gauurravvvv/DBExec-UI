import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from '../../services/user.service';
import { REGEX } from 'src/app/constants/regex.constant';

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
          Validators.minLength(4),
          Validators.maxLength(30),
          Validators.pattern(REGEX.firstName),
        ],
      ],
      lastName: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
          Validators.maxLength(30),
          Validators.pattern(REGEX.lastName),
        ],
      ],
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(6),
          Validators.maxLength(30),
          Validators.pattern(REGEX.username),
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        Validators.pattern(
          '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'
        ),
      ],
      organisation: ['', Validators.required],
      status: [],
    });
  }

  loadAdminData() {
    this.userService.viewOrgUser(this.orgId, this.userId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.userData = response.data;
        this.userForm.patchValue({
          id: this.userData.id,
          firstName: this.userData.firstName,
          lastName: this.userData.lastName,
          username: this.userData.username,
          email: this.userData.email,
          organisation: this.userData.organisationId,
          status: this.userData.status,
        });
        this.selectedOrgName = this.userData.organisationName;
      }
    });
  }

  onSubmit() {
    if (this.userForm.valid) {
      this.userService.updateUser(this.userForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([USER.LIST]);
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
      organisation: this.userData.organisationId,
      status: this.userData.status,
    });
    this.selectedOrgName = this.userData.organisationName;
    this.isCancelClicked = true;
    this.userForm.markAsPristine();
    this.isCancelClicked = true;
  }
}
