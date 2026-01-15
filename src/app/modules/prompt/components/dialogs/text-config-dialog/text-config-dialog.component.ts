import {
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
  maxLength: number | null;
}

@Component({
  selector: 'app-text-config-dialog',
  templateUrl: './text-config-dialog.component.html',
  styleUrls: ['./text-config-dialog.component.scss'],
})
export class TextConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<TextConfig> = {};

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<TextConfig>();

  // Configuration options with defaults
  config: TextConfig = {
    placeholder: 'Enter text',
    defaultValue: '',
    maxLength: null,
  };

  // Preview state
  previewValue: string = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.config = {
        placeholder: 'Enter text',
        defaultValue: '',
        maxLength: null,
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
    if (this.previewValue) {
      this.config.defaultValue = this.previewValue;
    }
  }

  clearDefault(): void {
    this.config.defaultValue = '';
    this.previewValue = '';
  }
}
