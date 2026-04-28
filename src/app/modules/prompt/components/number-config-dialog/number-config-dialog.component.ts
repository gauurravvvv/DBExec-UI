import {
  ChangeDetectionStrategy,
  Component,
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
  // Format
  prefix: string;
  suffix: string;
  // Behaviour
  disabled: boolean;
  readonly: boolean;
}

@Component({
  selector: 'app-number-config-dialog',
  templateUrl: './number-config-dialog.component.html',
  styleUrls: ['./number-config-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NumberConfigDialogComponent implements OnChanges {
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
    prefix: '',
    suffix: '',
    disabled: false,
    readonly: false,
  };

  config: NumberConfig = { ...this.defaultConfig };
  previewConfig: NumberConfig = { ...this.defaultConfig };
  previewValue: number | null = null;

  _previewArr: number[] = [0];
  readonly trackPreview = (_i: number, v: number): number => v;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = { ...this.defaultConfig, ...this.currentConfig };
      this.previewConfig = { ...this.config };
      this._previewArr = [this._previewArr[0] + 1];
      this.previewValue = this.config.defaultValue;
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
    if (this.previewValue !== null)
      this.config.defaultValue = this.previewValue;
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.previewValue = null;
  }
}
