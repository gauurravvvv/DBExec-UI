import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { ANNOUNCEMENT } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import {
  AnnouncementService,
  UpdateAnnouncementPayload,
} from '../../services/announcement.service';

@Component({
  selector: 'app-edit-announcement',
  templateUrl: './edit-announcement.component.html',
  styleUrls: ['./edit-announcement.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditAnnouncementComponent implements OnInit, HasUnsavedChanges {
  announcementForm!: FormGroup;
  groups: any[] = [];
  orgId = '';
  announcementId = '';
  orgName = '';
  maxDescriptionLength = 1000;
  minDate = new Date();
  showPreview = false;
  initialStatus = 1;
  readonly minContrastRatio = 4.5;

  saving = this.announcementService.saving;
  loading = this.announcementService.loading;

  private destroyRef = inject(DestroyRef);

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private announcementService: AnnouncementService,
    private groupService: GroupService,
    private cdr: ChangeDetectorRef,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.announcementForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.orgId = this.route.snapshot.paramMap.get('orgId') || '';
    this.announcementId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.orgId || !this.announcementId) {
      this.router.navigate([ANNOUNCEMENT.LIST]);
      return;
    }
    this.loadGroups();
    this.loadAnnouncement();
  }

  initForm(): void {
    this.announcementForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.maxLength(255)]],
        description: [
          '',
          [
            Validators.required,
            Validators.maxLength(this.maxDescriptionLength),
          ],
        ],
        targetGroupId: [null, Validators.required],
        bgColor: ['#0d47a1'],
        textColor: ['#ffffff'],
        status: [1],
        startTime: [null],
        endTime: [null],
        republish: [false],
      },
      { validators: this.dateRangeValidator },
    );
  }

  dateRangeValidator(group: AbstractControl): ValidationErrors | null {
    const start = group.get('startTime')?.value;
    const end = group.get('endTime')?.value;
    if (start && end && new Date(end) <= new Date(start)) {
      return { dateRange: true };
    }
    return null;
  }

  loadGroups(): void {
    this.groupService
      .listGroups({ orgId: this.orgId, page: DEFAULT_PAGE, limit: MAX_LIMIT })
      .then(res => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.groups = res.data.groups || [];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadAnnouncement(): void {
    this.announcementService.resetCurrent();
    this.announcementService
      .loadOne(this.announcementId, this.orgId)
      .then(() => {
        const data = this.announcementService.current();
        if (data) {
          this.orgName = data.organisationName || '';
          this.initialStatus = data.status;
          this.announcementForm.patchValue({
            name: data.name,
            description: data.description,
            targetGroupId: data.targetGroupId,
            bgColor: data.bgColor || '#0d47a1',
            textColor: data.textColor || '#ffffff',
            status: data.status,
            startTime: data.startTime ? new Date(data.startTime) : null,
            endTime: data.endTime ? new Date(data.endTime) : null,
          });
          this.announcementForm.markAsPristine();
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  private luminance(hex: string): number {
    const h = hex.replace('#', '');
    const full =
      h.length === 3
        ? h
            .split('')
            .map(c => c + c)
            .join('')
        : h;
    const r = parseInt(full.substring(0, 2), 16) / 255;
    const g = parseInt(full.substring(2, 4), 16) / 255;
    const b = parseInt(full.substring(4, 6), 16) / 255;
    const ch = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }

  get contrastRatio(): number {
    const bg = this.announcementForm.get('bgColor')?.value;
    const fg = this.announcementForm.get('textColor')?.value;
    if (!bg || !fg) return 21;
    try {
      const l1 = this.luminance(bg);
      const l2 = this.luminance(fg);
      const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
      return (light + 0.05) / (dark + 0.05);
    } catch {
      return 21;
    }
  }

  get hasLowContrast(): boolean {
    return this.contrastRatio < this.minContrastRatio;
  }

  get contrastQuality(): {
    level: 'poor' | 'needs-work' | 'good' | 'excellent';
    label: string;
    hint: string;
    percent: number;
  } {
    const r = this.contrastRatio;
    if (r < 3) {
      return {
        level: 'poor',
        label: 'Hard to read',
        hint: 'Most people will struggle to read this. Pick colors that are more different from each other.',
        percent: 20,
      };
    }
    if (r < this.minContrastRatio) {
      return {
        level: 'needs-work',
        label: 'Needs improvement',
        hint: 'Almost there — try a darker background or lighter text to make it easier on the eyes.',
        percent: 45,
      };
    }
    if (r < 7) {
      return {
        level: 'good',
        label: 'Good readability',
        hint: 'This works well for most users.',
        percent: 75,
      };
    }
    return {
      level: 'excellent',
      label: 'Excellent readability',
      hint: 'Crystal clear — easy to read in any lighting.',
      percent: 100,
    };
  }

  get descriptionLength(): number {
    return this.announcementForm.get('description')?.value?.length || 0;
  }

  get startTimeMinDate(): Date {
    return this.minDate;
  }

  get endTimeMinDate(): Date {
    return this.announcementForm.get('startTime')?.value || this.minDate;
  }

  canSubmit(): boolean {
    return (
      this.announcementForm.valid &&
      !this.hasLowContrast &&
      !this.saving() &&
      this.isFormDirty
    );
  }

  onStatusToggle(): void {
    // Auto-republish when flipping from inactive back to active
    if (
      this.announcementForm.get('status')?.value === 1 &&
      this.initialStatus === 0
    ) {
      this.announcementForm.patchValue({ republish: true });
    }
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;
    const value = this.announcementForm.value;
    const payload: UpdateAnnouncementPayload = {
      name: value.name,
      description: value.description,
      targetGroupId: value.targetGroupId,
      startTime: value.startTime || null,
      endTime: value.endTime || null,
      bgColor: value.bgColor,
      textColor: value.textColor,
      status: value.status,
      republish: value.republish,
      orgId: this.orgId,
    };

    this.announcementService
      .update(this.announcementId, payload)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.announcementForm.markAsPristine();
          this.router.navigate([ANNOUNCEMENT.LIST]);
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  onCancel(): void {
    this.router.navigate([ANNOUNCEMENT.LIST]);
  }

  getNameError(): string {
    const c = this.announcementForm.get('name');
    if (c?.errors?.['required']) return 'Title is required';
    if (c?.errors?.['maxlength']) return 'Title must not exceed 255 characters';
    return '';
  }

  getDescriptionError(): string {
    const c = this.announcementForm.get('description');
    if (c?.errors?.['required']) return 'Description is required';
    if (c?.errors?.['maxlength'])
      return `Description must not exceed ${this.maxDescriptionLength} characters`;
    return '';
  }
}
