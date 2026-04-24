import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { RoleService } from '../../services/role.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-add-role',
  templateUrl: './add-role.component.html',
  styleUrls: ['./add-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddRoleComponent implements OnInit, HasUnsavedChanges {
  roleForm!: FormGroup;
  organisations: any[] = [];
  permissions: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  permissionControls: { [key: string]: FormControl } = {};

  saving = this.roleService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private roleService: RoleService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.roleForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadPermissions();
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
    });
  }

  loadOrganisations() {
    const params = { page: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
      }
    });
  }

  async loadPermissions() {
    await this.roleService.loadPermissions();
    const perms = this.roleService.permissions();
    if (perms.length > 0) {
      this.permissions = [...perms];
      this.initializePermissionControls(this.permissions);
      this.cdr.markForCheck();
    }
  }

  onSubmit() {
    if (this.roleForm.valid) {
      const selectedPermissions = this.buildSelectedPermissions(this.permissions);

      if (selectedPermissions.length === 0) {
        return;
      }

      const formValues = this.roleForm.value;
      this.roleService
        .add({
          name: formValues.name,
          description: formValues.description || undefined,
          organisation: formValues.organisation,
          selectedPermissions,
        })
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.roleForm.markAsPristine();
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

  private buildSelectedPermissions(permissions: any[]): any[] {
    const result: any[] = [];
    for (const perm of permissions) {
      if (perm.subPermissions) {
        const selectedSubs = perm.subPermissions.filter(
          (sub: any) => this.permissionControls[sub.value]?.value,
        );
        if (
          selectedSubs.length > 0 ||
          this.permissionControls[perm.value]?.value
        ) {
          result.push({ ...perm, subPermissions: selectedSubs });
        }
      } else if (this.permissionControls[perm.value]?.value) {
        result.push(perm);
      }
    }
    return result;
  }

  trackByIndex(index: number): number {
    return index;
  }

  getNameError(): string {
    const nameControl = this.roleForm.get('name');
    if (nameControl?.errors?.['required']) {
      return 'Name is required';
    }
    if (nameControl?.errors?.['pattern']) {
      return 'Name can only contain letters, spaces and hyphens';
    }
    return '';
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
    if (!this.showOrganisationDropdown) {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadPermissions();
    }
  }

  onOrganisationChange(event: any) {
    this.selectedOrg = event.value ? { id: event.value } : null;
    this.permissions = [];
    this.permissionControls = {};
    if (this.selectedOrg) {
      this.loadPermissions();
    }
  }

  getPermissionControl(permissionValue: string): FormControl {
    if (!this.permissionControls[permissionValue]) {
      this.permissionControls[permissionValue] = new FormControl(false);
    }
    return this.permissionControls[permissionValue];
  }

  onPermissionChange(permission: any, event: any) {
    const checked = event.checked;

    if (permission.subPermissions) {
      this.updateChildPermissions(permission.subPermissions, checked);
    }

    if (checked && permission.parentId !== '0') {
      this.updateParentPermission(permission);
    }
  }

  private updateChildPermissions(permissions: any[], checked: boolean) {
    permissions.forEach(perm => {
      if (this.permissionControls[perm.value]) {
        this.permissionControls[perm.value].setValue(checked, { emitEvent: false });
      }
      if (perm.subPermissions) {
        this.updateChildPermissions(perm.subPermissions, checked);
      }
    });
  }

  private updateParentPermission(permission: any) {
    const parent = this.findPermissionById(this.permissions, permission.parentId);
    if (parent && this.permissionControls[parent.value]) {
      this.permissionControls[parent.value].setValue(true, { emitEvent: false });
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
      this.permissionControls[perm.value] = new FormControl(perm.value === 'home' ? true : false);
      if (perm.subPermissions) {
        this.addPermissionControls(perm.subPermissions);
      }
    });
  }
}
