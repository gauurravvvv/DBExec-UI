import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { GlobalService } from 'src/app/core/services/global.service';
import { AnnouncementService } from '../../services/announcement.service';

export interface AnnouncementData {
  name: string;
  description: string;
  startTime: Date;
  endTime: Date;
  bgColor: string;
  textColor: string;
}

@Component({
  selector: 'app-announcement-dialog',
  templateUrl: './announcement-dialog.component.html',
  styleUrls: ['./announcement-dialog.component.scss'],
})
export class AnnouncementDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() organisationId!: number;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() save = new EventEmitter<AnnouncementData>();

  announcementForm: FormGroup;
  minDate = new Date();
  maxDescriptionLength = 1000;

  constructor(
    private fb: FormBuilder,
    private announcementService: AnnouncementService,
    private globalService: GlobalService,
  ) {
    this.announcementForm = this.fb.group({
      name: ['', Validators.required],
      description: ['', [Validators.required, Validators.maxLength(1000)]],
      startTime: [null, Validators.required],
      endTime: [null, Validators.required],
      bgColor: ['#0d47a1'],
      textColor: ['#ffffff'],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible && this.organisationId) {
      this.loadAnnouncement();
    }
  }

  private loadAnnouncement(): void {
    this.announcementService
      .getAnnouncement(this.organisationId.toString())
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const data = response.data;
          if (data) {
            this.announcementForm.patchValue({
              name: data.name || '',
              description: data.description || '',
              startTime: data.startTime ? new Date(data.startTime) : null,
              endTime: data.endTime ? new Date(data.endTime) : null,
              bgColor: data.bgColor || '#0d47a1',
              textColor: data.textColor || '#ffffff',
            });
          }
        }
      });
  }

  get descriptionLength(): number {
    return this.announcementForm.get('description')?.value?.length || 0;
  }

  get isFormValid(): boolean {
    return this.announcementForm.valid;
  }

  get startTimeMinDate(): Date {
    return this.minDate;
  }

  get endTimeMinDate(): Date {
    return this.announcementForm.get('startTime')?.value || this.minDate;
  }

  onSave(): void {
    if (this.isFormValid) {
      this.save.emit(this.announcementForm.value);
      this.announcementForm.reset();
      this.closeDialog();
    }
  }

  onCancel(): void {
    this.announcementForm.reset();
    this.closeDialog();
  }

  private closeDialog(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }
}
