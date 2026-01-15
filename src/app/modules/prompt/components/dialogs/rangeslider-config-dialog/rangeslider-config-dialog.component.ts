import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface RangeSliderConfig {
  defaultMin: number;
  defaultMax: number;
  min: number;
  max: number;
  step: number;
  orientation: 'horizontal' | 'vertical';
}

@Component({
  selector: 'app-rangeslider-config-dialog',
  templateUrl: './rangeslider-config-dialog.component.html',
  styleUrls: ['./rangeslider-config-dialog.component.scss'],
})
export class RangeSliderConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<RangeSliderConfig> = {};

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<RangeSliderConfig>();

  // Orientation options
  orientationOptions = [
    { label: 'Horizontal', value: 'horizontal' },
    { label: 'Vertical', value: 'vertical' },
  ];

  // Configuration options with defaults
  config: RangeSliderConfig = {
    defaultMin: 0,
    defaultMax: 100,
    min: 0,
    max: 100,
    step: 1,
    orientation: 'horizontal',
  };

  // Preview state
  previewRange: number[] = [0, 100];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = {
        defaultMin: 0,
        defaultMax: 100,
        min: 0,
        max: 100,
        step: 1,
        orientation: 'horizontal',
        ...this.currentConfig,
      };
      this.previewRange = [this.config.defaultMin, this.config.defaultMax];
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
  }

  setAsDefault(): void {
    if (this.previewRange && this.previewRange.length === 2) {
      this.config.defaultMin = this.previewRange[0];
      this.config.defaultMax = this.previewRange[1];
    }
  }

  resetToDefaults(): void {
    this.config.defaultMin = this.config.min;
    this.config.defaultMax = this.config.max;
    this.previewRange = [this.config.min, this.config.max];
  }
}
