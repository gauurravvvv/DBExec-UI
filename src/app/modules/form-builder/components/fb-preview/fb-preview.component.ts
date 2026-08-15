import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FbAdminService } from '../../services/fb-admin.service';
import { FormBuilderStore } from '../../services/form-builder-store';
import {
  ResolvedField,
  ResolvedSection,
  ResolvedTab,
} from '../../services/fb-types';
import { RoleService } from 'src/app/modules/role/services/role.service';
import { Role } from '../../models/rbac.types';

/**
 * fb-preview — the Preview inspector view with view-as-role.
 *
 * A view-as-role dropdown re-hydrates the resolved tree with `?asRole=<roleId>`
 * so the designer sees exactly what that role sees: the server projects each
 * field's effectiveAccess, OMITS `none` fields (hidden), and forces `read`
 * fields to read-only. With no role chosen the raw design tree renders (all
 * writable). This is the design-time surface for acceptance criterion #5.
 *
 * Precedence (RBAC is the OUTER gate, applied before rule effects):
 *   RBAC none > visible · read forces read-only · then mandatory/locked/rules.
 */
@Component({
  selector: 'fb-preview',
  templateUrl: './fb-preview.component.html',
  styleUrls: ['./fb-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbPreviewComponent implements OnInit {
  readonly store = inject(FormBuilderStore);
  private readonly admin = inject(FbAdminService);
  private readonly roleSvc = inject(RoleService);

  readonly roles = signal<Role[]>([]);
  readonly viewAsRole = signal<string | null>(null);
  readonly loading = signal(false);
  /** The projected tree for the previewed role (null role = raw design tree). */
  readonly tabs = signal<ResolvedTab[]>([]);

  readonly activeTab = computed<ResolvedTab | null>(() => {
    const list = this.tabs();
    return list.find(t => t.isActive) ?? list[0] ?? null;
  });

  async ngOnInit(): Promise<void> {
    try {
      const res: any = await this.roleSvc.listRoles({ page: 1, limit: 200 });
      const rows = res?.data?.roles ?? [];
      this.roles.set(rows.map((r: any) => ({ id: r.id, name: r.name })));
    } catch {
      this.roles.set([]);
    }
    // Seed from the store's already-hydrated tree (no role = raw design view).
    this.tabs.set(this.store.tabs());
  }

  async onRoleChange(roleId: string | null): Promise<void> {
    this.viewAsRole.set(roleId || null);
    await this.reload();
  }

  private async reload(): Promise<void> {
    const role = this.viewAsRole();
    if (!role) {
      // No role → the raw design tree (everything writable).
      this.tabs.set(this.store.tabs());
      return;
    }
    this.loading.set(true);
    try {
      const res: any = await this.admin.getFormVersion(
        this.store.formId(),
        this.store.version(),
        role,
      );
      // Server already omits `none` fields and forces `read` → read-only.
      this.tabs.set(res?.data?.tabs ?? []);
    } catch {
      this.tabs.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  sections(tab: ResolvedTab | null): ResolvedSection[] {
    return tab?.sections ?? [];
  }

  /** Read-only when RBAC read, or the placement itself is read-only/locked. */
  isReadOnly(field: ResolvedField): boolean {
    return (
      field.effectiveAccess === 'read' || field.isReadonly || field.isLocked
    );
  }

  fieldLabel(field: ResolvedField): string {
    return field.label || field.prompt?.name || field.formFieldId;
  }

  trackTab = (_: number, t: ResolvedTab) => t.id;
  trackSection = (_: number, s: ResolvedSection) => s.id;
  trackField = (_: number, f: ResolvedField) => f.formFieldId;
}
