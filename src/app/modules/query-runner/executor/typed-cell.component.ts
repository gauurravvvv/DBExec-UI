import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { ICellRendererParams } from 'ag-grid-community';

/**
 * TypedCellComponent — one AG Grid cell renderer that switches on the
 * column's semanticType. NULL is shown as a muted [NULL] (distinct from
 * an empty string), JSON/array get compact previews, numbers/timestamps
 * are tabular. INTEGRATION_PLAN §6.4.
 */
@Component({
  selector: 'app-typed-cell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="isNull; else notNull">
      <span class="cell-null">[NULL]</span>
    </ng-container>
    <ng-template #notNull [ngSwitch]="type">
      <span *ngSwitchCase="'bool'" class="cell-bool">{{
        value ? 'true' : 'false'
      }}</span>
      <span *ngSwitchCase="'json'" class="cell-json" [title]="text">{{
        preview
      }}</span>
      <span *ngSwitchCase="'array'" class="cell-array">{{ arrayText }}</span>
      <span *ngSwitchCase="'number'" class="cell-num">{{ value }}</span>
      <span *ngSwitchCase="'timestamp'" class="cell-ts">{{ text }}</span>
      <span *ngSwitchCase="'date'" class="cell-ts">{{ text }}</span>
      <span *ngSwitchDefault class="cell-text" [title]="text">{{ text }}</span>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .cell-null {
        color: var(--faint, #9aa3b1);
        font-style: italic;
        opacity: 0.7;
      }
      .cell-num,
      .cell-ts {
        font-variant-numeric: tabular-nums;
      }
      .cell-bool {
        font-weight: 600;
      }
      .cell-json {
        color: var(--primary-color, #2f6f6a);
        text-decoration: underline dotted;
      }
    `,
  ],
})
export class TypedCellComponent implements ICellRendererAngularComp {
  value: any;
  type = 'text';
  isNull = false;

  agInit(p: ICellRendererParams & { semanticType?: string }): void {
    this.refresh(p);
  }
  refresh(p: ICellRendererParams & { semanticType?: string }): boolean {
    this.value = p.value;
    this.type = p.semanticType ?? 'text';
    this.isNull = this.value === null || this.value === undefined;
    return true;
  }
  get text(): string {
    if (this.value == null) return '';
    if (typeof this.value === 'object') {
      try {
        return JSON.stringify(this.value);
      } catch {
        return String(this.value);
      }
    }
    return String(this.value);
  }
  get preview(): string {
    const s = this.text;
    return s.length > 80 ? s.slice(0, 80) + '…' : s;
  }
  get arrayText(): string {
    return Array.isArray(this.value) ? `{${this.value.join(', ')}}` : this.text;
  }
}
