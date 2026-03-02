import {
  Component,
  DoCheck,
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
  // Values
  trueValue: any;
  falseValue: any;
  // Layout
  labelPosition: 'right' | 'left';
  // Appearance
  checkboxIcon: string;
  disabled: boolean;
}

@Component({
  selector: 'app-checkbox-config-dialog',
  templateUrl: './checkbox-config-dialog.component.html',
  styleUrls: ['./checkbox-config-dialog.component.scss'],
})
export class CheckboxConfigDialogComponent implements OnChanges, DoCheck {
  @Input() visible = false;
  @Input() currentConfig: Partial<CheckboxConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<CheckboxConfig>();

  readonly defaultConfig: CheckboxConfig = {
    label: '',
    defaultChecked: false,
    binary: true,
    trueValue: true,
    falseValue: false,
    labelPosition: 'right',
    checkboxIcon: 'pi pi-check',
    disabled: false,
  };

  config: CheckboxConfig = { ...this.defaultConfig };
  previewChecked: boolean = false;

  readonly labelPositionOptions = [
    { label: 'Right of checkbox', value: 'right' },
    { label: 'Left of checkbox', value: 'left' },
  ];

  readonly checkboxIconOptions = [
    { label: 'Checkmark (default)', value: 'pi pi-check' },
    { label: 'Times / X', value: 'pi pi-times' },
    { label: 'Minus', value: 'pi pi-minus' },
    { label: 'Star', value: 'pi pi-star' },
    { label: 'Heart', value: 'pi pi-heart' },
    { label: 'Bolt', value: 'pi pi-bolt' },
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
      this.previewChecked = this.config.defaultChecked;
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

  onDefaultCheckedChange(val: boolean): void {
    this.config.defaultChecked = val;
  }
}
