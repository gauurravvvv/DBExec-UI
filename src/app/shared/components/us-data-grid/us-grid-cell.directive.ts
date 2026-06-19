import { Directive, Input, TemplateRef, inject } from '@angular/core';

/**
 * Marks an `<ng-template>` as the renderer for one grid column.
 *
 * Usage:
 *   <us-data-grid [columns]="cols" [rows]="rows">
 *     <ng-template usGridCell="actions" let-row>
 *       <button (click)="edit(row)">Edit</button>
 *     </ng-template>
 *   </us-data-grid>
 *
 * The host component picks these up via @ContentChildren and keys
 * them by the supplied `usGridCell` string (which must match the
 * `colId` / `field` on the corresponding ColDef).
 */
@Directive({
  selector: 'ng-template[usGridCell]',
  standalone: true,
})
export class UsGridCellDirective {
  @Input('usGridCell') usGridCell!: string;
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}
