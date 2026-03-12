import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { Subject } from 'rxjs';

import { GlobalService } from 'src/app/core/services/global.service';
import { ScreenService } from '../../services/screen.service';
import { PromptService } from '../../../prompt/services/prompt.service';
import {
  ExecuteTab,
  ExecuteSection,
  ExecutePrompt,
  SubmissionPayload,
  transformTabResponse,
  transformSectionResponse,
  transformPromptResponse,
} from './models/execute-screen.models';
import {
  createPromptFormControl,
} from './helpers/form.helper';
import {
  createPromptSubmission,
  getPlaceholder,
} from './helpers/prompt-renderer.helper';

@Component({
  selector: 'app-execute-screen',
  templateUrl: './execute-screen.component.html',
  styleUrls: ['./execute-screen.component.scss'],
})
export class ExecuteScreenComponent implements OnInit, OnDestroy {
  // Route params — hardcoded as per requirement
  orgId = '2';
  databaseId = '3';
  screenId = '2';
  screenName = '';

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

  // Skeleton arrays (cached to avoid recreating in template)
  readonly skeletonTabs = Array.from({ length: 3 }, (_, i) => i);
  readonly skeletonSections = Array.from({ length: 3 }, (_, i) => i);
  readonly skeletonPrompts = Array.from({ length: 4 }, (_, i) => i);

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private globalService: GlobalService,
    private screenService: ScreenService,
    private promptService: PromptService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadTabs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.promptForm = this.fb.group({});
  }

  /**
   * Step 1: Load screen tabs from API
   */
  loadTabs(): void {
    this.loadingTabs = true;
    this.tabError = null;

    this.screenService
      .getScreenTabs(this.orgId, this.screenId)
      .then((response: any) => {
        if (response.status) {
          this.tabs = (response.data || []).map(transformTabResponse);
          this.loadingTabs = false;

          // Auto-load sections for first tab
          if (this.tabs.length > 0) {
            this.loadSections(this.tabs[0]);
          }
        } else {
          this.tabError = response.message || 'Failed to load tabs';
          this.loadingTabs = false;
        }
      })
      .catch(() => {
        this.tabError = 'Failed to load tabs';
        this.loadingTabs = false;
      });
  }

  /**
   * Step 2: Load sections for a tab
   */
  loadSections(tab: ExecuteTab): void {
    if (tab.loaded || tab.loading) return;

    tab.loading = true;
    tab.error = null;

    this.screenService
      .getTabSections(this.orgId, this.screenId, String(tab.id))
      .then((response: any) => {
        if (response.status) {
          tab.sections = (response.data || []).map(transformSectionResponse);
          tab.loaded = true;
          tab.loading = false;

          // Auto-expand first section and load its prompts
          if (tab.sections.length > 0) {
            tab.sections[0].expanded = true;
            this.loadPrompts(tab.sections[0], tab);
          }
        } else {
          tab.error = response.message || 'Failed to load sections';
          tab.loading = false;
        }
      })
      .catch(() => {
        tab.error = 'Failed to load sections';
        tab.loading = false;
      });
  }

  /**
   * Step 3: Load prompts for a section
   */
  loadPrompts(section: ExecuteSection, tab?: ExecuteTab): void {
    if (section.loaded || section.loading) return;

    section.loading = true;
    section.error = null;

    // Find parent tab to get tabId
    const parentTab = tab || this.tabs.find(t => t.sections.includes(section));
    const tabId = parentTab ? String(parentTab.id) : '';

    this.screenService
      .getSectionPrompts(
        this.orgId,
        this.screenId,
        tabId,
        String(section.id)
      )
      .then((response: any) => {
        if (response.status) {
          section.prompts = (response.data || []).map(transformPromptResponse);
          section.loaded = true;
          section.loading = false;

          // Add controls to form
          this.addPromptControls(section.prompts);

          // Load dynamic options for selection-based prompts
          this.loadDynamicOptions(section.prompts);
        } else {
          section.error = response.message || 'Failed to load prompts';
          section.loading = false;
        }
      })
      .catch(() => {
        section.error = 'Failed to load prompts';
        section.loading = false;
      });
  }

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
   * Load dynamic options for prompts that have prompt_values_sql configured
   */
  private loadDynamicOptions(prompts: ExecutePrompt[]): void {
    const selectionTypes = ['dropdown', 'multiselect', 'checkbox', 'radio'];

    prompts.forEach(prompt => {
      if (
        selectionTypes.includes(prompt.type) &&
        prompt.config?.prompt_values_sql
      ) {
        this.promptService
          .getPromptValuesBySQL({
            orgId: this.orgId,
            databaseId: this.databaseId,
            query: prompt.config.prompt_values_sql,
          })
          .then((response: any) => {
            if (response.status && response.data) {
              prompt.options = (response.data || []).map((row: any) => {
                // API returns rows — use first two columns as value/label
                const keys = Object.keys(row);
                const value = String(row[keys[0]] ?? '');
                const label = keys.length > 1 ? String(row[keys[1]] ?? value) : value;
                return { label, value };
              });
            }
          })
          .catch(() => {
            // Keep existing static options on failure
          });
      }
    });
  }

  getPromptControl(prompt: ExecutePrompt): FormControl {
    return this.promptForm.get(prompt.formControlName) as FormControl;
  }

  onTabChange(event: { index: number }): void {
    this.activeTabIndex = event.index;
    const tab = this.tabs[event.index];
    if (tab && !tab.loaded && !tab.loading) {
      this.loadSections(tab);
    }
  }

  onSectionToggle(section: ExecuteSection, expanded: boolean): void {
    section.expanded = expanded;
    if (expanded && !section.loaded && !section.loading) {
      this.loadPrompts(section);
    }
  }

  getPlaceholder(prompt: ExecutePrompt): string {
    return getPlaceholder(prompt.type);
  }

  isFormValid(): boolean {
    return this.promptForm.valid;
  }

  onSubmit(): void {
    if (!this.isFormValid()) {
      Object.keys(this.promptForm.controls).forEach(key => {
        this.promptForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting = true;
    this.submitError = null;

    const payload = this.collectFormValues();
    console.log('Submission payload:', payload);

    // TODO: Replace with actual execute API call
    setTimeout(() => {
      this.isSubmitting = false;
      this.globalService.handleSuccessService(
        { status: true, code: 200, message: 'Screen executed successfully' },
        true
      );
    }, 1000);
  }

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
            payload.prompts.push(createPromptSubmission(prompt, control.value));
          }
        });
      });
    });

    return payload;
  }

  onBack(): void {
    this.router.navigate(['/app/screen']);
  }

  onReset(): void {
    this.promptForm.reset();
  }
}
