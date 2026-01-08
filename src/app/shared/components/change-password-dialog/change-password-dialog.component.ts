import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  Input,
  HostListener,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-change-password-dialog',
  templateUrl: './change-password-dialog.component.html',
  styleUrls: ['./change-password-dialog.component.scss'],
})
export class ChangePasswordDialogComponent implements OnInit {
  @Input() visible = false;
  @Output() close = new EventEmitter<string | null>();

  passwordForm!: FormGroup;
  showNewPassword = false;
  showConfirmPassword = false;
  users: any[] = [];

  constructor(private fb: FormBuilder) {}

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (this.visible) {
      this.onCancel();
    }
  }

  ngOnInit() {
    this.initForm();
  }

  initForm() {
    this.passwordForm = this.fb.group(
      {
        newPassword: [
          '',
          [
            Validators.required,
            Validators.pattern(
              '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'
            ),
          ],
        ],
        confirmPassword: ['', Validators.required],
      },
      { validator: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  togglePassword(field: 'new' | 'confirm') {
    if (field === 'new') {
      this.showNewPassword = !this.showNewPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  canSubmit(): boolean {
    return (
      !this.passwordForm.invalid &&
      !this.passwordForm.hasError('mismatch') &&
      this.users.length > 1
    );
  }

  onSubmit() {
    if (this.canSubmit()) {
      if (this.passwordForm.valid) {
        this.close.emit(this.passwordForm.get('newPassword')?.value);
      }
    }
  }

  onCancel() {
    this.passwordForm.reset();
    this.showNewPassword = false;
    this.showConfirmPassword = false;
    this.visible = false;
    this.close.emit(null);
  }

  onBackdropClick(event: Event) {
    if (
      (event.target as HTMLElement).classList.contains('change-password-popup')
    ) {
      this.onCancel();
    }
  }
}
