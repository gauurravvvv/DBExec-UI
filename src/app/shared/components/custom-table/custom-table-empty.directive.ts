import { Directive } from '@angular/core';

/**
 * Marker directive for a host-projected empty state.
 *
 * Put it on the element you project into `<app-custom-table>` to REPLACE the
 * table's default "no records" body — e.g. a "pick a datasource" or
 * "unsupported" prompt whose visibility the host controls with its own
 * `*ngIf`s:
 *
 *   <app-custom-table ...>
 *     <div tableEmpty>…state-specific message…</div>
 *   </app-custom-table>
 *
 * The component `@ContentChild`s this directive; when present it suppresses
 * its own default empty message so the two don't stack.
 */
@Directive({
  selector: '[tableEmpty]',
  standalone: true,
})
export class CustomTableEmptyDirective {}
