/**
 * config-prompt — thin shell for the single-page prompt config builder.
 *
 * Left column = stacked sections (Source, Filter, and — by the prompt's widget
 * type — Values OR Input constraints). Right column = a sticky live-preview
 * rail (client-side SQL + on-demand value sample). Each section child reads and
 * writes the per-instance PromptConfigService signals; the shell owns the page
 * header, Save, and back navigation. The old 4-step wizard / app-tabs strip was
 * removed in the 2026-08-21 rebuild.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PROMPT } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { PromptConfigService } from '../../services/prompt-config.service';
import { PromptService } from '../../services/prompt.service';

@Component({
  selector: 'app-config-prompt',
  templateUrl: './config-prompt.component.html',
  styleUrls: ['./config-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PromptConfigService], // per-screen state
})
export class ConfigPromptComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly global = inject(GlobalService);
  private readonly prompts = inject(PromptService);
  readonly svc = inject(PromptConfigService);

  promptId = '';

  async ngOnInit(): Promise<void> {
    this.promptId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.promptId) return;
    // Resolve the prompt first so the datasource id + type are available to the
    // Source / Filter sections, then hydrate the SQL-only config.
    await this.prompts.loadOne(this.promptId);
    const prompt = this.prompts.current();
    this.svc.datasourceId.set(prompt?.datasourceId ?? '');
    await this.svc.load(this.promptId);
  }

  async save(): Promise<void> {
    const res = await this.svc.save(this.promptId);
    if (res?.status) {
      this.global.handleAPIResponse(res);
      this.router.navigate([PROMPT.view(this.promptId)]);
    } else {
      // Surface a targeted message for the operator-applicability 422.
      const code = res?.data?.code;
      if (code === 'ALLOWED_OPERATORS_NOT_APPLICABLE') {
        this.global.showWarn(
          `Operator not valid for data type "${res?.data?.dataType ?? 'text'}".`,
        );
      } else {
        this.global.showWarn(res?.message ?? 'Save failed');
      }
    }
  }

  goBack(): void {
    this.router.navigate([PROMPT.LIST]);
  }

  ngOnDestroy(): void {
    this.prompts.cancelReads();
  }
}
