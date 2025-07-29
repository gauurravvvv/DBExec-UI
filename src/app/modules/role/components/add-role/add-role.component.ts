import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormControl,
} from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { ROLE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-add-role',
  templateUrl: './add-role.component.html',
  styleUrls: ['./add-role.component.scss'],
})
export class AddRoleComponent implements OnInit {
  roleForm!: FormGroup;
  organisations: any[] = [];
  permissions: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  permissionControls: { [key: string]: FormControl } = {};

  roleTypes = [
    { label: 'Admin', value: 1 },
    { label: 'User', value: 2 },
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private roleService: RoleService,
    private organisationService: OrganisationService,
    private globalService: GlobalService
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.roleForm.dirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
    }
  }

  initForm() {
    this.roleForm = this.fb.group({
      organisation: [
        {
          value:
            this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
              ? ''
              : this.globalService.getTokenDetails('organisationId'),
          disabled: false,
        },
        Validators.required,
      ],
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [''],
      type: [null, Validators.required],
      selectedPermissions: [[]],
    });
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
      }
    });
  }

  onSubmit() {
    if (this.roleForm.valid) {
      // Get all selected permissions
      const selectedPermissions = Object.entries(this.permissionControls)
        .filter(([_, control]) => control.value)
        .map(([key]) => key);

      const formData = {
        ...this.roleForm.value,
        selectedPermissions,
      };

      this.roleService.addRole(formData).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([ROLE.LIST]);
        }
      });
    } else {
      Object.keys(this.roleForm.controls).forEach(key => {
        const control = this.roleForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  onCancel() {
    this.roleForm.reset({
      organisation:
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
    });
    this.selectedOrg = null;
    this.permissions = [];
    this.permissionControls = {};
  }

  onOrganisationChange(event: any) {
    this.selectedOrg = event.value
      ? {
          id: event.value,
        }
      : null;

    this.roleForm.patchValue({
      type: null,
    });

    this.permissions = [];
    this.permissionControls = {};
  }

  onRoleTypeChange(type: any) {
    this.roleService
      .listPermissions(this.selectedOrg.id, type.value)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.permissions = [...response.data];
          this.initializePermissionControls(this.permissions);
        }
      });
  }

  getPermissionControl(permissionValue: string): FormControl {
    if (!this.permissionControls[permissionValue]) {
      this.permissionControls[permissionValue] = new FormControl(false);
    }
    return this.permissionControls[permissionValue];
  }

  onPermissionChange(permission: any, event: any) {
    const checked = event.checked;

    // If parent permission is toggled
    if (permission.subPermissions) {
      this.updateChildPermissions(permission.subPermissions, checked);
    }

    // If child permission is toggled on, ensure parent is toggled on
    if (checked && permission.parentId !== '0') {
      this.updateParentPermission(permission);
    }
  }

  private updateChildPermissions(permissions: any[], checked: boolean) {
    permissions.forEach(perm => {
      if (this.permissionControls[perm.value]) {
        this.permissionControls[perm.value].setValue(checked, {
          emitEvent: false,
        });
      }
      if (perm.subPermissions) {
        this.updateChildPermissions(perm.subPermissions, checked);
      }
    });
  }

  private updateParentPermission(permission: any) {
    const parent = this.findPermissionById(
      this.permissions,
      permission.parentId
    );
    if (parent && this.permissionControls[parent.value]) {
      this.permissionControls[parent.value].setValue(true, {
        emitEvent: false,
      });
      if (parent.parentId !== '0') {
        this.updateParentPermission(parent);
      }
    }
  }

  private findPermissionById(permissions: any[], id: string): any {
    for (const perm of permissions) {
      if (perm.id.toString() === id) {
        return perm;
      }
      if (perm.subPermissions) {
        const found = this.findPermissionById(perm.subPermissions, id);
        if (found) return found;
      }
    }
    return null;
  }

  private initializePermissionControls(permissions: any[]) {
    this.permissionControls = {};
    this.addPermissionControls(permissions);
  }

  private addPermissionControls(permissions: any[]) {
    permissions.forEach(perm => {
      this.permissionControls[perm.value] = new FormControl(false);
      if (perm.subPermissions) {
        this.addPermissionControls(perm.subPermissions);
      }
    });
  }
}
