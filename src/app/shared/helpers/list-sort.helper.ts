/**
 * ListSortHelper — drop-in multi-column sort state for any list table.
 *
 * Standard wire contract (matches BE):
 *   ?sort=[{"field":"name","order":"asc"},{"field":"status","order":"desc"}]
 *
 * Usage:
 *   sortHelper = new ListSortHelper<'name' | 'status' | 'createdOn'>();
 *
 *   // In template:
 *   <th (click)="sortHelper.toggle('name')"
 *       [class.is-sorted]="!!sortHelper.direction('name')">
 *     Name
 *     <i class="pi" [ngClass]="{
 *       'pi-sort-alt': !sortHelper.direction('name'),
 *       'pi-sort-amount-up-alt': sortHelper.direction('name') === 'asc',
 *       'pi-sort-amount-down': sortHelper.direction('name') === 'desc',
 *     }"></i>
 *     <span *ngIf="sortHelper.index('name') > 0 && sortHelper.size > 1">
 *       {{ sortHelper.index('name') }}
 *     </span>
 *   </th>
 *
 *   // In params builder:
 *   const sortParam = sortHelper.serialize();
 *   if (sortParam) params.sort = sortParam;
 *
 * Click cycle per column: not-in-chain → asc → desc → removed from chain.
 * Chain order is click order — first-clicked stays primary.
 *
 * No Angular DI. Each component instantiates its own helper so the type parameter
 * carries the column whitelist for compile-time safety.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortStateEntry<F extends string> {
  field: F;
  order: SortDirection;
}

export class ListSortHelper<F extends string> {
  /** Click-ordered list of active sort columns. First entry is primary. */
  state: ReadonlyArray<SortStateEntry<F>> = [];

  get size(): number {
    return this.state.length;
  }

  /**
   * Cycle a column's sort:
   *   not in chain  → push at end with order='asc'
   *   in chain asc  → flip same entry to order='desc' (precedence unchanged)
   *   in chain desc → remove from chain entirely
   */
  toggle(field: F): void {
    const idx = this.state.findIndex(s => s.field === field);
    if (idx === -1) {
      this.state = [...this.state, { field, order: 'asc' }];
      return;
    }
    if (this.state[idx].order === 'asc') {
      const next = [...this.state];
      next[idx] = { field, order: 'desc' };
      this.state = next;
      return;
    }
    this.state = this.state.filter(s => s.field !== field);
  }

  /** Current direction for `field`, or '' if not in the chain. */
  direction(field: F): '' | SortDirection {
    return this.state.find(s => s.field === field)?.order ?? '';
  }

  /** 1-based position in the chain, or 0 if not sorted. Used for visible badges. */
  index(field: F): number {
    const i = this.state.findIndex(s => s.field === field);
    return i === -1 ? 0 : i + 1;
  }

  /** JSON-string for the `sort` query param, or undefined when no sort is active. */
  serialize(): string | undefined {
    if (this.state.length === 0) return undefined;
    return JSON.stringify(this.state.map(s => ({ field: s.field, order: s.order })));
  }

  clear(): void {
    this.state = [];
  }
}
