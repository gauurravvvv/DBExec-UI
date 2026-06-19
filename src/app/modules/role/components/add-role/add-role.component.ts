import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ROLE } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { ACCESS } from 'src/app/core/services/permission.service';
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
 * Add Role — permission-grid UX.
 *
 * Layout: one column for the permission label + one radio column per
 * canonical access level (None / Read / Write / Full). Rows alternate
 * between module headers (full-width, bold, no radios) and leaf rows
 * (label + one radio per level).
 *
 * State: `levelByPermissionId` maps each leaf id to its currently
 * selected access level (0..3). Defaults to READ on Add Role per
 * spec — bulk-creating a role with no leaves granted is rare; READ
 * is the safest non-zero default.
 *
 * Save is disabled until the form is valid AND at least one leaf has
 * level >= 1. The wire payload is built from `levelByPermissionId`
 * and pruned client-side (BE prunes too, but small wire wins on
 * roles with hundreds of leaves and a handful granted).
 */
@Component({
  selector: 'app-add-role',
  templateUrl: './add-role.component.html',
  styleUrls: ['./add-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddRoleComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  roleForm!: FormGroup;
  modules: PermissionModule[] = [];
  accessLevels: AccessLevelEntry[] = [];

  /** permissionId → selected access level (0..3). */
  levelByPermissionId: Record<string, number> = {};

  /** True until the metadata feeds (permissions + access levels) resolve. */
  loadingMeta = true;

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
    this.loadMeta();
  }

  ngOnDestroy() {
    // Abort the parallel metadata fetches if the user backs out before
    // they resolve. Without this the XHRs keep running, land in a
    // destroyed component, and clobber the next page's signals.
    this.roleService.cancelReads();
  }

  initForm() {
    // Field validators sourced from the SHARED Zod schema at
    // src/app/shared/validators/roles.ts (mirrored to BE).
    this.roleForm = this.fb.group({
      name: ['', [zodValidator(roleNameSchema)]],
      description: ['', [zodValidator(roleDescriptionSchema)]],
    });
  }

  /**
   * Parallel-fetch the access-level table + the ORG-scoped permission
   * tree. Both must land before the grid can render — there's no
   * useful intermediate state, so we keep a single `loadingMeta` flag
   * driving the content-loader.
   */
  async loadMeta() {
    this.loadingMeta = true;
    this.cdr.markForCheck();
    try {
      const [levels, modules] = await Promise.all([
        this.roleService.listAccessLevels(),
        this.roleService.listPermissions({ scope: 'ORG' }),
      ]);
      // Sort defensively — BE sorts by sequence but the grid columns
      // have to be in a deterministic order even if the metadata
      // arrives out-of-order from a stale cache.
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

      // Default each leaf to READ. We use the canonical ACCESS.READ
      // constant rather than 1 so a future renumber of the
      // access-level table only touches one place.
      const initial: Record<string, number> = {};
      for (const mod of this.modules) {
        for (const leaf of mod.submodules || []) {
          initial[leaf.id] = ACCESS.READ;
        }
      }
      this.levelByPermissionId = initial;
    } finally {
      this.loadingMeta = false;
      this.cdr.markForCheck();
    }
  }

  /** True when at least one leaf has level >= 1 (i.e. is granted). */
  get hasAnyGrant(): boolean {
    return Object.values(this.levelByPermissionId).some(v => v >= 1);
  }

  /** Save button enable state. */
  get canSave(): boolean {
    return this.roleForm.valid && this.hasAnyGrant && !this.saving();
  }

  /** Whether this leaf has the given level currently selected. */
  isLevelSelected(permissionId: string, level: number): boolean {
    return (this.levelByPermissionId[permissionId] ?? 0) === level;
  }

  /** Radio change handler — also marks the form dirty so Cancel enables. */
  onLevelChange(permissionId: string, level: number) {
    this.levelByPermissionId = {
      ...this.levelByPermissionId,
      [permissionId]: level,
    };
    this.roleForm.markAsDirty();
  }

  onSubmit() {
    if (!this.canSave) {
      // Pop validation errors so the user can see why save is blocked.
      Object.keys(this.roleForm.controls).forEach(key => {
        const control = this.roleForm.get(key);
        if (control?.invalid) control.markAsTouched();
      });
      return;
    }
    const selectedPermissions: SelectedPermissionEntry[] = [];
    for (const [permissionId, level] of Object.entries(
      this.levelByPermissionId,
    )) {
      if (level >= 1) selectedPermissions.push({ permissionId, level });
    }
    const formValues = this.roleForm.value;
    this.roleForm.disable({ emitEvent: false });
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
      })
      .finally(() => {
        this.roleForm.enable({ emitEvent: false });
        this.cdr.markForCheck();
      });
  }

  /** Reset the form and reload meta — same shape the legacy component used. */
  onCancel() {
    this.roleForm.reset();
    this.modules = [];
    this.accessLevels = [];
    this.levelByPermissionId = {};
    this.loadMeta();
  }

  /**
   * Unified error getter — same translation key the BE returns on 400.
   */
  fieldError(fieldName: string): string {
    const control = this.roleForm.get(fieldName);
    const key = control?.errors?.['zod'] as string | undefined;
    return key ? this.translate.instant(key) : '';
  }

  getNameError(): string {
    return this.fieldError('name');
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
