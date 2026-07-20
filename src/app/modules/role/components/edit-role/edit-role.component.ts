import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ROLE } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  roleDescriptionSchema,
  roleNameSchema,
} from 'src/app/shared/validators/roles';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import {
  AccessLevelEntry,
  PermissionModule,
  SelectedPermissionEntry,
} from '../../role.types';
import { RoleService } from '../../services/role.service';

/**
 * Edit Role — same permission-grid UX as Add Role, with two diffs:
 *   - Initial radio state comes from `leaf.level` returned by
 *     GET /permissions?roleId=. A leaf with level 0 means no current
 *     grant — the "None" radio is pre-selected.
 *   - A status toggle (Active / Inactive) is bound to the form.
 *
 * Every role is fully editable, including the seeded Administrator —
 * there is no default-role special-casing. The BE returns
 * `canEdit: true` for all roles; the only user-account guard elsewhere
 * is self-protection, which does not apply to roles.
 *
 * The PUT is wholesale-replace on the BE side, so we always send the
 * complete `selectedPermissions` set even when nothing in the grid
 * changed.
 */
@Component({
  selector: 'app-edit-role',
  templateUrl: './edit-role.component.html',
  styleUrls: ['./edit-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditRoleComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  roleForm!: FormGroup;
  modules: PermissionModule[] = [];
  accessLevels: AccessLevelEntry[] = [];
  /** permissionId → selected access level (0..3). */
  levelByPermissionId: Record<string, number> = {};

  roleId = '';
  roleData: any = null;
  loadingMeta = true;
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
    this.roleId = this.route.snapshot.params['id'];
    this.loadAll();
  }

  ngOnDestroy() {
    this.roleService.cancelReads();
  }

  initForm() {
    // Field validators sourced from the SHARED Zod schema.
    this.roleForm = this.fb.group({
      id: [''],
      name: ['', [zodValidator(roleNameSchema)]],
      description: ['', [zodValidator(roleDescriptionSchema)]],
      status: [1],
    });
  }

  /**
   * Triple-parallel read: role record, role-scoped permission tree
   * (so leaves carry the role's current `level`), and the canonical
   * access-level table. All three must land before the grid renders.
   */
  async loadAll() {
    this.loadingMeta = true;
    this.cdr.markForCheck();
    try {
      const [role, levels, modules] = await Promise.all([
        this.roleService.get(this.roleId),
        this.roleService.listAccessLevels(),
        this.roleService.listPermissions({
          scope: 'ORG',
          roleId: this.roleId,
        }),
      ]);

      this.roleData = role;
      if (role) {
        this.roleForm.patchValue(
          {
            id: role.id,
            name: role.name,
            description: role.description || '',
            status: role.status ?? 1,
          },
          { emitEvent: false },
        );
        // The seeded default Administrator role is fully locked — the BE
        // rejects any update. Render the form read-only so the UI matches.
        if (this.isLocked) {
          this.roleForm.disable({ emitEvent: false });
        }
      }

      this.accessLevels = [...(levels || [])].sort(
        (a, b) => a.sequence - b.sequence,
      );
      this.modules = (modules || [])
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map(m => ({
          ...m,
          submodules: (m.submodules || [])
            .slice()
            .sort((a, b) => a.sequence - b.sequence),
        }));

      // Seed the radio map from each leaf's level. The BE returns 0
      // when there's no current grant — that maps cleanly to the
      // "None" radio.
      const initial: Record<string, number> = {};
      for (const mod of this.modules) {
        for (const leaf of mod.submodules || []) {
          initial[leaf.id] = typeof leaf.level === 'number' ? leaf.level : 0;
        }
      }
      this.levelByPermissionId = initial;
    } finally {
      this.loadingMeta = false;
      this.cdr.markForCheck();
    }
  }

  get hasAnyGrant(): boolean {
    return Object.values(this.levelByPermissionId).some(v => v >= 1);
  }

  /** True for the seeded default Administrator role — fully non-editable. */
  get isLocked(): boolean {
    return this.roleData?.isDefault === 1 || this.roleData?.canEdit === false;
  }

  get canSave(): boolean {
    return (
      !this.isLocked &&
      this.roleForm.valid &&
      this.hasAnyGrant &&
      this.isFormDirty &&
      !this.saving() &&
      !!this.roleData
    );
  }

  isLevelSelected(permissionId: string, level: number): boolean {
    return (this.levelByPermissionId[permissionId] ?? 0) === level;
  }

  onLevelChange(permissionId: string, level: number) {
    this.levelByPermissionId = {
      ...this.levelByPermissionId,
      [permissionId]: level,
    };
    this.roleForm.markAsDirty();
  }

  onSubmit() {
    if (!this.canSave) {
      Object.keys(this.roleForm.controls).forEach(key => {
        this.roleForm.get(key)?.markAsTouched();
      });
      return;
    }
    this.showSaveConfirm = true;
  }

  cancelSave() {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave() {
    if (!this.saveJustification.trim()) return;

    const selectedPermissions: SelectedPermissionEntry[] = [];
    for (const [permissionId, level] of Object.entries(
      this.levelByPermissionId,
    )) {
      if (level >= 1) selectedPermissions.push({ permissionId, level });
    }
    const raw = this.roleForm.getRawValue();

    this.roleForm.disable({ emitEvent: false });
    this.roleService
      .edit(
        {
          id: raw.id,
          name: raw.name,
          description: raw.description || undefined,
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
      })
      .finally(() => {
        this.roleForm.enable({ emitEvent: false });
      });
  }

  fieldError(fieldName: string): string {
    const control = this.roleForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  getNameError(): string {
    return this.fieldError('name');
  }

  onCancel() {
    this.loadAll();
    this.roleForm.markAsPristine();
  }

  trackByModuleId(_: number, item: PermissionModule): string {
    return item.id;
  }

  trackByLeafId(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByLevelValue(_: number, item: AccessLevelEntry): number {
    return item.value;
  }
}
