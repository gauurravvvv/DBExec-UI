import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { GlobalService } from 'src/app/core/services/global.service';
import { ScreenService } from '../../services/screen.service';
import {
  ExecuteTab,
  ExecuteSection,
  ExecutePrompt,
  SubmissionPayload,
  transformTabResponse,
  transformSectionResponse,
  transformPromptResponse,
  TabApiResponse,
  SectionApiResponse,
  PromptApiResponse,
} from './models/execute-screen.models';
import {
  createPromptFormControl,
  markAllAsTouched,
} from './helpers/form.helper';
import {
  createPromptSubmission,
  transformValuesToOptions,
} from './helpers/prompt-renderer.helper';

@Component({
  selector: 'app-execute-screen',
  templateUrl: './execute-screen.component.html',
  styleUrls: ['./execute-screen.component.scss'],
})
export class ExecuteScreenComponent implements OnInit, OnDestroy {
  // Route params
  orgId: string = '';
  databaseId: string = '';
  screenId: string = '';
  screenName: string = '';

  // Data
  tabs: ExecuteTab[] = [];
  activeTabIndex = 0;

  // Loading states
  loadingTabs = true;
  tabError: string | null = null;

  // Form
  promptForm!: FormGroup;

  // Submission
  isSubmitting = false;
  submitError: string | null = null;

  // Cleanup
  private destroy$ = new Subject<void>();

  // Skeleton counts for loading display
  readonly SKELETON_TAB_COUNT = 3;
  readonly SKELETON_SECTION_COUNT = 3;
  readonly SKELETON_PROMPT_COUNT = 4;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private globalService: GlobalService,
    private screenService: ScreenService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadRouteParams();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize empty form group
   */
  private initForm(): void {
    this.promptForm = this.fb.group({});
  }

  /**
   * Extract route parameters and load tabs
   */
  private loadRouteParams(): void {
    this.orgId = this.route.snapshot.paramMap.get('orgId') || '';
    this.databaseId = this.route.snapshot.paramMap.get('dbId') || '';
    this.screenId = this.route.snapshot.paramMap.get('screenId') || '';

    if (this.screenId) {
      this.loadTabs();
    } else {
      this.tabError = 'Invalid screen ID';
      this.loadingTabs = false;
    }
  }

  /**
   * Load screen tabs from API
   */
  loadTabs(): void {
    this.loadingTabs = true;
    this.tabError = null;

    // TODO: Replace with actual API call
    // this.screenService.getScreenTabs(this.orgId, this.databaseId, this.screenId)
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe({...});

    // Mock data - Multiple tabs for testing
    setTimeout(() => {
      const mockTabs: TabApiResponse[] = [
        {
          id: 1,
          name: 'General Info',
          description: 'General information tab',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'generalInfoTabControl',
          sequence: 1,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 1,
        },
        {
          id: 2,
          name: 'Filters',
          description: 'Filter options',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'filtersTabControl',
          sequence: 2,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 2,
        },
        {
          id: 3,
          name: 'Date Range',
          description: 'Date range selection',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'dateRangeTabControl',
          sequence: 3,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 3,
        },
        {
          id: 4,
          name: 'Advanced Options',
          description: 'Advanced options',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'advancedTabControl',
          sequence: 4,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 4,
        },
        {
          id: 5,
          name: 'Report Settings',
          description: 'Configure report settings',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'reportSettingsTabControl',
          sequence: 5,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 5,
        },
        {
          id: 6,
          name: 'Export Options',
          description: 'Export configuration',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'exportOptionsTabControl',
          sequence: 6,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 6,
        },
        {
          id: 7,
          name: 'Notifications',
          description: 'Notification settings',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'notificationsTabControl',
          sequence: 7,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 7,
        },
        {
          id: 8,
          name: 'Schedule',
          description: 'Schedule options',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'scheduleTabControl',
          sequence: 8,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 8,
        },
        {
          id: 9,
          name: 'Schyguijedule',
          description: 'Schedule options',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'scheduleTabControl',
          sequence: 8,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 8,
        },
        {
          id: 10,
          name: 'Screrrhedule',
          description: 'Schedule options',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'scheduleTabControl',
          sequence: 8,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 8,
        },
        {
          id: 11,
          name: 'Schedasdasdadule',
          description: 'Schedule options',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'scheduleTabControl',
          sequence: 8,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 8,
        },
        {
          id: 12,
          name: 'Schesaddule',
          description: 'Schedule options',
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          tabControlName: 'scheduleTabControl',
          sequence: 8,
          status: 1,
          createdOn: '2025-12-29T13:26:29.918Z',
          tabSequence: 8,
        },
      ];

      this.tabs = mockTabs.map(transformTabResponse);
      this.loadingTabs = false;

      // Auto-load sections for first tab
      if (this.tabs.length > 0) {
        this.loadSections(this.tabs[0]);
      }
    }, 1000);
  }

