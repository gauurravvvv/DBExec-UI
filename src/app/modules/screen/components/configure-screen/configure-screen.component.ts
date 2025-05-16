import { Component, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { GlobalService } from 'src/app/core/services/global.service';
import { ScreenService } from '../../services/screen.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';

interface TabData {
  id: number;
  name: string;
  description: string;
  sections: Section[];
  [key: string]: any;
}

interface Section {
  id: number;
  name: string;
  prompts: Prompt[];
  selectAll?: boolean;
  expanded?: boolean;
  [key: string]: any;
}

interface Prompt {
  id: number;
  name: string;
  type: string;
  selected?: boolean;
  [key: string]: any;
}

@Component({
  selector: 'app-configure-screen',
  templateUrl: './configure-screen.component.html',
  styleUrls: ['./configure-screen.component.scss'],
})
export class ConfigureScreenComponent implements OnInit {
  orgId: string = '';
  screenId: string = '';
  databaseId: string = '';
  tabsData: TabData[] = [];
  refactoredTabData: TabData[] = [];
  selectedPrompts: TabData[] = [];
  isSidebarCollapsed = false;
  selectedTab: TabData | null = null;
  openTabs: TabData[] = [];
  activeTabIndex: number = 0;
  isFreeze: boolean = true;
  expandedSections: { [key: number]: boolean } = {}; // Change key type to number

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private screenService: ScreenService,
    private route: ActivatedRoute,
    private tabService: TabService
  ) {}

  ngOnInit(): void {
    this.screenId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.databaseId = this.route.snapshot.params['dbId'];
    this.getTabsData();
  }

  getTabsData() {
    let params = {
      orgId: this.orgId,
      databaseId: this.databaseId,
      pageNumber: 1,
      limit: 100,
    };
    this.tabService.listAllTabData(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        // Set all prompts as selected by default
        const tabsWithSelectedPrompts = response.data.map((tab: TabData) => ({
          ...tab,
          sections: tab.sections?.map((section: Section) => ({
            ...section,
            selectAll: true,
            prompts: section.prompts?.map((prompt: Prompt) => ({
              ...prompt,
              selected: true,
            })),
          })),
        }));
        this.tabsData = tabsWithSelectedPrompts;
        this.refactoredTabData = JSON.parse(
          JSON.stringify(tabsWithSelectedPrompts)
        ); // Store a deep copy
      }
    });
  }

  onTabClick(tab: TabData) {
    this.selectedTab = tab;

    // Check if tab is already open
    const existingTabIndex = this.openTabs.findIndex(t => t.id === tab.id);

    if (existingTabIndex === -1) {
      // Add new tab with selected prompts
      const newTab = JSON.parse(JSON.stringify(tab));
      newTab.sections = newTab.sections.map((section: Section) => ({
        ...section,
        selectAll: true,
        prompts: section.prompts.map((prompt: Prompt) => ({
          ...prompt,
          selected: true,
        })),
      }));
      this.openTabs.push(newTab);
      this.activeTabIndex = this.openTabs.length - 1;
    } else {
      // Switch to existing tab
      this.activeTabIndex = existingTabIndex;
    }
  }

  handleTabClose(index: number) {
    if (!this.isFreeze) {
      this.openTabs = this.openTabs.filter((_, i) => i !== index);

      // If the closed tab was selected, select the last tab
      if (this.openTabs.length > 0 && index === this.activeTabIndex) {
        this.activeTabIndex = Math.min(index, this.openTabs.length - 1);
        this.selectedTab = this.openTabs[this.activeTabIndex];
      } else if (this.openTabs.length === 0) {
        this.selectedTab = null;
      }
    }
  }

  expandSidebar() {
    if (this.isSidebarCollapsed) {
      this.isSidebarCollapsed = false;
    }
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  toggleAllPrompts(section: any) {
    if (section.prompts) {
      section.prompts.forEach((prompt: any) => {
        prompt.selected = section.selectAll;
      });
    }
  }

  togglePrompt(prompt: any, section: any) {
    if (!this.isFreeze) {
      prompt.selected = !prompt.selected;
      this.updateSectionSelectAll(section);
    }
  }

  updateSectionSelectAll(section: any) {
    if (section.prompts) {
      section.selectAll = section.prompts.every(
        (prompt: any) => prompt.selected
      );
    }
  }

  screenState() {
    this.isFreeze = !this.isFreeze;

    // Store current expanded state
    const currentExpandedState = { ...this.expandedSections };

    if (this.isFreeze) {
      // Store current state and show only selected prompts
      this.selectedPrompts = JSON.parse(JSON.stringify(this.openTabs));

      // Filter to show only selected prompts
      this.openTabs = this.openTabs.map(tab => ({
        ...tab,
        sections: tab.sections.map((section: Section) => ({
          ...section,
          expanded: this.expandedSections[section.id], // This now expects a number
          prompts: section.prompts.filter((prompt: Prompt) => prompt.selected),
        })),
      }));
    } else {
      // Restore all prompts while maintaining selection state
      if (this.selectedPrompts && this.selectedPrompts.length > 0) {
        this.openTabs = this.openTabs.map((tab, tabIndex) => {
          const storedTab = this.selectedPrompts[tabIndex];
          if (!storedTab) return tab;

          return {
            ...tab,
            sections: tab.sections.map((section: Section) => {
              const storedSection = storedTab.sections?.find(
                s => s.id === section.id
              );
              if (!storedSection) {
                return {
                  ...section,
                  expanded: this.expandedSections[section.id],
                  selectAll: true,
                  prompts: section.prompts.map((p: Prompt) => ({
                    ...p,
                    selected: true,
                  })),
                };
              }

              return {
                ...section,
                expanded: this.expandedSections[section.id],
                selectAll: storedSection.selectAll ?? true,
                prompts:
                  storedSection.prompts ||
                  section.prompts.map((p: Prompt) => ({
                    ...p,
                    selected: true,
                  })),
              };
            }),
          };
        });
      } else {
        this.openTabs = this.openTabs.map(tab => ({
          ...tab,
          sections: tab.sections.map((section: Section) => ({
            ...section,
            expanded: this.expandedSections[section.id],
            selectAll: true,
            prompts: section.prompts.map((prompt: Prompt) => ({
              ...prompt,
              selected: true,
            })),
          })),
        }));
      }
    }

    // Restore expanded state
    this.expandedSections = currentExpandedState;
  }

  // Update method signature to use number type
  onTabAccordionChange(sectionId: number, expanded: boolean) {
    this.expandedSections[sectionId] = expanded;
  }

  getSelectedPromptString(prompts: any[]): string {
    if (!prompts) return '';
    return (
      prompts.filter(prompt => prompt.selected).length +
      ' of ' +
      prompts.length +
      ' selected'
    );
  }
}
