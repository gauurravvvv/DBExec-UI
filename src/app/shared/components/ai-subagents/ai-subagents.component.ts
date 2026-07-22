import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { TranslateService } from '@ngx-translate/core';
import type {
  AiStepStatus,
  SubAgentStep,
} from 'src/app/modules/ai-workspace/services/ai-chat.service';

/**
 * app-ai-subagents — the "SUB-AGENTS" section beneath a delegate step. It
 * iterates the delegate's `subAgents`, rendering each as a collapsible
 * "SUB-AGENT · <label>" row whose body recursively renders the specialist's
 * own tool steps (via <app-ai-tool-step>) and its streamed text.
 *
 * Richness per sub-agent: a status icon (spinner → check → alert), an
 * index/total "1/2" progress chip, a live elapsed timer while running plus a
 * frozen duration badge once done, and auto-expand-while-running /
 * auto-collapse-on-done (until the user toggles it).
 *
 * OnPush + token-driven. Recursion is bounded by the engine (supervisor →
 * specialist, one level), so this never nests beyond a single depth.
 */
@Component({
  selector: 'app-ai-subagents',
  templateUrl: './ai-subagents.component.html',
  styleUrls: ['./ai-subagents.component.scss'],
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
export class AiSubagentsComponent implements OnChanges, OnDestroy {
  /** The delegate's sub-agent runs to render. */
  @Input({ required: true }) subAgents: SubAgentStep[] = [];

  /** Nesting depth (from the parent tool step). */
  @Input() depth = 1;

  /** Live clock driving each running sub-agent's elapsed timer. */
  readonly now = signal<number>(Date.now());
  private ticker: ReturnType<typeof setInterval> | null = null;

  /**
   * Per-sub-agent manual expand overrides, keyed by index. `undefined` =
   * follow the auto policy (open while running, closed once done).
   */
  private manual = new Map<number, boolean>();

  constructor(private translate: TranslateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['subAgents']) this.syncTicker();
  }

  ngOnDestroy(): void {
    this.stopTicker();
  }

  /** Tick while ANY sub-agent is still running; stop when all finish. */
  private syncTicker(): void {
    const anyRunning = this.subAgents.some((s) => s.status === 'running');
    if (anyRunning) {
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

  /** Whether a sub-agent row is currently expanded. */
  isExpanded(sub: SubAgentStep, index: number): boolean {
    const override = this.manual.get(index);
    if (override !== undefined) return override;
    return sub.status === 'running';
  }

  /** Toggle a sub-agent open/closed; the user's choice sticks thereafter. */
  toggle(sub: SubAgentStep, index: number): void {
    this.manual.set(index, !this.isExpanded(sub, index));
  }

  /** Whole seconds elapsed for a sub-agent, live while running. */
  elapsedSeconds(sub: SubAgentStep): number {
    if (!sub.startedAt) return 0;
    const end = sub.endedAt ?? this.now();
    return Math.max(0, Math.round((end - sub.startedAt) / 1000));
  }

  /** Frozen duration label for a completed sub-agent. */
  durationLabel(sub: SubAgentStep): string {
    if (!sub.endedAt || !sub.startedAt) return '';
    const ms = Math.max(0, sub.endedAt - sub.startedAt);
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  /** Status icon class for a sub-agent (spinner / check / alert). */
  statusIcon(status: AiStepStatus): string {
    switch (status) {
      case 'done':
        return 'pi pi-check-circle';
      case 'error':
        return 'pi pi-exclamation-circle';
      default:
        return 'pi pi-spin pi-spinner';
    }
  }

  /** a11y status label. */
  statusLabel(status: AiStepStatus): string {
    switch (status) {
      case 'done':
        return this.translate.instant('AI_WORKSPACE.SUBAGENTS.DONE');
      case 'error':
        return this.translate.instant('AI_WORKSPACE.SUBAGENTS.FAILED');
      default:
        return this.translate.instant('AI_WORKSPACE.SUBAGENTS.RUNNING');
    }
  }

  trackSub(index: number): number {
    return index;
  }

  trackStep(_index: number, step: { toolCallId: string }): string {
    return step.toolCallId;
  }
}
