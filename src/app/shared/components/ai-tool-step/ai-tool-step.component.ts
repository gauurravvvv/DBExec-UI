import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import type { AiCard } from 'src/app/shared/validators/ai-cards';
import type { ToolStep } from 'src/app/modules/ai-workspace/services/ai-chat.service';

/**
 * app-ai-tool-step — renders ONE node of a message's live-computation tree
 * (design §F). A plain tool call is a leaf collapsible row; a delegate call
 * additionally hosts an <app-ai-subagents> block that recursively renders the
 * specialist's own steps.
 *
 * Richness (per the FE-ui contract):
 *  - status icon: spinner while running → check on done → alert on error
 *  - a live elapsed timer while running (startedAt → now, ticking ~2/sec via a
 *    signal; the interval is created lazily and cleaned up on destroy / done)
 *  - a duration badge (endedAt − startedAt) once finished
 *  - the muted `{}` JSON snippet (resultPreview) with a Copy button
 *  - a chevron that expands the rich card (reusing the launcher's existing
 *    card renderers) + the sub-agents block
 *  - auto-expand while running, auto-collapse on completion — UNLESS the user
 *    has toggled it manually (their intent wins from then on)
 *
 * Purely presentational + OnPush; the reducer in AiChatService owns the model.
 */
@Component({
  selector: 'app-ai-tool-step',
  templateUrl: './ai-tool-step.component.html',
  styleUrls: ['./ai-tool-step.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('expandBody', [
      transition(':enter', [
        style({ height: '0', opacity: 0 }),
        animate('180ms ease', style({ height: '*', opacity: 1 })),
      ]),
      transition(':leave', [
        style({ height: '*', opacity: 1 }),
        animate('140ms ease', style({ height: '0', opacity: 0 })),
      ]),
    ]),
  ],
})
export class AiToolStepComponent implements OnChanges, OnDestroy {
  /** The step to render (delegate or plain tool call). */
  @Input({ required: true }) step!: ToolStep;

  /** Nesting depth — sub-agent steps render slightly tighter. */
  @Input() depth = 0;

  /** A live clock (epoch-ms) driving the elapsed timer while running. */
  private readonly now = signal<number>(Date.now());
  private ticker: ReturnType<typeof setInterval> | null = null;

  /**
   * Reactive mirror of the `step` Input. Angular Inputs are not signals, and
   * `patchAssistant` replaces the whole message object each tick, so every
   * derived value must depend on THIS signal (re-set in ngOnChanges) to
   * recompute when the Input changes.
   */
  private readonly stepSig = signal<ToolStep | null>(null);

  /**
   * The user's manual expand override. `null` = follow the automatic policy
   * (expanded while running, collapsed once done); once the user clicks the
   * chevron this holds their explicit choice and the auto policy is ignored.
   */
  private readonly manualExpanded = signal<boolean | null>(null);

  /** Whether the body (card + sub-agents) is currently shown. */
  readonly isExpanded = computed(() => {
    const manual = this.manualExpanded();
    if (manual !== null) return manual;
    // Auto policy: open while running, closed once finished.
    return this.stepSig()?.status === 'running';
  });

  /** True when this step is a delegate (carries sub-agents). */
  readonly isDelegate = computed(
    () => (this.stepSig()?.subAgents?.length ?? 0) > 0,
  );

  /** Whole seconds elapsed, live while running, frozen once done. */
  readonly elapsedSeconds = computed(() => {
    const s = this.stepSig();
    if (!s?.startedAt) return 0;
    const end = s.endedAt ?? this.now();
    return Math.max(0, Math.round((end - s.startedAt) / 1000));
  });

  /** Final duration label (e.g. "1.2s"), shown once the step completes. */
  readonly durationLabel = computed(() => {
    const s = this.stepSig();
    if (!s?.endedAt || !s?.startedAt) return '';
    const ms = Math.max(0, s.endedAt - s.startedAt);
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  });

  constructor(
    private translate: TranslateService,
    private message: MessageService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['step']) {
      this.stepSig.set(this.step ?? null);
      this.syncTicker();
    }
  }

  ngOnDestroy(): void {
    this.stopTicker();
  }

  /** Start ticking while running; stop once the step finishes. */
  private syncTicker(): void {
    if (this.step?.status === 'running' && !this.step?.endedAt) {
      if (!this.ticker) {
        this.now.set(Date.now());
        this.ticker = setInterval(() => this.now.set(Date.now()), 500);
      }
    } else {
      this.stopTicker();
    }
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /** Toggle the body open/closed; from here on the user's choice sticks. */
  toggle(): void {
    this.manualExpanded.set(!this.isExpanded());
  }

  /** Copy the `{}` JSON snippet to the clipboard with a toast. */
  copyResult(event: Event): void {
    event.stopPropagation();
    const text = this.step?.resultPreview;
    if (!text) return;
    try {
      navigator.clipboard?.writeText(text);
      this.message.add({
        severity: 'success',
        summary: this.translate.instant('AI_WORKSPACE.COPIED'),
        detail: '',
      });
    } catch {
      /* clipboard unavailable */
    }
  }

  // ── template helpers ───────────────────────────────────────────────

  /** Status icon class (spinner / check / alert). */
  get statusIcon(): string {
    switch (this.step?.status) {
      case 'done':
        return 'pi pi-check-circle';
      case 'error':
        return 'pi pi-exclamation-circle';
      default:
        return 'pi pi-spin pi-spinner';
    }
  }

  /** a11y status label. */
  get statusLabel(): string {
    switch (this.step?.status) {
      case 'done':
        return this.translate.instant('AI_WORKSPACE.SUBAGENTS.DONE');
      case 'error':
        return this.translate.instant('AI_WORKSPACE.SUBAGENTS.FAILED');
      default:
        return this.translate.instant('AI_WORKSPACE.SUBAGENTS.RUNNING');
    }
  }

  /** The card, if this step resolved to one (rendered when expanded). */
  get card(): AiCard | undefined {
    return this.step?.card;
  }
}
