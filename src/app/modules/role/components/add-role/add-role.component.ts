import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { ROLE } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-add-role',
  templateUrl: './add-role.component.html',
  styleUrls: ['./add-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddRoleComponent implements OnInit, HasUnsavedChanges {
  roleForm!: FormGroup;
  permissions: any[] = [];
  permissionControls: { [key: string]: FormControl } = {};

  saving = this.roleService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private roleService: RoleService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
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
    this.loadPermissions();
  }

  initForm() {
    this.roleForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [''],
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
      const selectedPermissions = this.buildSelectedPermissions(
        this.permissions,
      );

      if (selectedPermissions.length === 0) {
        return;
      }

      const formValues = this.roleForm.value;
      this.roleService
        .add({
          name: formValues.name,
          description: formValues.description || undefined,
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
      return this.translate.instant('VALIDATION.NAME_REQUIRED');
    }
    if (nameControl?.errors?.['pattern']) {
      return this.translate.instant('VALIDATION.NAME_PATTERN');
    }
    return '';
  }

  onCancel() {
    this.roleForm.reset();
    this.permissions = [];
    this.permissionControls = {};
    this.loadPermissions();
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
      permission.parentId,
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
      this.permissionControls[perm.value] = new FormControl(
        perm.value === 'home' ? true : false,
      );
      if (perm.subPermissions) {
        this.addPermissionControls(perm.subPermissions);
      }
    });
  }
}
