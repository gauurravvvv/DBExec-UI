import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { TreeNode } from 'primeng/api';

import { SCREEN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { ScreenService } from '../../services/screen.service';
import {
  ExecuteTab,
  ExecuteSection,
  ExecutePrompt,
  transformTabResponse,
  transformSectionResponse,
  transformPromptResponse,
} from '../execute-screen/models/execute-screen.models';
import { createPromptFormControl } from '../execute-screen/helpers/form.helper';
import { getPlaceholder } from '../execute-screen/helpers/prompt-renderer.helper';

@Component({
  selector: 'app-view-screen',
  templateUrl: './view-screen.component.html',
  styleUrls: ['./view-screen.component.scss'],
})
export class ViewScreenComponent implements OnInit, OnDestroy {
  @ViewChild('treeDropdown') treeDropdownRef!: ElementRef;
  @ViewChild('treeSearchInput') treeSearchInputRef!: ElementRef;

  // Route params
  orgId = '';
  screenId = '';
  screenName = '';

  // Data
  tabs: ExecuteTab[] = [];
  activeTabIndex = 0;

  // Loading states
  loadingTabs = true;
  tabError: string | null = null;

  // Form
  promptForm!: FormGroup;

  // Screen data (for databaseId needed by Configure route)
  databaseId = '';
  showDeleteConfirm = false;

  // Structure tree navigation
  structureTreeNodes: TreeNode[] = [];
  showStructureTree = false;
  loadingStructure = false;
  highlightedElementId: string | null = null;

  // Cleanup
  private destroy$ = new Subject<void>();
  private clickOutsideHandler = (e: MouseEvent) => this.onClickOutside(e);

  // Skeleton arrays
  readonly skeletonTabs = Array.from({ length: 3 }, (_, i) => i);
  readonly skeletonSections = Array.from({ length: 3 }, (_, i) => i);
  readonly skeletonPrompts = Array.from({ length: 4 }, (_, i) => i);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private globalService: GlobalService,
    private screenService: ScreenService,
  ) {
    this.orgId = this.route.snapshot.params['orgId'];
    this.screenId = this.route.snapshot.params['id'];
  }

  ngOnInit(): void {
    this.promptForm = this.fb.group({});
    this.loadScreenDetails();
    this.loadTabs();
    this.loadScreenStructure();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('click', this.clickOutsideHandler);
  }

  // =========================================
  // Data Loading
  // =========================================

  loadTabs(): void {
    this.loadingTabs = true;
    this.tabError = null;

    this.screenService
      .getScreenTabs(this.orgId, this.screenId)
      .then((response: any) => {
        if (response.status) {
          this.tabs = (response.data || []).map(transformTabResponse);
          this.loadingTabs = false;

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

          tab.sections.forEach(section => {
            section.expanded = true;
            this.loadPrompts(section, tab);
          });
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

  loadPrompts(section: ExecuteSection, tab?: ExecuteTab): void {
    if (section.loaded || section.loading) return;

    section.loading = true;
    section.error = null;

    const parentTab = tab || this.tabs.find(t => t.sections.includes(section));
    const tabId = parentTab ? String(parentTab.id) : '';

    this.screenService
      .getSectionPrompts(this.orgId, this.screenId, tabId, String(section.id))
      .then((response: any) => {
        if (response.status) {
          section.prompts = (response.data || []).map(transformPromptResponse);
          section.loaded = true;
          section.loading = false;

          this.addPromptControls(section.prompts);
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
          createPromptFormControl(prompt),
        );
      }
    });
  }

  // =========================================
  // Form Helpers
  // =========================================

  getPromptControl(prompt: ExecutePrompt): FormControl {
    return this.promptForm.get(prompt.formControlName) as FormControl;
  }

  hasValue(prompt: ExecutePrompt): boolean {
    const v = this.promptForm.get(prompt.formControlName)?.value;
    if (v == null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0 && v.some(item => item != null);
    return true;
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
  }

  getPlaceholder(prompt: ExecutePrompt): string {
    return getPlaceholder(prompt.type);
  }

  // =========================================
  // Structure Tree Navigation
  // =========================================

  private loadScreenStructure(): void {
    this.loadingStructure = true;
    this.screenService
      .getScreenStructure(this.orgId, this.screenId)
      .then((response: any) => {
        if (response.status && response.data) {
          this.structureTreeNodes = this.buildTreeNodes(response.data);
        }
        this.loadingStructure = false;
      })
      .catch(() => {
        this.loadingStructure = false;
      });
  }

  private buildTreeNodes(screen: any): TreeNode[] {
    return (screen.tabs || []).map((tab: any) => ({
      label: tab.name,
      icon: 'pi pi-bookmark',
      expanded: false,
      data: { type: 'tab', tabId: tab.id },
      children: (tab.sections || []).map((section: any) => ({
        label: section.name,
        icon: 'pi pi-list',
        expanded: false,
        data: { type: 'section', tabId: tab.id, sectionId: section.id },
        children: (section.prompts || []).map((prompt: any) => ({
          label: prompt.name,
          icon: this.getPromptTypeIcon(prompt.type),
          data: {
            type: 'prompt',
            tabId: tab.id,
            sectionId: section.id,
            promptId: prompt.id,
            promptType: prompt.type,
          },
        })),
      })),
    }));
  }

  private getPromptTypeIcon(type: string): string {
    switch (type) {
      case 'text':
        return 'pi pi-pencil';
      case 'number':
        return 'pi pi-hashtag';
      case 'date':
      case 'calendar':
      case 'daterange':
        return 'pi pi-calendar';
      case 'dropdown':
        return 'pi pi-chevron-down';
      case 'multiselect':
        return 'pi pi-check-square';
      case 'radio':
        return 'pi pi-circle';
      case 'checkbox':
        return 'pi pi-check-square';
      case 'rangeslider':
        return 'pi pi-sliders-h';
      default:
        return 'pi pi-circle';
    }
  }

  onTreeFilter(event: any): void {
    const query = event?.filter || event?.originalEvent?.target?.value || '';
    const expand = query.trim().length > 0;
    this.setTreeExpanded(this.structureTreeNodes, expand);
  }

  private setTreeExpanded(nodes: TreeNode[], expanded: boolean): void {
    nodes.forEach(node => {
      node.expanded = expanded;
      if (node.children) {
        this.setTreeExpanded(node.children, expanded);
      }
    });
  }

  toggleStructureTree(): void {
    this.showStructureTree = !this.showStructureTree;
    if (this.showStructureTree) {
      setTimeout(() => {
        document.addEventListener('click', this.clickOutsideHandler);
      });
    } else {
      document.removeEventListener('click', this.clickOutsideHandler);
    }
  }

  private onClickOutside(event: MouseEvent): void {
    const dropdown = this.treeDropdownRef?.nativeElement;
    const input = this.treeSearchInputRef?.nativeElement;
    if (
      dropdown &&
      !dropdown.contains(event.target) &&
      input &&
      !input.contains(event.target)
    ) {
      this.showStructureTree = false;
      document.removeEventListener('click', this.clickOutsideHandler);
    }
  }

  onStructureNodeSelect(event: any): void {
    const node: TreeNode = event.node;
    if (!node?.data) return;

    const { type, tabId, sectionId, promptId } = node.data;

    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    this.activeTabIndex = tabIndex;
    const tab = this.tabs[tabIndex];

    const navigate = () => {
      if (type === 'tab') {
        this.closeTreeAndScroll(() => {
          this.highlightElement(`tab-${tabId}`);
        });
        return;
      }

      const section = tab.sections.find(s => s.id === sectionId);
      if (section) {
        section.expanded = true;
      }

      if (type === 'section') {
        this.closeTreeAndScroll(() => {
          this.waitForElement(`section-${sectionId}`, () => {
            this.highlightElement(`section-${sectionId}`);
          });
        });
        return;
      }

      if (type === 'prompt') {
        const waitForPrompts = () => {
          if (section && section.loaded) {
            this.closeTreeAndScroll(() => {
              this.waitForElement(`prompt-${promptId}`, () => {
                this.highlightElement(`prompt-${promptId}`);
              });
            });
          } else {
            setTimeout(waitForPrompts, 100);
          }
        };
        waitForPrompts();
      }
    };

    if (!tab.loaded && !tab.loading) {
      this.loadSections(tab);
      const waitForLoad = () => {
        if (tab.loaded) {
          navigate();
        } else {
          setTimeout(waitForLoad, 100);
        }
      };
      setTimeout(waitForLoad, 100);
    } else {
      navigate();
    }
  }

  private closeTreeAndScroll(scrollFn?: () => void): void {
    this.showStructureTree = false;
    this.setTreeExpanded(this.structureTreeNodes, false);
    document.removeEventListener('click', this.clickOutsideHandler);
    if (scrollFn) {
      setTimeout(scrollFn, 200);
    }
  }

  private waitForElement(id: string, callback: () => void, retries = 20): void {
    const el = document.getElementById(id);
    if (el) {
      callback();
    } else if (retries > 0) {
      setTimeout(() => this.waitForElement(id, callback, retries - 1), 50);
    }
  }

  private highlightElement(id: string): void {
    this.highlightedElementId = id;
    this.scrollToElement(id);

    const el = document.getElementById(id);
    if (el) {
      el.classList.add('nav-highlight');
      setTimeout(() => {
        el.classList.remove('nav-highlight');
      }, 2500);
    }

    setTimeout(() => {
      this.highlightedElementId = null;
    }, 2500);
  }

  private scrollToElement(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;

    const scrollContainer = document.querySelector(
      '.full-height-tabs .p-tabview-panels',
    );
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offset =
        elRect.top -
        containerRect.top +
        scrollContainer.scrollTop -
        containerRect.height / 2 +
        elRect.height / 2;
      scrollContainer.scrollTo({
        top: Math.max(0, offset),
        behavior: 'smooth',
      });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // =========================================
  // Screen Details & Actions
  // =========================================

  private loadScreenDetails(): void {
    this.screenService
      .viewScreen(this.orgId, this.screenId)
      .then((response: any) => {
        if (response.status && response.data) {
          this.databaseId = String(response.data.databaseId || '');
          this.screenName = response.data.name || '';
        }
      });
  }

  onEdit(): void {
    this.router.navigate([SCREEN.EDIT, this.orgId, this.screenId]);
  }

  onConfigure(): void {
    this.router.navigate([
      SCREEN.CONFIG,
      this.orgId,
      this.databaseId,
      this.screenId,
    ]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    this.screenService
      .deleteScreen(this.orgId, this.screenId)
      .then((response: any) => {
        this.showDeleteConfirm = false;
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([SCREEN.LIST]);
        }
      });
  }

  onBack(): void {
    this.router.navigate([SCREEN.LIST]);
  }
}
