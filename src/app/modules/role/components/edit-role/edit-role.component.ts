import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  FormControl,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { ROLE } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { RoleService } from '../../services/role.service';

@Component({
  selector: 'app-edit-role',
  templateUrl: './edit-role.component.html',
  styleUrls: ['./edit-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditRoleComponent implements OnInit, HasUnsavedChanges {
  roleForm!: FormGroup;
  permissions: any[] = [];
  permissionControls: { [key: string]: FormControl } = {};
  roleId: string = '';
  orgId: string = '';
  roleData: any;
  showSaveConfirm = false;
  saveJustification = '';

  saving = this.roleService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private roleService: RoleService,
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
    this.roleId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadRoleData();
  }

  initForm() {
    this.roleForm = this.fb.group({
      id: [''],
      organisation: [''],
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [''],
      status: [1],
    });
  }

  async loadRoleData() {
    await Promise.all([
      this.roleService.loadOne(this.orgId, this.roleId),
      this.roleService.loadPermissions(),
    ]);

    const roleData = this.roleService.current();
    if (roleData) {
      this.roleData = roleData;

      this.roleForm.patchValue({
        id: this.roleData.id,
        organisation: this.roleData.organisationId,
        name: this.roleData.name,
        description: this.roleData.description || '',
        status: this.roleData.status,
      });

      if (this.roleData.isDefault === 1) {
        this.roleForm.get('name')?.disable();
        this.roleForm.get('description')?.disable();
        this.roleForm.get('status')?.disable();
      }
    }

    const perms = this.roleService.permissions();
    if (perms.length > 0) {
      this.permissions = [...perms];
      this.initializePermissionControls(this.permissions);
      this.applyExistingPermissions();
    }

    this.cdr.markForCheck();
  }

  private applyExistingPermissions() {
    if (!this.roleData?.permissions) return;
    let existing: any[] = [];
    try {
      existing = Array.isArray(this.roleData.permissions)
        ? this.roleData.permissions
        : JSON.parse(this.roleData.permissions);
    } catch {
      return;
    }

    const enabledValues = new Set<string>();
    const collectValues = (perms: any[]) => {
      perms.forEach((p: any) => {
        enabledValues.add(p.value);
        if (p.subPermissions) collectValues(p.subPermissions);
      });
    };
    collectValues(existing);

    Object.entries(this.permissionControls).forEach(([key, ctrl]) => {
      ctrl.setValue(key === 'home' ? true : enabledValues.has(key), {
        emitEvent: false,
      });
    });
  }

  onSubmit() {
    if (this.roleForm.valid) {
      this.showSaveConfirm = true;
    } else {
      Object.keys(this.roleForm.controls).forEach(key => {
        this.roleForm.get(key)?.markAsTouched();
      });
    }
  }

  cancelSave() {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave() {
    if (this.saveJustification.trim()) {
      const selectedPermissions = this.buildSelectedPermissions(
        this.permissions,
      );
      const raw = this.roleForm.getRawValue();
      this.roleService
        .edit(
          {
            id: raw.id,
            name: raw.name,
            description: raw.description || undefined,
            organisation: raw.organisation,
            selectedPermissions,
            status: raw.status,
          },
          this.saveJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.roleForm.markAsPristine();
            this.router.navigate([ROLE.LIST]);
          }
          this.cdr.markForCheck();
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
    if (nameControl?.errors?.['required']) return 'Name is required';
    if (nameControl?.errors?.['pattern'])
      return 'Name can only contain letters, spaces and hyphens';
    return '';
  }

  onCancel() {
    this.loadRoleData();
    this.roleForm.markAsPristine();
  }

  onPermissionChange(permission: any, event: any) {
    const checked = event.checked;
    if (permission.subPermissions) {
      this.updateChildPermissions(permission.subPermissions, checked);
    }
    if (checked && permission.parentId !== '0') {
      this.updateParentPermission(permission);
    }
    this.roleForm.markAsDirty();
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
      if (perm.id.toString() === id) return perm;
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

  get isDefault(): boolean {
    return this.roleData?.isDefault === 1;
  }

  getPermissionControl(permissionValue: string): FormControl {
    if (!this.permissionControls[permissionValue]) {
      this.permissionControls[permissionValue] = new FormControl(false);
    }
    return this.permissionControls[permissionValue];
  }
}
