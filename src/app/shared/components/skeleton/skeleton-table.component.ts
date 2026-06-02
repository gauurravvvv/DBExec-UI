import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnInit,
  Renderer2,
} from '@angular/core';

/**
 * Skeleton row for table-listing pages.
 *
 * Apply as an attribute on a real `<tr>` so the row sits directly
 * inside `<tbody>` — which is the only HTML the browser will accept
 * without collapsing the layout. The component fills the `<tr>`
 * with `<td>` cells, each holding a `<p-skeleton>`.
 *
 * USAGE (inside `<p-table>`):
 *
 *   <ng-template pTemplate="loadingbody">
 *     <tr *ngFor="let _ of [].constructor(10)"
 *         appSkeletonRow
 *         [columns]="<count of data columns>"
 *         [showCheckbox]="true"
 *         [showActions]="true">
 *     </tr>
 *   </ng-template>
 *
 * Why an attribute selector on `<tr>`:
 *
 *   - An element selector keeps the custom-element host between
 *     `<tbody>` and `<tr>` — browsers collapse the row into the
 *     first column's width (skeleton "clubs" into col 0).
 *   - Components cannot be hosted on `<ng-container>`.
 *   - A structural directive on `<ng-container>` still ends up
 *     leaving a wrapping element in the table tree.
 *
 *   Putting the selector on a real `<tr>` keeps table structure
 *   valid: the `<tr>` is what's in `<tbody>`, the cells are children
 *   of the `<tr>`, the browser is happy.
 *
 * COUNTING RULE: `columns` counts only the data `<th>`s. The
 * component adds one extra `<td>` for `showCheckbox` and another
 * for `showActions`, so total cells must equal the real header's
 * `<th>` count.
 */
@Component({
  selector: 'tr[appSkeletonRow]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!--
      Inline style="padding..." on each <td> beats every global theme
      rule that would otherwise add asymmetric padding (PrimeNG's
      1rem default, .modern-table first-child tweaks, frozen-column
      offsets). Width/height on <p-skeleton> are forced via the CSS
      override below.
    -->
    <td
      *ngIf="showCheckbox"
      class="skeleton-cell skeleton-cell--checkbox"
      style="padding: 14px 8px;"
    >
      <p-skeleton borderRadius="3px"></p-skeleton>
    </td>
    <td
      *ngFor="let __ of columnArray; let j = index"
      class="skeleton-cell"
      style="padding: 14px 12px;"
    >
      <p-skeleton borderRadius="3px"></p-skeleton>
    </td>
    <td
      *ngIf="showActions"
      class="skeleton-cell skeleton-cell--actions"
      style="padding: 14px 8px;"
    >
      <p-skeleton borderRadius="4px"></p-skeleton>
    </td>
  `,
  styles: [
    `
      :host {
        height: 48px;
      }
      .skeleton-cell {
        /* 12px horizontal padding gives the bar breathing room on
           both sides; 14px vertical centres a ~20px-tall bar inside
           the 48px row. The bar itself uses width:100% (forced
           below) so it expands to whatever's left after padding. */
        padding: 14px 12px;
        vertical-align: middle;
      }
      /* PrimeNG's .p-datatable-sm cell padding (1rem) wins over our
         12px rule because of selector specificity. Force the
         narrower padding so the bar has more room. */
      :host ::ng-deep .skeleton-cell.skeleton-cell {
        padding: 14px 12px;
      }
      /* The checkbox + actions columns are narrow (~40-98px) and lose
         most of that to PrimeNG's padding. Tighten horizontal padding
         here so a visible bar still fits. Checkbox cell gets a small
         square; actions cell gets a button-shaped bar. */
      :host ::ng-deep .skeleton-cell--checkbox.skeleton-cell--checkbox {
        padding: 14px 6px;
      }
      :host ::ng-deep .skeleton-cell--actions.skeleton-cell--actions {
        padding: 14px 6px;
      }
      /* Force the inner PrimeNG skeleton element to fill the cell.
         By default <p-skeleton> sets its width/height inline on the
         inner .p-skeleton; we override with !important because the
         inline styles win otherwise. Result: each bar fills the
         cell width (minus padding) and reads at a uniform 20px tall. */
      :host ::ng-deep .skeleton-cell .p-skeleton {
        display: block;
        width: 100% !important;
        height: 20px !important;
      }
    `,
  ],
})
export class SkeletonTableRowsComponent implements OnInit {
  /** Number of DATA columns — excludes the optional checkbox + actions. */
  @Input() columns = 6;
  /** Render a leading checkbox cell to match a selectable list. */
  @Input() showCheckbox = false;
  /** Render a trailing actions cell. */
  @Input() showActions = false;

  constructor(
    private renderer: Renderer2,
    private hostRef: ElementRef<HTMLTableRowElement>,
  ) {}

  ngOnInit(): void {
    // Tag the host <tr> so any global CSS that targets .skeleton-row
    // (or hover/striping rules) keeps working.
    this.renderer.addClass(this.hostRef.nativeElement, 'skeleton-row');
  }

  get columnArray(): number[] {
    return Array.from({ length: this.columns }, (_, i) => i);
  }
}
