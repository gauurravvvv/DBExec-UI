/**
 * config-prompt — thin shell for the SQL-only prompt config stepper.
 *
 * Four steps: Source / Joins / Column+Filter / Values. Each step is its own
 * child component reading and writing the per-instance PromptConfigService
 * signals. The shell only owns the stepper strip, the step host, the nav
 * buttons and Save. Presentation (appearance) was removed in Phase 1 — this
 * screen carries only DB binding + value source.
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

  readonly steps = [
    { key: 'source', titleKey: 'PROMPT_MODULE.STEP_SOURCE', icon: 'pi-database' },
    { key: 'joins', titleKey: 'PROMPT_MODULE.STEP_JOINS', icon: 'pi-sitemap' },
    {
      key: 'column_filter',
      titleKey: 'PROMPT_MODULE.STEP_COLUMN_FILTER',
      icon: 'pi-filter',
    },
    { key: 'values', titleKey: 'PROMPT_MODULE.STEP_VALUES', icon: 'pi-list' },
  ];
  readonly lastStep = 3;

  async ngOnInit(): Promise<void> {
    this.promptId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.promptId) return;
    // Resolve the prompt first so the datasource id is available to the
    // Source / Joins steps, then hydrate the SQL-only config.
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
      this.global.showWarn(res?.message ?? 'Save failed');
    }
  }

  goBack(): void {
    this.router.navigate([PROMPT.LIST]);
  }

  ngOnDestroy(): void {
    this.prompts.cancelReads();
  }
}
