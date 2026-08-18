/**
 * ListFormTemplatesComponent — the org's reusable form templates, with a Clone
 * action that creates a NEW family + draft from a template's payload and
 * navigates to it. Read on init; clone is WRITE (gated by formBuilderScreen).
 *
 * Kept modular: a light list (payload omitted server-side) rendered with the
 * shared table chrome + app-button; no server paging (templates are few).
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { FORM_BUILDER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  FormPortabilityService,
  FormTemplateRow,
} from '../../services/form-portability.service';

@Component({
  selector: 'app-list-form-templates',
  templateUrl: './list-form-templates.component.html',
  styleUrls: ['./list-form-templates.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListFormTemplatesComponent implements OnInit {
  private readonly portability = inject(FormPortabilityService);
  private readonly global = inject(GlobalService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);

  readonly routes = FORM_BUILDER;
  readonly loading = this.portability.loadingTemplates;
  readonly cloning = this.portability.cloning;
  readonly templates = signal<FormTemplateRow[]>([]);
  /** id of the template a clone is in flight for (per-row spinner). */
  readonly cloningId = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.templates.set(await this.portability.listTemplates());
    } catch {
      this.global.showWarn(
        this.translate.instant('FORM_BUILDER.PORTABILITY.TEMPLATES_LOAD_FAILED'),
      );
    }
  }

  async onClone(template: FormTemplateRow): Promise<void> {
    if (this.cloningId()) return;
    this.cloningId.set(template.id);
    try {
      const result = await this.portability.cloneTemplate(template.id);
      this.global.showInfo(
        this.translate.instant('FORM_BUILDER.PORTABILITY.CLONED'),
      );
      this.router.navigateByUrl(this.routes.view(result.formId));
    } catch (e: any) {
      const key = e?.message || 'FORM_BUILDER.PORTABILITY.CLONE_FAILED';
      this.global.showWarn(this.translate.instant(key));
    } finally {
      this.cloningId.set(null);
    }
  }
}