  /**
   * Load sections for a tab
   */
  loadSections(tab: ExecuteTab): void {
    if (tab.loaded || tab.loading) return;

    tab.loading = true;
    tab.error = null;

    // TODO: Replace with actual API call
    // this.screenService.getTabSections(this.orgId, tab.id)
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe({...});

    // Mock data - Multiple sections per tab
    setTimeout(() => {
      const mockSections: SectionApiResponse[] = [
        {
          id: tab.id * 100 + 1,
          name: 'Basic Information',
          description: 'Enter basic information',
          tabId: tab.id,
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          status: 1,
          sequence: 1,
          createdOn: '2025-12-29T13:26:47.974Z',
          sectionControlName: 'basicInfoSection',
          sectionSequence: 1,
        },
        {
          id: tab.id * 100 + 2,
          name: 'Additional Details',
          description: 'Provide additional details',
          tabId: tab.id,
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          status: 1,
          sequence: 2,
          createdOn: '2025-12-29T13:26:47.974Z',
          sectionControlName: 'additionalDetailsSection',
          sectionSequence: 2,
        },
        {
          id: tab.id * 100 + 3,
          name: 'Configuration Options',
          description: 'Configure options for this section',
          tabId: tab.id,
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          status: 1,
          sequence: 3,
          createdOn: '2025-12-29T13:26:47.974Z',
          sectionControlName: 'configOptionsSection',
          sectionSequence: 3,
        },
      ];

      tab.sections = mockSections.map(transformSectionResponse);
      tab.loaded = true;
      tab.loading = false;

      // Auto-expand first section
      if (tab.sections.length > 0) {
        tab.sections[0].expanded = true;
      }
    }, 800);
  }

  /**
   * Load prompts for a section
   */
  loadPrompts(section: ExecuteSection): void {
    if (section.loaded || section.loading) return;

    section.loading = true;
    section.error = null;

    // TODO: Replace with actual API call
    // this.screenService.getSectionPrompts(this.orgId, section.id)
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe({...});

    // Mock data for now
    setTimeout(() => {
      const mockPrompts: PromptApiResponse[] = [
        {
          id: 1,
          name: 'Date Input',
          description: 'Select a date',
          sectionId: section.id,
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          status: 1,
          type: 'date',
          validation: null,
          mandatory: 1,
          isGroup: false,
          groupId: null,
          promptControlName: 'dateInputControl',
          sequence: 1,
          createdOn: '2025-12-31T07:23:41.605Z',
          promptSequence: 0,
          values: [],
        },
        {
          id: 2,
          name: 'Department',
          description: 'Select department',
          sectionId: section.id,
          organisationId: 2,
          organisationName: 'OrgOne',
          databaseId: 3,
          databaseName: 'FirstDB',
          status: 1,
          type: 'dropdown',
          validation: null,
          mandatory: 0,
          isGroup: false,
          groupId: null,
          promptControlName: 'departmentControl',
          sequence: 2,
          createdOn: '2025-12-31T07:23:41.605Z',
          promptSequence: 1,
          values: [
            { id: 14, promptId: 2, value: 'Engineering' },
            { id: 15, promptId: 2, value: 'HR' },
            { id: 16, promptId: 2, value: 'Finance' },
            { id: 17, promptId: 2, value: 'Marketing' },
          ],
        },
      ];

      section.prompts = mockPrompts.map(transformPromptResponse);
      section.loaded = true;
      section.loading = false;

      // Add controls to form
      this.addPromptControls(section.prompts);
    }, 600);
  }

  /**
   * Add prompt form controls
   */
  private addPromptControls(prompts: ExecutePrompt[]): void {
    prompts.forEach(prompt => {
      if (!this.promptForm.contains(prompt.formControlName)) {
        this.promptForm.addControl(
          prompt.formControlName,
          createPromptFormControl(prompt)
        );
      }
    });
  }

  /**
   * Get form control for a prompt
   */
  getPromptControl(prompt: ExecutePrompt): FormControl {
    return this.promptForm.get(prompt.formControlName) as FormControl;
  }

  /**
   * Handle tab change
   */
  onTabChange(event: { index: number }): void {
    this.activeTabIndex = event.index;
    const tab = this.tabs[event.index];
    if (tab && !tab.loaded && !tab.loading) {
      this.loadSections(tab);
    }
  }

  /**
   * Handle section accordion toggle
   */
  onSectionToggle(section: ExecuteSection, expanded: boolean): void {
    section.expanded = expanded;
    if (expanded && !section.loaded && !section.loading) {
      this.loadPrompts(section);
    }
  }

  /**
   * Get PrimeNG options for a prompt
   */
  getPromptOptions(prompt: ExecutePrompt): any[] {
    return transformValuesToOptions(prompt.values);
  }

  /**
   * Check if form is valid
   */
  isFormValid(): boolean {
    return this.promptForm.valid;
  }

  /**
   * Submit all prompt values
   */
  onSubmit(): void {
    if (!this.isFormValid()) {
      // Mark all controls as touched to show validation errors
      Object.keys(this.promptForm.controls).forEach(key => {
        this.promptForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting = true;
    this.submitError = null;

    const payload = this.collectFormValues();
    console.log('Submission payload:', payload);

    // TODO: Replace with actual API call
    setTimeout(() => {
      this.isSubmitting = false;
      this.globalService.handleSuccessService(
        { status: true, code: 200, message: 'Screen executed successfully' },
        true
      );
    }, 1000);
  }

  /**
   * Collect all form values for submission
   */
  private collectFormValues(): SubmissionPayload {
    const payload: SubmissionPayload = {
      screenId: this.screenId,
      prompts: [],
    };

    this.tabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(prompt => {
          const control = this.getPromptControl(prompt);
          if (control) {
            const rawValue = control.value;
            payload.prompts.push(createPromptSubmission(prompt, rawValue));
          }
        });
      });
    });

    return payload;
  }

  /**
   * Navigate back to screen list
   */
  onBack(): void {
    this.router.navigate(['/app/screen']);
  }

  /**
   * Reset all form values
   */
  onReset(): void {
    this.promptForm.reset();
  }

  /**
   * Generate array for skeleton loader
   */
  getSkeletonArray(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i);
  }
}
