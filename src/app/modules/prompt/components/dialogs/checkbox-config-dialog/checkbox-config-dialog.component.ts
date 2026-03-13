import {
  Component,
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
export class CheckboxConfigDialogComponent implements OnChanges {
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
  previewConfig: CheckboxConfig = { ...this.defaultConfig };
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

  formattedOptions: any[] = [];

  get previewGridStyle(): any {
    const gapMap = { small: '0.5rem', medium: '1rem', large: '1.5rem' };
    if (this.previewConfig.layout === 'horizontal') {
      return {
        display: 'flex',
        flexWrap: 'wrap',
        gap: gapMap[this.previewConfig.gap],
        flexDirection: 'row',
      };
    }
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${this.previewConfig.columns}, 1fr)`,
      gap: gapMap[this.previewConfig.gap],
    };
  }

  _previewArr: number[] = [0];
  readonly trackPreview = (_i: number, v: number): number => v;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['promptValues']) {
      this.updateFormattedOptions();
    }
    if (changes['visible'] && this.visible) {
      this.updateFormattedOptions();
      this.config = { ...this.defaultConfig, ...this.currentConfig };
      // Validate that default values still exist in options
      const validValues = this.formattedOptions.map(o => o.value);
      this.config.defaultValues = (this.config.defaultValues || []).filter(v =>
        validValues.includes(v),
      );
      this.selectedValues = [...this.config.defaultValues];
      this.previewConfig = { ...this.config };
      this._previewArr = [this._previewArr[0] + 1];
    }
  }

  private updateFormattedOptions(): void {
    if (!this.promptValues || this.promptValues.length === 0) {
      this.formattedOptions = [];
      return;
    }
    if (typeof this.promptValues[0] === 'object' && this.promptValues[0]?.label) {
      this.formattedOptions = this.promptValues;
      return;
    }
    this.formattedOptions = this.promptValues.map(val => ({ label: String(val), value: val }));
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
    this.config.defaultValues = [...this.selectedValues];
  }

  clearDefault(): void {
    this.config.defaultValues = [];
    this.selectedValues = [];
  }
}
