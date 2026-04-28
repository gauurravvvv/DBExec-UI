import {
  ChangeDetectionStrategy,
  Component,
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
  disabled: boolean;
  readonly: boolean;
  trim: boolean;
  // Textarea-specific
  rows: number;
  autoResize: boolean;
}

@Component({
  selector: 'app-text-config-dialog',
  templateUrl: './text-config-dialog.component.html',
  styleUrls: ['./text-config-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextConfigDialogComponent implements OnChanges {
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
    disabled: false,
    readonly: false,
    trim: false,
    rows: 3,
    autoResize: true,
  };

  config: TextConfig = { ...this.defaultConfig };
  previewConfig: TextConfig = { ...this.defaultConfig };
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

  readonly rowOptions = [
    { label: '2 rows', value: 2 },
    { label: '3 rows', value: 3 },
    { label: '5 rows', value: 5 },
    { label: '8 rows', value: 8 },
    { label: '10 rows', value: 10 },
  ];

  _previewArr: number[] = [0];
  readonly trackPreview = (_i: number, v: number): number => v;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = { ...this.defaultConfig, ...this.currentConfig };
      this.previewValue = this.config.defaultValue;
      this.previewConfig = { ...this.config };
      this._previewArr = [this._previewArr[0] + 1];
    }
  }

  applyPreview(): void {
    this.previewConfig = { ...this.config };
    this._previewArr = [this._previewArr[0] + 1];
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

  onPreviewBlur(): void {
    if (this.previewConfig.trim && this.previewValue) {
      this.previewValue = this.previewValue.trim();
    }
  }
}
