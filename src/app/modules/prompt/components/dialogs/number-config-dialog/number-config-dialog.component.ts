import {
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
  min: number | null;
  max: number | null;
  step: number;
  showButtons: boolean;
}

@Component({
  selector: 'app-number-config-dialog',
  templateUrl: './number-config-dialog.component.html',
  styleUrls: ['./number-config-dialog.component.scss'],
})
export class NumberConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<NumberConfig> = {};

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<NumberConfig>();

  // Configuration options with defaults
  config: NumberConfig = {
    placeholder: 'Enter number',
    defaultValue: null,
    min: null,
    max: null,
    step: 1,
    showButtons: true,
  };

  // Preview state
  previewValue: number | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = {
        placeholder: 'Enter number',
        defaultValue: null,
        min: null,
        max: null,
        step: 1,
        showButtons: true,
        ...this.currentConfig,
      };
      this.previewValue = this.config.defaultValue;
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
  }

  setAsDefault(): void {
    if (this.previewValue !== null) {
      this.config.defaultValue = this.previewValue;
    }
  }

  clearDefault(): void {
    this.config.defaultValue = null;
    this.previewValue = null;
  }
}
