import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { PROMPT } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { SectionService } from 'src/app/modules/section/services/section.service';
import { PromptService } from '../../services/prompt.service';

@Component({
  selector: 'app-edit-prompt',
  templateUrl: './edit-prompt.component.html',
  styleUrls: ['./edit-prompt.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditPromptComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  promptForm!: FormGroup;
  promptId: string = '';
  selectedDatasourceName: string = '';
  selectedTabName: string = '';
  sectionData: any = null;
  sections: any[] = [];
  preloadedSections: any[] | null = null;
  preloadedSectionsTotal: number | null = null;
  isCancelClicked = false;
  showSaveConfirm = false;
  saveJustification = '';
  saving = this.promptService.saving;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private messageService: MessageService,
    private sectionService: SectionService,
    private promptService: PromptService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.promptId = this.route.snapshot.params['id'];

    if (this.promptId) {
      this.loadPromptData();
    }

    this.promptForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.isCancelClicked) {
          this.isCancelClicked = false;
        }
      });
  }

  get isFormDirty(): boolean {
    return this.promptForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  initForm(): void {
    this.promptForm = this.fb.group({
      id: [''],
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(64),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: [''],
      datasource: [''],
      tab: [''],
      section: ['', Validators.required],
      status: [false],
    });
  }

  loadPromptData(): void {
    this.promptService.resetCurrent();
    this.promptService
      .loadOne(this.promptId)
      .then(() => {
        const data = this.promptService.current();
        if (data) {
          this.sectionData = data;

          this.promptForm.patchValue({
            id: this.sectionData.id,
            name: this.sectionData.name,
            description: this.sectionData.description,
            datasource: this.sectionData.datasourceId,
            tab: this.sectionData.section.tab.id,
            section: this.sectionData.section.id,
            status: this.sectionData.status,
          });

          this.selectedDatasourceName = this.sectionData.datasource?.name || '';
          this.selectedTabName = this.sectionData.section.tab.name || '';
          this.loadSectionData();

          this.promptForm.markAsPristine();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  /**
   * Fetcher for the server-mode section dropdown. Gated on the prompt's
   * tabId (loaded via loadPromptData).
   */
  loadSectionsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const tabId = this.sectionData?.section?.tab?.id;
    if (!tabId) return { items: [], total: 0 };
    const params: any = {
      tabId,
      page,
      limit,
    };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.sectionService.listSection(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.sections ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Resolves the prompt's currently-stored sectionId for label rendering when
   * the value isn't in the first page of fetched sections.
   */
  resolveSelectedSection = async (id: string): Promise<any> => {
    try {
      const res: any = await this.sectionService.viewSection(id);
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  loadSectionData() {
    const param = {
      tabId: this.sectionData.section.tab.id,
      page: DEFAULT_PAGE,
      limit: 10,
    };
    this.sectionService
      .listSection(param)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.sections ?? [];
          this.sections = items;
          this.preloadedSections = items;
          this.preloadedSectionsTotal = response?.data?.count ?? items.length;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  getNameError(): string {
    const control = this.promptForm.get('name');
    if (control?.errors?.['required'])
      return this.translate.instant('PROMPT_MODULE.NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('PROMPT_MODULE.NAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('PROMPT_MODULE.NAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('PROMPT_MODULE.NAME_PATTERN');
    return '';
  }

  onSubmit(): void {
    if (this.promptForm.valid) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      this.promptService
        .update(this.promptForm, this.saveJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.promptForm.markAsPristine();
            this.router.navigate([PROMPT.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.cdr.markForCheck();
        });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      if (!this.sectionData) return;
      // Restore basic form values
      this.promptForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        description: this.sectionData.description,
        section: this.sectionData.section.id,
        datasource: this.sectionData.datasourceId,
        status: this.sectionData.status,
      });

      this.isCancelClicked = true;
      this.promptForm.markAsPristine();
    }
  }
}
