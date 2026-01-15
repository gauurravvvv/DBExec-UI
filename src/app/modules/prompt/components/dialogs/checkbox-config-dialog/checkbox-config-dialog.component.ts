import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

export interface CheckboxConfig {
  label: string;
  defaultChecked: boolean;
  binary: boolean;
}

@Component({
  selector: 'app-checkbox-config-dialog',
  templateUrl: './checkbox-config-dialog.component.html',
  styleUrls: ['./checkbox-config-dialog.component.scss'],
})
export class CheckboxConfigDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() currentConfig: Partial<CheckboxConfig> = {};

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<CheckboxConfig>();

  // Configuration options with defaults
  config: CheckboxConfig = {
    label: '',
    defaultChecked: false,
    binary: true,
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      // Reset config to defaults merged with current config
      this.config = {
        label: '',
        defaultChecked: false,
        binary: true,
        ...this.currentConfig,
      };
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onSave(): void {
    this.save.emit({ ...this.config });
  }
}
