import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { FORM_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { FormSummary, FormVersionSummary } from '../../services/fb-types';
import { FbAdminService } from '../../services/fb-admin.service';
import { FormPortabilityService } from '../../services/form-portability.service';

/**
 * Read-only detail: form-family header + version list + Design / Run links.
 * Run is disabled until a version is published. Also hosts the Phase 8
 * portability surface: export the published (else latest) version to a JSON
 * document, save it as a reusable org template, and open the import dialog.
 */
@Component({
  selector: 'app-view-form',
  templateUrl: './view-form.component.html',
  styleUrls: ['./view-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewFormComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly admin = inject(FbAdminService);
  private readonly global = inject(GlobalService);
  private readonly portability = inject(FormPortabilityService);
  private readonly translate = inject(TranslateService);

  readonly routes = FORM_BUILDER;
  readonly loading = signal(true);
  readonly form = signal<FormSummary | null>(null);
  readonly versions = signal<FormVersionSummary[]>([]);

  readonly exporting = this.portability.exporting;
  readonly showImportDialog = signal(false);
  readonly showTemplateDialog = signal(false);

  /**
   * The portable version: the published one when there is one, else the latest
   * version in the list. Export/save-as-template act on this version.
   */
  readonly portableVersion = computed<number | null>(() => {
    const f = this.form();
    if (f?.publishedVersion != null) return f.publishedVersion;
    const vs = this.versions();
    if (!vs.length) return null;
    return vs.reduce((max, v) => (v.version > max ? v.version : max), vs[0].version);
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      const res = await this.admin.getForm(id);
      const data = res?.data as FormSummary | undefined;
      if (data) {
        this.form.set(data);
        this.versions.set(data.versions ?? []);
      }
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load the form');
    } finally {
      this.loading.set(false);
    }
  }

  async onExport(): Promise<void> {
    const f = this.form();
    const v = this.portableVersion();
    if (!f || v == null) return;
    try {
      await this.portability.exportVersion(f.id, v);
    } catch (e: any) {
      const key = e?.message || 'FORM_BUILDER.PORTABILITY.EXPORT_FAILED';
      this.global.showWarn(this.translate.instant(key));
    }
  }

  openTemplateDialog(): void {
    this.showTemplateDialog.set(true);
  }
  onTemplateSaved(): void {
    this.showTemplateDialog.set(false);
  }
  openImportDialog(): void {
    this.showImportDialog.set(true);
  }
  onImported(): void {
    this.showImportDialog.set(false);
  }
}
