import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GROUP } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-edit-group',
  templateUrl: './edit-group.component.html',
  styleUrls: ['./edit-group.component.scss'],
})
export class EditGroupComponent implements OnInit {
  groupForm!: FormGroup;
  users: any[] = [];
  isFormDirty = false;
  showOrganisationDropdown = true;
  categoryId!: string;
  orgId!: string;
  selectedOrgName: string = '';
  originalFormValue: any;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private groupService: GroupService,
    private userService: UserService,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.categoryId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.categoryId) {
      this.loadGroupData();
    }
  }

  initForm(): void {
    this.groupForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      description: [''],
      organisation: ['', Validators.required],
      users: ['', [Validators.required, this.minUsersValidator(2)]],
      status: [1],
    });

    this.groupForm.valueChanges.subscribe(() => {
      this.checkFormDirty();
    });
  }

  minUsersValidator(min: number) {
    return (control: AbstractControl): ValidationErrors | null => {
      const users = control.value as any[];
      if (!users || users.length < min) {
        return { minUsers: { min, actual: users?.length || 0 } };
      }
      return null;
    };
  }

  loadGroupData(): void {
    this.groupService.viewGroup(this.orgId, this.categoryId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const groupData = response.data;

        this.groupForm.patchValue({
          organisation: groupData.organisationId,
        });
        this.selectedOrgName = groupData.organisationName || '';

        this.loadUsers({
          orgId: groupData.organisationId,
          pageNumber: 1,
          limit: 100,
        });

        const usersIds = groupData.userGroups.map(
          (mapping: any) => mapping.userId
        );

        this.groupForm.patchValue({
          id: groupData.id,
          name: groupData.name,
          description: groupData.description,
          users: usersIds,
          status: groupData.status,
        });

        this.originalFormValue = this.groupForm.value;
        this.isFormDirty = false;
        this.groupForm.markAsPristine();
      }
    });
  }

  loadUsers(params: any): void {
    this.userService.listUser(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.users = [...response.data.users];
      }
    });
  }

  getFieldErrorMessage(field: any): string {
    if (field.get('name')?.errors?.['required']) {
      return 'Field name is required';
    }
    if (field.get('name')?.errors?.['pattern']) {
      return 'Field name can only contain letters and spaces';
    }
    return '';
  }

  canSubmit(): boolean {
    const users = this.groupForm.get('users')?.value || [];
    return this.groupForm.valid && users.length > 1 && this.isFormDirty;
  }

  onSubmit(): void {
    if (this.canSubmit()) {
      console.log(this.groupForm.value);
      this.groupService.editGroup(this.groupForm).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([GROUP.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.groupForm.patchValue(this.originalFormValue);
      this.isFormDirty = false;
      this.groupForm.markAsPristine();
    } else {
      this.router.navigate([GROUP.LIST]);
    }
  }

  checkFormDirty(): void {
    if (!this.originalFormValue) return;
    const currentValue = this.groupForm.value;
    this.isFormDirty =
      JSON.stringify(this.originalFormValue) !== JSON.stringify(currentValue);
  }
}
