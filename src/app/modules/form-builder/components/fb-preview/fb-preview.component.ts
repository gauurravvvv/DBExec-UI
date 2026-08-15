import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FbAdminService } from '../../services/fb-admin.service';
import { FbRuntimeService } from '../../services/fb-runtime.service';
import { FormBuilderStore } from '../../services/form-builder-store';
import { FormRuntimeStore } from '../../services/form-runtime-store';
import {
  ResolvedField,
  ResolvedSection,
  ResolvedTab,
} from '../../services/fb-types';
import { QueryBuilderStore } from 'src/app/modules/query-builder/services/query-builder-store';
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
 * Two views of the same projection:
 *  - the RBAC access grid (fields with read/write badges — the fast at-a-glance
 *    check the RBAC editor drives), and
 *  - the actual runtime composer rendered read-only below it (the reused
 *    qb-filter-tree, hydrated through FbRuntimeService's ?preview=1&asRole so the
 *    designer sees the real business-user composer for the previewed role).
 *
 * Precedence (RBAC is the OUTER gate, applied before rule effects):
 *   RBAC none > visible · read forces read-only · then mandatory/locked/rules.
 */
@Component({
  selector: 'fb-preview',
  templateUrl: './fb-preview.component.html',
  styleUrls: ['./fb-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Own runtime store instance, isolated from the live composer. The reused qb-*
  // runtime components inject QueryBuilderStore, aliased to this FormRuntimeStore.
  providers: [
    FormRuntimeStore,
    { provide: QueryBuilderStore, useExisting: FormRuntimeStore },
  ],
})
export class FbPreviewComponent implements OnInit {
  readonly store = inject(FormBuilderStore);
  readonly runtimeStore = inject(FormRuntimeStore);
  private readonly admin = inject(FbAdminService);
  private readonly runtime = inject(FbRuntimeService);
  private readonly roleSvc = inject(RoleService);

  readonly roles = signal<Role[]>([]);
  readonly viewAsRole = signal<string | null>(null);
  readonly loading = signal(false);
  /** The projected tree for the previewed role (null role = raw design tree). */
  readonly tabs = signal<ResolvedTab[]>([]);
  /** True once the runtime composer tree hydrated for the current preview. */
  readonly composerReady = computed(() => !!this.runtimeStore.formSchema());

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
    // Hydrate the read-only runtime composer for the current draft.
    await this.reloadComposer();
  }

  async onRoleChange(roleId: string | null): Promise<void> {
    this.viewAsRole.set(roleId || null);
    await this.reload();
    await this.reloadComposer();
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

  /**
   * Hydrate the reused runtime composer read-only for the previewed role, using
   * the same ?preview=1(&asRole) schema the business-user composer consumes. Both
   * preview + asRole are WRITE-guarded server-side.
   */
  private async reloadComposer(): Promise<void> {
    const formId = this.store.formId();
    if (!formId) return;
    try {
      const res: any = await this.runtime.getSchema(formId, {
        preview: true,
        asRole: this.viewAsRole() ?? undefined,
      });
      if (res?.data) this.runtimeStore.hydrateForm(res.data);
    } catch {
      // Non-fatal — the access grid above still renders the projection.
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
