import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { RoleService } from 'src/app/modules/role/services/role.service';
import { FbAdminService } from '../../services/fb-admin.service';
import {
  FormBuilderStore,
  SelectedElement,
} from '../../services/form-builder-store';
import { FieldAccess, RbacRow, Role } from '../../models/rbac.types';

/**
 * fb-rbac-editor — the Access inspector view. A field picker (Tab › Section ›
 * Field) selects a placement; a role×access grid then shows one row per org
 * role with a per-role access dropdown (default / none / read / write).
 *
 * Permissive by default: a field with no grant is fully writable for everyone.
 * Choosing "default" on a row deletes that role's grant (revert to permissive);
 * choosing none/read/write upserts it. Every change re-fetches the grid so the
 * editor stays server-authoritative. All edits are draft-only (gated on
 * store.isDraft()); a published/retired version renders the grid read-only.
 */
@Component({
  selector: 'fb-rbac-editor',
  templateUrl: './fb-rbac-editor.component.html',
  styleUrls: ['./fb-rbac-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbRbacEditorComponent implements OnInit {
  readonly store = inject(FormBuilderStore);
  private readonly admin = inject(FbAdminService);
  private readonly roleSvc = inject(RoleService);
  private readonly translate = inject(TranslateService);
  private readonly global = inject(GlobalService);

  /** The current inspector selection — a selected field preselects the grid. */
  selected = input<SelectedElement>(null);

  readonly roles = signal<Role[]>([]);
  readonly rows = signal<RbacRow[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly selectedFieldId = signal<string | null>(null);

  /** Field picker — flatten the tree into "Tab › Section › Field" paths. */
  readonly fieldOptions = computed(() => this.store.fieldPaths());

  readonly isDraft = computed(() => this.store.isDraft());

  /**
   * Access options. app-custom-dropdown has no translate-options input, so the
   * labels are resolved via TranslateService.instant here (re-resolved on
   * locale change would need a subscription, but the inspector remounts per
   * selection so instant is sufficient for this design-time surface).
   */
  readonly accessOptions = signal<Array<{ label: string; value: '' | FieldAccess }>>(
    [],
  );

  async ngOnInit(): Promise<void> {
    this.buildAccessOptions();
    try {
      const res: any = await this.roleSvc.listRoles({ page: 1, limit: 200 });
      const rows = res?.data?.roles ?? [];
      this.roles.set(rows.map((r: any) => ({ id: r.id, name: r.name })));
    } catch {
      this.roles.set([]);
    }
    // Preselect the canvas-selected field, if any.
    const sel = this.selected();
    if (sel?.kind === 'field') this.pickField(sel.id);
  }

  private buildAccessOptions(): void {
    this.accessOptions.set([
      {
        label: this.translate.instant('FORM_BUILDER.RBAC.ACCESS.DEFAULT'),
        value: '',
      },
      {
        label: this.translate.instant('FORM_BUILDER.RBAC.ACCESS.NONE'),
        value: 'none',
      },
      {
        label: this.translate.instant('FORM_BUILDER.RBAC.ACCESS.READ'),
        value: 'read',
      },
      {
        label: this.translate.instant('FORM_BUILDER.RBAC.ACCESS.WRITE'),
        value: 'write',
      },
    ]);
  }

  async pickField(formFieldId: string | null): Promise<void> {
    this.selectedFieldId.set(formFieldId);
    if (formFieldId) await this.loadGrid(formFieldId);
    else this.rows.set([]);
  }

  private async loadGrid(formFieldId: string): Promise<void> {
    this.loading.set(true);
    try {
      const res: any = await this.admin.listFieldPermissions(
        this.store.formId(),
        this.store.version(),
        formFieldId,
      );
      const byRole: Record<string, FieldAccess> = {};
      for (const g of res?.data?.grants ?? []) byRole[g.roleId] = g.access;
      // One row per org role; unlisted roles show the permissive default ('').
      this.rows.set(
        this.roles().map(r => ({
          roleId: r.id,
          roleName: r.name,
          access: byRole[r.id] ?? '',
        })),
      );
    } catch {
      this.rows.set(
        this.roles().map(r => ({ roleId: r.id, roleName: r.name, access: '' })),
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onAccessChange(row: RbacRow, value: '' | FieldAccess): Promise<void> {
    const fieldId = this.selectedFieldId();
    if (!fieldId || !this.isDraft()) return;
    // Optimistic local update so the dropdown reflects the pick immediately.
    this.rows.update(list =>
      list.map(r => (r.roleId === row.roleId ? { ...r, access: value } : r)),
    );
    this.saving.set(true);
    try {
      if (value === '') {
        await this.admin.deleteFieldPermission(
          this.store.formId(),
          this.store.version(),
          fieldId,
          row.roleId,
        );
      } else {
        await this.admin.setFieldPermission(
          this.store.formId(),
          this.store.version(),
          fieldId,
          { roleId: row.roleId, access: value },
        );
      }
      // Re-fetch so the grid stays server-authoritative.
      await this.loadGrid(fieldId);
    } catch {
      this.global.showWarn('That access change could not be saved.');
      await this.loadGrid(fieldId); // resync from the server
    } finally {
      this.saving.set(false);
    }
  }
}
