import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { FbAdminService } from '../../services/fb-admin.service';
import { FormBuilderStore } from '../../services/form-builder-store';
import { FormVersionSummary } from '../../services/fb-types';

/**
 * The 3-pane designer shell (palette | canvas | inspector). Loads the working
 * version's resolved tree via one hydration call, provides the FormBuilderStore,
 * gates all edit affordances on store.isDraft(), renders the draft/published
 * banner + version picker, and hosts the inspector view switch.
 */
@Component({
  selector: 'app-fb-design',
  templateUrl: './fb-design.component.html',
  styleUrls: ['./fb-design.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FormBuilderStore],
})
export class FbDesignComponent implements OnInit, HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly admin = inject(FbAdminService);
  private readonly global = inject(GlobalService);
  readonly store = inject(FormBuilderStore);

  readonly loading = signal(true);
  readonly connectorId = signal<string>('');
  readonly name = signal<string>('');
  readonly versions = signal<FormVersionSummary[]>([]);

  // Reorders auto-persist; only in-flight debounced edits are flushed on
  // deactivate. Nothing here blocks navigation.
  hasUnsavedChanges(): boolean {
    return false;
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.store.formId.set(id);
    this.store.initPatchPumps();
    try {
      const header = await this.admin.getForm(id);
      const h = header?.data;
      this.connectorId.set(h?.connectorId ?? '');
      this.name.set(h?.name ?? '');
      this.versions.set(h?.versions ?? []);
      const v = h?.latestDraftVersion ?? h?.publishedVersion ?? 1;
      const res = await this.admin.getFormVersion(id, v);
      const s = res?.data;
      if (s)
        this.store.hydrate({
          version: s.version,
          state: s.state,
          tabs: s.tabs ?? [],
        });
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load the form');
    } finally {
      this.loading.set(false);
    }
  }

  async publish(): Promise<void> {
    try {
      const res = await this.admin.publish(
        this.store.formId(),
        this.store.version(),
      );
      this.global.handleAPIResponse(res);
      await this.reload();
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Publish failed');
    }
  }

  async fork(): Promise<void> {
    try {
      const res = await this.admin.fork(
        this.store.formId(),
        this.store.version(),
      );
      this.global.handleAPIResponse(res);
      await this.reload();
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Fork failed');
    }
  }

  async onVersionChange(v: number): Promise<void> {
    const res = await this.admin.getFormVersion(this.store.formId(), v);
    const s = res?.data;
    if (s)
      this.store.hydrate({
        version: s.version,
        state: s.state,
        tabs: s.tabs ?? [],
      });
  }

  private async reload(): Promise<void> {
    const header = await this.admin.getForm(this.store.formId());
    this.versions.set(header?.data?.versions ?? []);
    const v =
      header?.data?.latestDraftVersion ?? header?.data?.publishedVersion ?? 1;
    await this.onVersionChange(v);
  }
}
