import { CommonModule } from '@angular/common';
import { Component, TemplateRef } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

/**
 * AG Grid → Angular bridge cell. Used by the wrapper to plug a
 * caller-supplied `<ng-template usGridCell="…">` into AG Grid's
 * `cellRenderer` slot. The template gets the row data + helpers
 * via the implicit context.
 */
@Component({
  selector: 'us-cell-template-renderer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container
      *ngTemplateOutlet="template; context: ctx"
    ></ng-container>
  `,
})
export class UsCellTemplateRendererComponent
  implements ICellRendererAngularComp
{
  template!: TemplateRef<unknown>;
  ctx: Record<string, unknown> = {};

  agInit(params: ICellRendererParams & { template: TemplateRef<unknown> }): void {
    this.template = params.template;
    this.ctx = {
      $implicit: params.data,
      row: params.data,
      value: params.value,
      colId: params.column?.getColId(),
      node: params.node,
    };
  }

  refresh(params: ICellRendererParams & { template: TemplateRef<unknown> }): boolean {
    this.template = params.template;
    this.ctx = {
      $implicit: params.data,
      row: params.data,
      value: params.value,
      colId: params.column?.getColId(),
      node: params.node,
    };
    return true;
  }
}
