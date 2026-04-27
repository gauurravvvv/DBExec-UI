import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { ANNOUNCEMENT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import {
  AnnouncementPayload,
  AnnouncementService,
} from '../../services/announcement.service';

@Component({
  selector: 'app-add-announcement',
  templateUrl: './add-announcement.component.html',
  styleUrls: ['./add-announcement.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddAnnouncementComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);

  announcementForm!: FormGroup;
  organisations: any[] = [];
  groups: any[] = [];
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  maxDescriptionLength = 1000;
  minDate = new Date();
  showPreview = false;
  readonly minContrastRatio = 4.5;

  saving = this.announcementService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private announcementService: AnnouncementService,
    private organisationService: OrganisationService,
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
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.loadGroups();
    }
  }

  initForm(): void {
    this.announcementForm = this.fb.group(
      {
        name: [
          '',
          [
            Validators.required,
            Validators.minLength(1),
            Validators.maxLength(255),
          ],
        ],
        description: [
          '',
          [
            Validators.required,
            Validators.maxLength(this.maxDescriptionLength),
          ],
        ],
        organisation: [
          this.showOrganisationDropdown
            ? ''
            : this.globalService.getTokenDetails('organisationId'),
          Validators.required,
        ],
        targetGroupId: [null, Validators.required],
        bgColor: ['#0d47a1'],
        textColor: ['#ffffff'],
        startTime: [null],
        endTime: [null],
      },
      { validators: this.dateRangeValidator },
    );

    this.announcementForm
      .get('organisation')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.announcementForm.patchValue(
          { targetGroupId: null },
          { emitEvent: false },
        );
        this.groups = [];
        if (value) this.loadGroups();
      });
  }

  dateRangeValidator(group: AbstractControl): ValidationErrors | null {
    const start = group.get('startTime')?.value;
    const end = group.get('endTime')?.value;
    if (start && end && new Date(end) <= new Date(start)) {
      return { dateRange: true };
    }
    return null;
  }

  loadOrganisations(): void {
    const params = { page: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.organisationService
      .listOrganisation(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.organisations = response.data.orgs || [];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadGroups(): void {
    const orgId = this.announcementForm.get('organisation')?.value;
    if (!orgId) return;
    this.groupService
      .listGroups({ orgId, page: DEFAULT_PAGE, limit: MAX_LIMIT })
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

  // sRGB relative luminance per WCAG
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
      this.announcementForm.valid && !this.hasLowContrast && !this.saving()
    );
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;
    const value = this.announcementForm.value;
    const payload: AnnouncementPayload = {
      name: value.name,
      description: value.description,
      targetGroupId: value.targetGroupId,
      startTime: value.startTime || null,
      endTime: value.endTime || null,
      bgColor: value.bgColor,
      textColor: value.textColor,
      status: 1,
      orgId: value.organisation,
    };

    this.announcementService
      .add(payload)
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
