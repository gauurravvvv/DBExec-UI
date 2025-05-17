import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SCREEN } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { ScreenService } from '../../services/screen.service';

interface TabData {
  id: string | number;
  name: string;
  description: string;
  sections: Section[];
  [key: string]: any;
}

interface Section {
  id: string | number;
  name: string;
  prompts: Prompt[];
  selectAll?: boolean;
  expanded?: boolean;
  [key: string]: any;
}

interface Prompt {
  id: string | number;
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
  isFreeze: boolean = false;
  expandedSections: { [key: string]: boolean } = {};
  showDeleteConfirm: boolean = false;

  constructor(
    private globalService: GlobalService,
    private screenService: ScreenService,
    private route: ActivatedRoute,
    private tabService: TabService,
    private router: Router
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
    this.tabService
      .listAllTabData(params)
      .then(response => {
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
      })
      .then(() => {
        this.screenService
          .getScreenConfiguration(this.orgId, this.screenId)
          .then(response => {
            if (this.globalService.handleSuccessService(response)) {
              // Mark checkboxes based on API response
              const configData = response.data;

              // Deep copy the refactoredTabData to avoid reference issues
              this.tabsData = JSON.parse(
                JSON.stringify(this.refactoredTabData)
              );

              // For each tab in the configuration
              configData.forEach((configTab: any) => {
                // Convert IDs to strings for comparison
                const tab = this.tabsData.find(
                  t => String(t.id) === String(configTab.id)
                );
                if (tab) {
                  // For each section in the configuration
                  configTab.sections.forEach((configSection: any) => {
                    const section = tab.sections.find(
                      s => String(s.id) === String(configSection.id)
                    );
                    if (section) {
                      // Mark prompts as selected if they exist in the config
                      section.prompts = section.prompts.map(prompt => ({
                        ...prompt,
                        selected: configSection.prompts.some(
                          (p: any) => String(p.id) === String(prompt.id)
                        ),
                      }));

                      // Update section's selectAll status
                      section.selectAll = section.prompts.every(
                        p => p.selected
                      );

                      // Expand the section by default
                      this.expandedSections[String(section.id)] = true;
                    }
                  });

                  // Create a new tab with the configured state
                  const configuredTab = JSON.parse(JSON.stringify(tab));

                  // Check if tab is already open
                  const existingTabIndex = this.openTabs.findIndex(
                    t => String(t.id) === String(tab.id)
                  );
                  if (existingTabIndex === -1) {
                    this.openTabs.push(configuredTab);
                  } else {
                    // Update existing tab
                    this.openTabs[existingTabIndex] = configuredTab;
                  }
                }
              });

              // Set active tab to the first tab
              if (this.openTabs.length > 0) {
                this.activeTabIndex = 0;
                this.selectedTab = this.openTabs[0];
              }

              // Update refactoredTabData with the new selection state
              this.refactoredTabData = JSON.parse(
                JSON.stringify(this.tabsData)
              );
            }
          });
      });
  }

  onTabClick(tab: TabData) {
    if (this.isFreeze) {
      return;
    }

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

      // Filter to show only selected prompts and remove empty sections/tabs
      this.openTabs = this.openTabs
        .map(tab => ({
          ...tab,
          sections: tab.sections
            .map((section: Section) => ({
              ...section,
              expanded: this.expandedSections[String(section.id)],
              prompts: section.prompts.filter(
                (prompt: Prompt) => prompt.selected
              ),
            }))
            // Remove sections with no selected prompts
            .filter(section => section.prompts.length > 0),
        }))
        // Remove tabs with no sections (all sections were empty)
        .filter(tab => tab.sections.length > 0);

      // If current active tab was removed, adjust activeTabIndex
      if (this.activeTabIndex >= this.openTabs.length) {
        this.activeTabIndex = Math.max(0, this.openTabs.length - 1);
      }
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
                  expanded: this.expandedSections[String(section.id)],
                  selectAll: true,
                  prompts: section.prompts.map((p: Prompt) => ({
                    ...p,
                    selected: true,
                  })),
                };
              }

              return {
                ...section,
                expanded: this.expandedSections[String(section.id)],
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
            expanded: this.expandedSections[String(section.id)],
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

  onTabAccordionChange(sectionId: string | number, expanded: boolean) {
    this.expandedSections[String(sectionId)] = expanded;
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

  closeDialig() {
    this.showDeleteConfirm = false;
  }

  clearSelected() {
    this.showDeleteConfirm = false;

    // Clear all open tabs
    this.openTabs = [];
    this.activeTabIndex = 0;
    this.selectedTab = null;

    // Reset the expanded sections
    this.expandedSections = {};

    // Reset all tabs data to original state
    if (this.refactoredTabData.length > 0) {
      this.tabsData = JSON.parse(JSON.stringify(this.refactoredTabData));
    }

    // Ensure we're in unfreeze state
    this.isFreeze = true;

    // Clear selected prompts array
    this.selectedPrompts = [];

    this.isFreeze = false;
  }

  hasSelectedPrompts(): boolean {
    return this.openTabs.some(tab =>
      tab.sections.some(section =>
        section.prompts.some((prompt: any) => prompt.selected)
      )
    );
  }

  saveScreenConfiguration() {
    const screenConfig = this.openTabs.map(tab => ({
      tab: tab.id,
      sections: tab.sections.map(section => ({
        id: section.id,
        name: section.name,
        prompts: section.prompts
          .filter((prompt: any) => prompt.selected)
          .map((prompt: any) => ({
            id: prompt.id,
            name: prompt.name,
            selected: prompt.selected,
          })),
      })),
    }));

    // TODO: Add API call to save configuration
    this.screenService
      .saveScreenConfiguration(
        screenConfig,
        this.orgId,
        this.databaseId,
        this.screenId
      )
      .then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.router.navigate([SCREEN.LIST]);
        }
      });
  }
}
