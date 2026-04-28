import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface RangeSliderConfig {
  // Range bounds
  min: number;
  max: number;
  step: number;
  // Default selection
  defaultMin: number;
  defaultMax: number;
  // Display
  orientation: 'horizontal' | 'vertical';
  animate: boolean;
  disabled: boolean;
  // Labels
  showValueLabels: boolean;
  showBoundLabels: boolean;
}

@Component({
  selector: 'app-rangeslider-config-dialog',
  templateUrl: './rangeslider-config-dialog.component.html',
  styleUrls: ['./rangeslider-config-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RangeSliderConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<RangeSliderConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<RangeSliderConfig>();

  readonly defaultConfig: RangeSliderConfig = {
    min: 0,
    max: 100,
    step: 1,
    defaultMin: 0,
    defaultMax: 100,
    orientation: 'horizontal',
    animate: false,
    disabled: false,
    showValueLabels: true,
    showBoundLabels: false,
  };

  config: RangeSliderConfig = { ...this.defaultConfig };
  previewConfig: RangeSliderConfig = { ...this.defaultConfig };
  previewRange: number[] = [0, 100];

  readonly orientationOptions = [
    { label: 'Horizontal', value: 'horizontal' },
    { label: 'Vertical', value: 'vertical' },
  ];

  readonly stepOptions = [
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '5', value: 5 },
    { label: '10', value: 10 },
    { label: '25', value: 25 },
    { label: '50', value: 50 },
    { label: '100', value: 100 },
  ];

  _previewArr: number[] = [0];
  readonly trackPreview = (_i: number, v: number): number => v;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = { ...this.defaultConfig, ...this.currentConfig };
      this.previewConfig = { ...this.config };
      this._previewArr = [this._previewArr[0] + 1];
      this.previewRange = [this.config.defaultMin, this.config.defaultMax];
    }
  }

  applyPreview(): void {
    this.previewConfig = { ...this.config };
    this.previewRange = [this.config.defaultMin, this.config.defaultMax];
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
    if (this.previewRange?.length === 2) {
      this.config.defaultMin = this.previewRange[0];
      this.config.defaultMax = this.previewRange[1];
    }
  }

  resetToDefaults(): void {
    this.config.defaultMin = this.config.min;
    this.config.defaultMax = this.config.max;
    this.previewRange = [this.config.min, this.config.max];
  }

  onBoundsChange(): void {
    // Clamp preview range within new bounds
    this.previewRange = [
      Math.max(
        this.config.min,
        Math.min(this.previewRange[0], this.config.max),
      ),
      Math.min(
        this.config.max,
        Math.max(this.previewRange[1], this.config.min),
      ),
    ];
  }
}
