import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Centered loader for view-* and edit-* pages.
 *
 * Convention: lists use row-skeletons (you already know the shape),
 * but a one-off detail / form page is better served by a single
 * branded spinner — same visual language used inside the action
 * buttons (pi-spin pi-spinner) so the app feels consistent.
 *
 * Mount inside the content area below the page header so the back
 * button + title stay clickable while the GET is in flight.
 *
 * Sizing: the host flex-grows into its parent so the spinner lands
 * at the visual centre of the remaining page content card. Pass
 * `minHeight` only when the parent does not have a determinate
 * height (e.g. a small embedded section that wraps its content).
 *
 * Usage:
 *   <app-content-loader *ngIf="loading() && !data"></app-content-loader>
 *   <app-content-loader minHeight="240px"></app-content-loader>
 */
@Component({
  selector: 'app-content-loader',
  templateUrl: './content-loader.component.html',
  styleUrls: ['./content-loader.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentLoaderComponent {
  /** Fallback minimum height when the loader is mounted in a parent
   * without a determinate height. Default is intentionally small —
   * full-height parents use flex-grow instead. */
  @Input() minHeight = '0px';
}
