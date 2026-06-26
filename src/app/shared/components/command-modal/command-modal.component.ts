import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

/**
 * Generic "command palette" modal shell. Used by:
 *   - <app-global-search> (showInput = true, debounced search)
 *   - <app-notification-modal> (showInput = false, header action)
 *
 * Owns:
 *   - the backdrop + dismiss-on-backdrop-click,
 *   - the Escape-to-close handler,
 *   - focus management on open,
 *   - the modal chrome (header + scroll body + animation).
 *
 * Consumers project their row list via <ng-content>. Everything
 * row-specific (debouncing, navigation, keyboard ↑↓ between rows)
 * stays on the consumer — this shell is dumb and reusable.
 */
@Component({
  selector: 'app-command-modal',
  templateUrl: './command-modal.component.html',
  styleUrls: ['./command-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandModalComponent implements OnChanges, AfterViewInit {
  @Input() isOpen = false;
  /** Modal heading shown when `showInput` is false. */
  @Input() title?: string;
  /** Render a search input row at the top. */
  @Input() showInput = false;
  @Input() inputPlaceholder = '';
  @Input() inputValue = '';
  /**
   * Optional header action button (e.g. "Mark all read"). When
   * null/empty the button is not rendered.
   */
  @Input() headerActionLabel: string | null = null;
  /** Disable the header action conditionally (e.g. no unread items). */
  @Input() headerActionDisabled = false;

  @Output() inputChange = new EventEmitter<string>();
  @Output() inputSubmit = new EventEmitter<string>();
  @Output() headerAction = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('modalRoot') modalRoot?: ElementRef<HTMLElement>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && changes['isOpen'].currentValue === true) {
      // Defer focus so the element exists in the DOM. 0ms is enough.
      setTimeout(() => this.focusInitial(), 0);
    }
  }

  ngAfterViewInit(): void {
    if (this.isOpen) this.focusInitial();
  }

  /**
   * Focus the input when present, otherwise the modal root so the
   * Esc-to-close keyboard handler has a focus target.
   */
  private focusInitial(): void {
    if (this.showInput && this.searchInput) {
      this.searchInput.nativeElement.focus();
      this.searchInput.nativeElement.select();
    } else {
      this.modalRoot?.nativeElement.focus();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    // Defensive — only dismiss when the actual backdrop is clicked,
    // not when a click inside the modal bubbles up.
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  onContentClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  onInputInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.inputValue = value;
    this.inputChange.emit(value);
  }

  onInputEnter(): void {
    this.inputSubmit.emit(this.inputValue);
  }

  onCloseClick(): void {
    this.closed.emit();
  }

  onHeaderActionClick(): void {
    if (!this.headerActionDisabled) this.headerAction.emit();
  }

  @HostListener('window:keydown.escape', ['$event'])
  onEscape(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    this.closed.emit();
  }
}
