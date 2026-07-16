import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

/** Visual variant — maps to the app's existing button idioms. */
export type ButtonVariant =
  | 'primary' // filled primary (btn-save / btn-primary / p-button-primary)
  | 'secondary' // outlined neutral (btn-cancel / p-button-outlined)
  | 'ghost' // text-only, subtle (p-button-text)
  | 'danger' // destructive (btn-danger / p-button-danger)
  | 'icon'; // square icon-only (icon-btn edit/delete)

export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * app-button — the single canonical button for the app. Replaces the
 * scattered `btn-save` / `btn-cancel` / `btn-confirm` / `btn-danger` /
 * `icon-btn` / `p-button-*` class combos with one tokenised component so
 * every action reads and behaves consistently (variant, size, loading,
 * leading/trailing icon, icon-only, disabled). Purely presentational +
 * theme-token driven (colours/radii/sizes from _theme-variables.scss), so
 * it tracks the theme (incl. dark) automatically.
 *
 * Content is projected for the label, so callers keep `| translate`:
 *   <app-button variant="primary" icon="pi pi-check" [loading]="saving"
 *               (clicked)="save()">{{ 'COMMON.SAVE' | translate }}</app-button>
 *   <app-button variant="icon" icon="pi pi-trash" tone="danger"
 *               [title]="'COMMON.DELETE' | translate" (clicked)="del()"></app-button>
 */
@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';

  /** Leading PrimeIcon class (e.g. 'pi pi-check'). For variant="icon" this
   *  is the icon shown. */
  @Input() icon?: string;

  /** Trailing PrimeIcon class (e.g. a chevron). */
  @Input() trailingIcon?: string;

  /** Show a spinner + disable while true (replaces the leading icon). */
  @Input() loading = false;

  @Input() disabled = false;

  /** Native button type. Default 'button' so it never accidentally submits. */
  @Input() type: 'button' | 'submit' = 'button';

  /** Stretch to the container width (form footers). */
  @Input() block = false;

  /** Native title / aria-label (important for icon-only buttons). */
  @Input() title = '';

  @Output() clicked = new EventEmitter<MouseEvent>();

  get isIconOnly(): boolean {
    return this.variant === 'icon';
  }

  onClick(event: MouseEvent): void {
    if (this.disabled || this.loading) return;
    this.clicked.emit(event);
  }
}
