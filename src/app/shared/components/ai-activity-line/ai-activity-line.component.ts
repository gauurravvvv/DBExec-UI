import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import type { ToolStep } from 'src/app/modules/ai-workspace/services/ai-chat.service';

/**
 * ai-activity-line — the compact, real-time "which agent / which API" line
 * shown under a streaming DBExecAI message. It answers the user's ask: show,
 * live, which agent is handling the turn and which API it is calling right
 * now, with an elapsed timer, and let the user expand to the full step tree.
 *
 * Collapsed (default):  ⚙ Access agent → GET /users · 0.4s   ▸
 * Expanded:             the app-ai-tool-step tree (args, previews, sub-steps)
 *
 * Purely presentational — driven by inputs from AiChatService (the live
 * `activity` signal + the streaming message's `steps`). Owns a 1s ticker so
 * the elapsed time counts up while running; the ticker stops on destroy and
 * whenever nothing is active.
 */
@Component({
  selector: 'app-ai-activity-line',
  templateUrl: './ai-activity-line.component.html',
  styleUrls: ['./ai-activity-line.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class AiActivityLineComponent implements OnInit, OnDestroy {
  /** The agent handling the turn (e.g. "Access"). */
  @Input() agent = '';
  /** The API label being called right now (e.g. "GET /users"), if any. */
  @Input() api?: string;
  /** Whether a turn is actively streaming (drives the pulse + ticker). */
  @Input() active = false;
  /** The streaming message's step tree (for the expandable detail). */
  @Input() steps: ToolStep[] = [];

  /** Expanded detail toggle. */
  readonly expanded = signal(false);
  /** A monotonically-increasing tick to re-evaluate the elapsed getter. */
  private readonly _tick = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    // Re-render ~3×/sec so the elapsed timer stays live without being busy.
    this.timer = setInterval(() => this._tick.update(t => t + 1), 350);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  toggle(): void {
    this.expanded.update(v => !v);
  }

  /** Has any step to show in the expanded view. */
  get hasSteps(): boolean {
    return (this.steps?.length ?? 0) > 0;
  }

  /**
   * Elapsed seconds of the currently-running step (or the last one). Reads
   * `_tick()` so the getter is re-evaluated by change detection each tick.
   */
  get elapsedLabel(): string {
    this._tick(); // establish the tick dependency
    const running = this.steps?.find(s => s.status === 'running');
    const ref = running ?? this.steps?.[this.steps.length - 1];
    if (!ref?.startedAt) return '';
    const end = ref.endedAt ?? Date.now();
    const secs = Math.max(0, (end - ref.startedAt) / 1000);
    return `${secs.toFixed(1)}s`;
  }

  trackStep(_i: number, s: ToolStep): string {
    return s.toolCallId;
  }
}
