import {
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface TextConfig {
  placeholder: string;
  defaultValue: string;
  // Input type
  inputType: 'text' | 'password' | 'email' | 'url' | 'tel';
  inputMode: 'input' | 'textarea';
  // Validation
  maxLength: number | null;
  minLength: number | null;
  pattern: string;
  // Behaviour
  readonly: boolean;
  trim: boolean;
  autoComplete: 'on' | 'off';
  // Textarea-specific
  rows: number;
  autoResize: boolean;
  // Formatting
  keyFilter:
    | 'alphanum'
    | 'alpha'
    | 'num'
    | 'int'
    | 'pint'
    | 'money'
    | 'email'
    | 'none';
}

@Component({
  selector: 'app-text-config-dialog',
  templateUrl: './text-config-dialog.component.html',
  styleUrls: ['./text-config-dialog.component.scss'],
})
export class TextConfigDialogComponent implements OnChanges, DoCheck {
  @Input() visible = false;
  @Input() currentConfig: Partial<TextConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<TextConfig>();

  readonly defaultConfig: TextConfig = {
    placeholder: 'Enter text',
    defaultValue: '',
    inputType: 'text',
    inputMode: 'input',
    maxLength: null,
    minLength: null,
    pattern: '',
    readonly: false,
    trim: false,
    autoComplete: 'off',
    rows: 3,
    autoResize: true,
    keyFilter: 'none',
  };

  config: TextConfig = { ...this.defaultConfig };
  previewValue: string = '';

  readonly inputTypeOptions = [
    { label: 'Text', value: 'text' },
    { label: 'Password', value: 'password' },
    { label: 'Email', value: 'email' },
    { label: 'URL', value: 'url' },
    { label: 'Telephone', value: 'tel' },
  ];

  readonly inputModeOptions = [
    { label: 'Single Line (input)', value: 'input' },
    { label: 'Multi Line (textarea)', value: 'textarea' },
  ];

  readonly keyFilterOptions = [
    { label: 'None (allow all)', value: 'none' },
    { label: 'Alphanumeric', value: 'alphanum' },
    { label: 'Letters only', value: 'alpha' },
    { label: 'Numbers only', value: 'num' },
    { label: 'Integers', value: 'int' },
    { label: 'Positive integers', value: 'pint' },
    { label: 'Money format', value: 'money' },
    { label: 'Email format', value: 'email' },
  ];

  readonly autoCompleteOptions = [
    { label: 'Off', value: 'off' },
    { label: 'On', value: 'on' },
  ];

  readonly rowOptions = [
    { label: '2 rows', value: 2 },
    { label: '3 rows', value: 3 },
    { label: '5 rows', value: 5 },
    { label: '8 rows', value: 8 },
    { label: '10 rows', value: 10 },
  ];

  get keyFilterValue(): string | RegExp | null {
    return this.config.keyFilter === 'none' ? null : this.config.keyFilter;
  }

  _previewArr: number[] = [0];
  readonly trackPreview = (_i: number, v: number): number => v;
  private _lastConfigStr = '';

  ngDoCheck(): void {
    const s = JSON.stringify(this.config);
    if (s !== this._lastConfigStr) {
      this._lastConfigStr = s;
      this._previewArr = [this._previewArr[0] + 1];
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = { ...this.defaultConfig, ...this.currentConfig };
      this.previewValue = this.config.defaultValue;
    }
  }

  onClose(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
    this.onClose();
  }

  setAsDefault(): void {
    if (this.previewValue) this.config.defaultValue = this.previewValue;
  }

  clearDefault(): void {
    this.config.defaultValue = '';
    this.previewValue = '';
  }
}
