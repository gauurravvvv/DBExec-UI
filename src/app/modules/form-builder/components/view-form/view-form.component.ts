import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FORM_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { FormSummary, FormVersionSummary } from '../../services/fb-types';
import { FbAdminService } from '../../services/fb-admin.service';

/**
 * Read-only detail: form-family header + version list + Design / Run links.
 * Run is disabled until a version is published.
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

  readonly routes = FORM_BUILDER;
  readonly loading = signal(true);
  readonly form = signal<FormSummary | null>(null);
  readonly versions = signal<FormVersionSummary[]>([]);

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
}
