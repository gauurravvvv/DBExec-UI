import {
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface NumberConfig {
  placeholder: string;
  defaultValue: number | null;
  // Range
  min: number | null;
  max: number | null;
  step: number;
  // Buttons
  showButtons: boolean;
  buttonLayout: 'stacked' | 'horizontal' | 'vertical';
  // Format
  useLocale: boolean;
  mode: 'decimal' | 'currency';
  currency: string;
  locale: string;
  minFractionDigits: number;
  maxFractionDigits: number;
  prefix: string;
  suffix: string;
  // Behaviour
  allowEmpty: boolean;
  readonly: boolean;
}

@Component({
  selector: 'app-number-config-dialog',
  templateUrl: './number-config-dialog.component.html',
  styleUrls: ['./number-config-dialog.component.scss'],
})
export class NumberConfigDialogComponent implements OnChanges, DoCheck {
  @Input() visible = false;
  @Input() currentConfig: Partial<NumberConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<NumberConfig>();

  readonly defaultConfig: NumberConfig = {
    placeholder: 'Enter number',
    defaultValue: null,
    min: null,
    max: null,
    step: 1,
    showButtons: true,
    buttonLayout: 'horizontal',
    useLocale: false,
    mode: 'decimal',
    currency: 'USD',
    locale: 'en-US',
    minFractionDigits: 0,
    maxFractionDigits: 2,
    prefix: '',
    suffix: '',
    allowEmpty: true,
    readonly: false,
  };

  config: NumberConfig = { ...this.defaultConfig };
  previewValue: number | null = null;

  readonly buttonLayoutOptions = [
    { label: 'Horizontal (- value +)', value: 'horizontal' },
    { label: 'Stacked (+ above -)', value: 'stacked' },
    { label: 'Vertical', value: 'vertical' },
  ];

  readonly modeOptions = [
    { label: 'Decimal', value: 'decimal' },
    { label: 'Currency', value: 'currency' },
  ];

  readonly currencyOptions = [
    { label: 'USD ($)', value: 'USD' },
    { label: 'EUR (€)', value: 'EUR' },
    { label: 'GBP (£)', value: 'GBP' },
    { label: 'JPY (¥)', value: 'JPY' },
    { label: 'INR (₹)', value: 'INR' },
  ];

  readonly localeOptions = [
    { label: 'en-US (1,234.56)', value: 'en-US' },
    { label: 'de-DE (1.234,56)', value: 'de-DE' },
    { label: 'fr-FR (1 234,56)', value: 'fr-FR' },
    { label: 'ja-JP (1,234)', value: 'ja-JP' },
    { label: 'en-IN (1,23,456)', value: 'en-IN' },
  ];

  readonly fractionOptions = [
    { label: '0', value: 0 },
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
  ];

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

  onModeChange(): void {
    if (this.config.mode === 'currency') {
      this.config.useLocale = true;
    }
  }

  setAsDefault(): void {
    if (this.previewValue !== null)
      this.config.defaultValue = this.previewValue;
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.previewValue = null;
  }
}
