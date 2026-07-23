import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

/** Visual family of a chip. Drives colour + shape via theme tokens. */
export type ChipVariant =
  | 'status' // state pill — pair with `tone`
  | 'tag' // metadata tag (neutral, pill-shaped)
  | 'filter' // clickable facet, supports `active` + `count`
  | 'badge' // small emphasis label (version, action, default)
  | 'count' // numeric indicator
  | 'pill'; // generic rounded label

/** Semantic colour tone (independent of variant). */
export type ChipTone =
  'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';

/**
 * app-chip — the single canonical chip / tag / status-pill / badge / count
 * element for the whole app. Replaces the 286+ hand-rolled
 * `.status-pill` / `.pill` / `.badge` / `.count-badge` / `.filter-chip`
 * spans scattered across modules. Purely presentational + tokenised: every
 * colour, radius, and size comes from the theme CSS custom properties in
 * `_theme-variables.scss`, so it stays on-theme automatically (incl. dark).
 *
 * Usage:
 *   <app-chip variant="status" tone="success">Active</app-chip>
 *   <app-chip variant="tag">finance</app-chip>
 *   <app-chip variant="count">12</app-chip>
 *   <app-chip variant="filter" [active]="sel==='all'" [count]="42"
 *             (clicked)="sel='all'">All</app-chip>
 *   <app-chip variant="status" tone="error" icon="pi pi-times-circle">Failed</app-chip>
 *   <app-chip variant="tag" [removable]="true" (removed)="drop(t)">{{t}}</app-chip>
 *
 * Content is projected, so callers keep full control of the label (and can
 * still run it through | translate). A `dot` colour renders a Finder-style
 * leading swatch (used by the tags rail).
 */
@Component({
  selector: 'app-chip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chip.component.html',
  styleUrls: ['./chip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipComponent {
  /** Visual family. Defaults to a neutral generic pill. */
  @Input() variant: ChipVariant = 'pill';

  /** Semantic colour. Defaults to neutral; `status` chips usually set this. */
  @Input() tone: ChipTone = 'neutral';

  /** Optional leading PrimeIcon class (e.g. `pi pi-check-circle`). */
  @Input() icon?: string;

  /** Optional leading colour swatch (Finder tag dot). Any CSS colour. */
  @Input() dot?: string;

  /** filter variant: whether this facet is the active selection. */
  @Input() active = false;

  /** filter/count variant: an optional trailing count. `null` = hidden. */
  @Input() count: number | null = null;

  /** Render a trailing ✕ that emits `removed` (tag/filter chips). */
  @Input() removable = false;

  /** Make the whole chip a button (auto-true for `filter`). */
  @Input() clickable = false;

  /** Compact size for dense rows/tables. */
  @Input() size: 'sm' | 'md' = 'md';

  /** Tooltip text (native title). */
  @Input() title = '';

  /** Fired when a clickable/filter chip is activated. */
  @Output() clicked = new EventEmitter<MouseEvent>();

  /** Fired when the remove ✕ is pressed (does not bubble to `clicked`). */
  @Output() removed = new EventEmitter<MouseEvent>();

  get isButton(): boolean {
    return this.clickable || this.variant === 'filter';
  }

  get showCount(): boolean {
    return this.count !== null && this.count !== undefined;
  }

  onClick(event: MouseEvent): void {
    if (this.isButton) this.clicked.emit(event);
  }

  onRemove(event: MouseEvent): void {
    event.stopPropagation();
    this.removed.emit(event);
  }
}
