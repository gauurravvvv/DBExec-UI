/**
 * cp-preview-rail — the sticky right-hand preview for the config builder.
 *
 *  - SQL preview: live, client-side (svc.previewSql()). Labeled as generated at
 *    run time — the server compiler builds the authoritative query.
 *  - Value sample: ON-DEMAND. A Run button executes the composed SELECT against
 *    the datasource (PromptService.getPromptValuesBySQL — safe single SELECT,
 *    capped) and lists the first-column values. A "stale" hint shows when the
 *    SQL changed since the last run. Only meaningful for choice widgets.
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
  inject,
  signal,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { PromptConfigService } from '../../../services/prompt-config.service';
import { PromptService } from '../../../services/prompt.service';

const SAMPLE_LIMIT = 200;

@Component({
  selector: 'cp-preview-rail',
  templateUrl: './cp-preview-rail.component.html',
  styleUrls: ['./cp-preview-rail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpPreviewRailComponent {
  @Input({ required: true }) svc!: PromptConfigService;
  @Input({ required: true }) promptId!: string;

  private readonly prompts = inject(PromptService);
  private readonly global = inject(GlobalService);

  readonly running = signal(false);
  readonly sample = signal<any[]>([]);
  readonly sampleError = signal<string>('');
  /** The SQL string the last successful sample ran against (staleness check). */
  private readonly sampledSql = signal<string | null>(null);

  readonly canRun = computed(
    () => !!this.svc.previewSql() && !this.running(),
  );
  /** True when the live SQL has diverged from the last-sampled SQL. */
  readonly stale = computed(
    () =>
      this.sampledSql() !== null &&
      this.sampledSql() !== this.svc.previewSql(),
  );
  readonly sampleCount = computed(() => this.sample().length);

  async runPreview(): Promise<void> {
    const query = this.svc.previewSql();
    const datasourceId = this.svc.datasourceId();
    if (!query || !datasourceId) return;
    this.running.set(true);
    this.sampleError.set('');
    try {
      const res: any = await this.prompts.getPromptValuesBySQL({
        promptId: this.promptId,
        datasourceId,
        query,
      });
      if (res?.status) {
        const vals: any[] = res?.data?.columnValues ?? [];
        this.sample.set(vals.slice(0, SAMPLE_LIMIT));
        this.sampledSql.set(query);
      } else {
        this.sample.set([]);
        this.sampleError.set(res?.message ?? 'Preview failed');
      }
    } catch {
      this.sample.set([]);
      this.sampleError.set('Preview failed');
    } finally {
      this.running.set(false);
    }
  }
}
