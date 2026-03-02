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
  defaultValues: any[];
  // Layout
  layout: 'horizontal' | 'vertical';
  columns: number;
  gap: 'small' | 'medium' | 'large';
  // Appearance
  labelPosition: 'right' | 'left';
  checkboxIcon: string;
  // Behaviour
  disabled: boolean;
}

@Component({
  selector: 'app-checkbox-config-dialog',
  templateUrl: './checkbox-config-dialog.component.html',
  styleUrls: ['./checkbox-config-dialog.component.scss'],
})
export class CheckboxConfigDialogComponent implements OnChanges, DoCheck {
  @Input() visible = false;
  @Input() promptValues: any[] = [];
  @Input() currentConfig: Partial<CheckboxConfig> = {};

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<CheckboxConfig>();

  readonly defaultConfig: CheckboxConfig = {
    defaultValues: [],
    layout: 'vertical',
    columns: 1,
    gap: 'medium',
    labelPosition: 'right',
    checkboxIcon: 'pi pi-check',
    disabled: false,
  };

  config: CheckboxConfig = { ...this.defaultConfig };
  selectedValues: any[] = [];

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
    { label: 'Right of checkbox', value: 'right' },
    { label: 'Left of checkbox', value: 'left' },
  ];

  readonly gapOptions = [
    { label: 'Small (0.5rem)', value: 'small' },
    { label: 'Medium (1rem)', value: 'medium' },
    { label: 'Large (1.5rem)', value: 'large' },
  ];

  readonly checkboxIconOptions = [
    { label: 'Checkmark (default)', value: 'pi pi-check' },
    { label: 'Times / X', value: 'pi pi-times' },
    { label: 'Minus', value: 'pi pi-minus' },
    { label: 'Star', value: 'pi pi-star' },
    { label: 'Heart', value: 'pi pi-heart' },
    { label: 'Bolt', value: 'pi pi-bolt' },
  ];

  get formattedOptions(): any[] {
    if (!this.promptValues || this.promptValues.length === 0) return [];
    if (typeof this.promptValues[0] === 'object' && this.promptValues[0]?.label) {
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
      // Validate that default values still exist in options
      const validValues = this.formattedOptions.map(o => o.value);
      this.config.defaultValues = (this.config.defaultValues || []).filter(v =>
        validValues.includes(v),
      );
      this.selectedValues = [...this.config.defaultValues];
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
    this.config.defaultValues = [...this.selectedValues];
  }

  clearDefault(): void {
    this.config.defaultValues = [];
    this.selectedValues = [];
  }
}
