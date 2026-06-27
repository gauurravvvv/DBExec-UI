import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DropdownModule } from 'primeng/dropdown';
import { TooltipModule } from 'primeng/tooltip';

/**
 * UsPaginator — host-owned paginator that drives BE-paginated
 * listings rendered through `<us-data-grid>`. AG Grid Community
 * doesn't include the Server-Side Row Model, so the grid itself
 * is in Client-Side mode rendering one BE page at a time; this
 * paginator below the grid is the user-facing page navigator.
 *
 * Visually matches the existing PrimeNG paginator template used
 * inside `p-table` so the migration to AG Grid is invisible to the
 * user — same "X - Y of Z" counter, same page-size dropdown, same
 * first/prev/next/last buttons.
 *
 * The component is stateless — it derives every visible state from
 * `[page]`, `[limit]`, `[total]`, and `[pageSizeOptions]`, and emits
 * `(pageChange)` / `(limitChange)` callbacks. The host typically
 * pipes these into a `UsServerListAdapter`.
 */
@Component({
  selector: 'us-paginator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DropdownModule,
    TooltipModule,
  ],
  template: `
    <div class="us-paginator">
      <div class="us-paginator__left">
        <span class="us-paginator__counter" *ngIf="total > 0">
          {{ rangeStart }} - {{ rangeEnd }}
          <span class="us-paginator__counter-of">of</span>
          {{ total }}
        </span>
        <span class="us-paginator__counter us-paginator__counter--empty" *ngIf="total === 0">
          0 of 0
        </span>
      </div>

      <div class="us-paginator__center">
        <button
          type="button"
          class="us-paginator__btn"
          [disabled]="page <= 1"
          (click)="go(1)"
          [pTooltip]="'COMMON.FIRST' | translate"
          tooltipPosition="top"
          [attr.aria-label]="'COMMON.FIRST' | translate"
        >
          <i class="pi pi-angle-double-left"></i>
        </button>
        <button
          type="button"
          class="us-paginator__btn"
          [disabled]="page <= 1"
          (click)="go(page - 1)"
          [pTooltip]="'COMMON.PREV' | translate"
          tooltipPosition="top"
          [attr.aria-label]="'COMMON.PREV' | translate"
        >
          <i class="pi pi-angle-left"></i>
        </button>

        <span class="us-paginator__page-indicator">
          {{ page }} / {{ lastPage || 1 }}
        </span>

        <button
          type="button"
          class="us-paginator__btn"
          [disabled]="page >= lastPage"
          (click)="go(page + 1)"
          [pTooltip]="'COMMON.NEXT' | translate"
          tooltipPosition="top"
          [attr.aria-label]="'COMMON.NEXT' | translate"
        >
          <i class="pi pi-angle-right"></i>
        </button>
        <button
          type="button"
          class="us-paginator__btn"
          [disabled]="page >= lastPage"
          (click)="go(lastPage)"
          [pTooltip]="'COMMON.LAST' | translate"
          tooltipPosition="top"
          [attr.aria-label]="'COMMON.LAST' | translate"
        >
          <i class="pi pi-angle-double-right"></i>
        </button>
      </div>

      <div class="us-paginator__right">
        <p-dropdown
          styleClass="us-paginator__size-select"
          [options]="pageSizeOptionObjects"
          [(ngModel)]="limit"
          (onChange)="onLimitChange($event.value)"
          appendTo="body"
        ></p-dropdown>
      </div>
    </div>
  `,
  styles: [
    `
      .us-paginator {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.5rem 0.75rem;
        background: var(--surface-section, #fff);
        border-top: 1px solid var(--surface-border, #e5e7eb);
        font-size: 0.875rem;
        color: var(--text-color, #1f2937);
      }
      .us-paginator__left,
      .us-paginator__right {
        flex: 0 0 auto;
      }
      .us-paginator__center {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
      }
      .us-paginator__counter {
        font-weight: 500;
        color: var(--text-color-secondary, #4b5563);
      }
      .us-paginator__counter-of {
        margin: 0 0.25rem;
        color: var(--text-color-secondary, #6b7280);
      }
      .us-paginator__counter--empty {
        opacity: 0.6;
      }
      .us-paginator__btn {
        background: transparent;
        border: 1px solid var(--surface-border, #e5e7eb);
        border-radius: 6px;
        color: var(--text-color, #1f2937);
        cursor: pointer;
        height: 2rem;
        width: 2rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.12s, border-color 0.12s;
      }
      .us-paginator__btn:hover:not(:disabled) {
        background: var(--surface-hover, #f3f4f6);
        border-color: var(--primary-color, #3b82f6);
      }
      .us-paginator__btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .us-paginator__page-indicator {
        margin: 0 0.5rem;
        font-variant-numeric: tabular-nums;
        min-width: 4ch;
        text-align: center;
        color: var(--text-color-secondary, #4b5563);
      }
      :host ::ng-deep .us-paginator__size-select.p-dropdown {
        min-width: 5.5rem;
        height: 2rem;
      }
      :host ::ng-deep .us-paginator__size-select.p-dropdown .p-dropdown-label {
        padding: 0.25rem 0.5rem;
        font-size: 0.875rem;
        line-height: 1.5rem;
      }
    `,
  ],
})
export class UsPaginatorComponent {
  /** Current 1-based page index. */
  @Input() page = 1;
  /** Current page size. */
  @Input() limit = 25;
  /** BE-reported total row count. */
  @Input() total = 0;
  /** Allowed page sizes. */
  @Input() pageSizeOptions: number[] = [10, 25, 50, 100];

  @Output() pageChange = new EventEmitter<number>();
  @Output() limitChange = new EventEmitter<number>();

  /** PrimeNG dropdown needs {label, value} objects — derive once
   *  per binding pass via a getter so we don't carry a duplicated
   *  array. */
  get pageSizeOptionObjects(): { label: string; value: number }[] {
    return this.pageSizeOptions.map(n => ({ label: String(n), value: n }));
  }

  get lastPage(): number {
    return Math.max(1, Math.ceil(this.total / Math.max(1, this.limit)));
  }

  get rangeStart(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.limit + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.page * this.limit, this.total);
  }

  go(page: number): void {
    const clamped = Math.max(1, Math.min(page, this.lastPage));
    if (clamped === this.page) return;
    this.pageChange.emit(clamped);
  }

  onLimitChange(limit: number): void {
    if (limit === this.limit) return;
    this.limitChange.emit(limit);
  }
}
