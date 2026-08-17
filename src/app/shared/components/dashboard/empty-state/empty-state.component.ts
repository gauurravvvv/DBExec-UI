import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

/**
 * app-empty-state — a small reusable "nothing here yet" block.
 *
 * The app historically hand-rolled `.empty-state` markup on many
 * screens; this promotes it to one themed component. Used inside a
 * widget-card body (or anywhere a panel has no data). Copy is passed
 * already-localized.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './empty-state.component.html',
  styleUrls: ['./empty-state.component.scss'],
})
export class EmptyStateComponent {
  @Input() icon = 'pi pi-inbox';
  @Input() title = '';
  @Input() description = '';
  @Input() cta: { label: string } | null = null;
  /** 'muted' (grey) or 'positive' (green — e.g. "all clear"). */
  @Input() tone: 'muted' | 'positive' = 'muted';

  @Output() ctaClick = new EventEmitter<void>();
}
