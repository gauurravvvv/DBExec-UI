import {
  Component,
  DoCheck,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface RadioConfig {
  defaultValue: string | null;
  layout: 'horizontal' | 'vertical';
  columns: number;
  labelPosition: 'right' | 'left';
  gap: 'small' | 'medium' | 'large';
}

@Component({
  selector: 'app-radio-config-dialog',
  templateUrl: './radio-config-dialog.component.html',
  styleUrls: ['./radio-config-dialog.component.scss'],
})
export class RadioConfigDialogComponent implements OnChanges, DoCheck {
  @Input() visible = false;
  @Input() promptValues: any[] = [];
  @Input() currentConfig: Partial<RadioConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<RadioConfig>();

  readonly defaultConfig: RadioConfig = {
    defaultValue: null,
    layout: 'vertical',
    columns: 1,
    labelPosition: 'right',
    gap: 'medium',
  };

  config: RadioConfig = { ...this.defaultConfig };
  selectedValue: any = null;

  readonly layoutOptions = [
    { label: 'Vertical (stacked)', value: 'vertical' },
    { label: 'Horizontal (row)', value: 'horizontal' },
  ];

  readonly columnOptions = [
    { label: '1 Column', value: 1 },
    { label: '2 Columns', value: 2 },
    { label: '3 Columns', value: 3 },
    { label: '4 Columns', value: 4 },
  ];

  readonly labelPositionOptions = [
    { label: 'Right of button', value: 'right' },
    { label: 'Left of button', value: 'left' },
  ];

  readonly gapOptions = [
    { label: 'Small (0.5rem)', value: 'small' },
    { label: 'Medium (1rem)', value: 'medium' },
    { label: 'Large (1.5rem)', value: 'large' },
  ];

  get formattedOptions(): any[] {
    if (!this.promptValues || this.promptValues.length === 0) return [];
    if (
      typeof this.promptValues[0] === 'object' &&
      this.promptValues[0]?.label
    ) {
      return this.promptValues;
    }
    return this.promptValues.map(val => ({ label: String(val), value: val }));
  }

  get previewGridStyle(): any {
    const gapMap = { small: '0.5rem', medium: '1rem', large: '1.5rem' };
    if (this.config.layout === 'horizontal') {
      return {
        display: 'flex',
        flexWrap: 'wrap',
        gap: gapMap[this.config.gap],
        flexDirection: 'row',
      };
    }
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${this.config.columns}, 1fr)`,
      gap: gapMap[this.config.gap],
    };
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
      this.selectedValue = this.config.defaultValue;
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
    if (this.selectedValue != null)
      this.config.defaultValue = this.selectedValue;
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.selectedValue = null;
  }
}
