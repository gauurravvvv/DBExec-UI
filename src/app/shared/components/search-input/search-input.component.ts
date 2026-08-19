import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

/**
 * app-search-input — the shared debounced list-toolbar search field.
 *
 * Replaces the raw "search input + a hand-rolled debounce" repeated across
 * list screens. Leading search icon, a clear (×) button once there's text,
 * and a configurable debounce. Emits `searchChange` with the trimmed term
 * (already debounced + de-duped), so a list can wire it straight to its
 * server adapter.
 *
 *   <app-search-input
 *     [placeholder]="'COMMON.SEARCH' | translate"
 *     (searchChange)="onSearch($event)"></app-search-input>
 */
@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './search-input.component.html',
  styleUrls: ['./search-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchInputComponent implements OnInit, OnDestroy {
  @Input() placeholder = '';
  @Input() debounce = 300;
  /** Seed / controlled value (e.g. restoring a term from the URL). */
  @Input() value = '';
  @Input() disabled = false;

  /** Debounced, trimmed, de-duplicated search term. */
  @Output() searchChange = new EventEmitter<string>();

  private readonly input$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.input$
      .pipe(
        debounceTime(this.debounce),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
      )
      .subscribe(term => this.searchChange.emit(term.trim()));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInput(event: Event): void {
    this.value = (event.target as HTMLInputElement).value;
    this.input$.next(this.value);
  }

  clear(): void {
    if (!this.value) return;
    this.value = '';
    // Clear is immediate (no debounce) — the user expects instant reset.
    this.searchChange.emit('');
  }
}
