import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

/**
 * The state a dashboard widget is currently in. The card renders a
 * different body for each:
 *   loading — skeleton shimmer (the fetch is in flight)
 *   ready   — the projected content (the real widget)
 *   empty   — the fetch succeeded but there is nothing to show
 *   denied  — the viewer lacks the permission this widget needs
 *   error   — the fetch failed
 */
export type WidgetState = 'loading' | 'ready' | 'empty' | 'denied' | 'error';

/**
 * app-widget-card — the shell every landing-dashboard widget sits in.
 *
 * It owns the four non-ready states so individual widgets don't each
 * reinvent skeletons / empty / denied. The widget projects its real
 * content via <ng-content>; the card shows it only in the `ready`
 * state and swaps in a skeleton / empty / denied / error body
 * otherwise.
 *
 * Permission gating is fixed-slot by design: a denied widget still
 * occupies its grid position and shows a localized "Permission
 * Denied" body, so the layout never reflows based on who is looking.
 * Set [state]="'denied'" (the host page decides via PermissionService)
 * and the card renders the denied body.
 *
 * USAGE:
 *   <app-widget-card
 *     [title]="'DASHBOARD.WIDGET.QUERY_ACTIVITY' | translate"
 *     icon="pi pi-chart-line"
 *     [state]="queryTrend.state"
 *     [link]="{ label: 'DASHBOARD.LINK.AUDIT' | translate, route: '/app/audit' }"
 *     [skeletonVariant]="'chart'">
 *     <app-trend-chart [series]="queryTrend.data"></app-trend-chart>
 *   </app-widget-card>
 */
@Component({
  selector: 'app-widget-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './widget-card.component.html',
  styleUrls: ['./widget-card.component.scss'],
})
export class WidgetCardComponent {
  /** Card title (already translated by the caller). */
  @Input() title = '';

  /** PrimeIcon class for the title icon, e.g. 'pi pi-chart-bar'. */
  @Input() icon = '';

  /** Current body state. */
  @Input() state: WidgetState = 'loading';

  /**
   * Which skeleton silhouette to draw while loading:
   *   'chart' — a title line + a big block (trend/donut widgets)
   *   'list'  — several stacked rows (activity feed)
   *   'stat'  — a big value bar + two short lines (stat tiles)
   *   'table' — header + rows
   */
  @Input() skeletonVariant: 'chart' | 'list' | 'stat' | 'table' = 'chart';

  /** How many skeleton rows for the 'list' / 'table' variants. */
  @Input() skeletonRows = 5;

  /** Optional top-right link (label already translated). */
  @Input() link: { label: string; route?: string } | null = null;

  /** Localized copy for the empty state. */
  @Input() emptyText = '';
  @Input() emptyIcon = 'pi pi-inbox';
  /** Optional call-to-action shown under the empty text. */
  @Input() emptyCta: { label: string } | null = null;

  /** Localized copy for the denied state. */
  @Input() deniedText = '';

  /** Localized copy for the error state. */
  @Input() errorText = '';

  /** Fired when the header link is clicked. */
  @Output() linkClick = new EventEmitter<void>();
  /** Fired when the empty-state CTA is clicked. */
  @Output() ctaClick = new EventEmitter<void>();
  /** Fired when the error state's retry is clicked. */
  @Output() retry = new EventEmitter<void>();

  /** Rows helper for *ngFor skeleton silhouettes. */
  get rows(): number[] {
    return Array.from({ length: this.skeletonRows });
  }
}
