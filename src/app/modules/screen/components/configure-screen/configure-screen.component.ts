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
  sequence: number;
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
  hasReceivedConfig: boolean = false;
  showClearConfirm: boolean = false;

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
            sequence: 0,
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
          );
        }
      })
      .then(() => {
        this.screenService
          .getScreenConfiguration(this.orgId, this.screenId)
          .then(response => {
            if (this.globalService.handleSuccessService(response)) {
              // Mark that we received configuration from API
              this.hasReceivedConfig =
                response.data && response.data.length > 0;

              // Mark checkboxes based on API response
              const configData = response.data;

              // Deep copy the refactoredTabData to avoid reference issues
              this.tabsData = JSON.parse(
                JSON.stringify(this.refactoredTabData)
              );

              let sequenceCounter = 1;
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
                  configuredTab.sequence = sequenceCounter++;

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
      // Add new tab with selected prompts and sequence
      const newTab = JSON.parse(JSON.stringify(tab));
      newTab.sections = newTab.sections.map((section: Section) => ({
        ...section,
        selectAll: true,
        prompts: section.prompts.map((prompt: Prompt) => ({
          ...prompt,
          selected: true,
        })),
      }));
      newTab.sequence = this.openTabs.length + 1;
      this.openTabs.push(newTab);
      this.activeTabIndex = this.openTabs.length - 1;
    } else {
      // Switch to existing tab
      this.activeTabIndex = existingTabIndex;
    }
  }

  handleTabClose(index: number) {
    if (!this.isFreeze) {
      const closedTabSequence = this.openTabs[index]?.sequence;

      // Remove the tab
      this.openTabs = this.openTabs.filter((_, i) => i !== index);

      // Resequence remaining tabs - only update sequence for tabs that were after the closed tab
      this.openTabs = this.openTabs.map(tab => {
        if (tab.sequence > closedTabSequence) {
          return {
            ...tab,
            sequence: tab.sequence - 1,
          };
        }
        return tab;
      });

      // Handle active tab selection after closing
      if (this.openTabs.length > 0) {
        if (index === this.activeTabIndex) {
          // If we closed the active tab
          if (index >= this.openTabs.length) {
            // If we closed the last tab, select the new last tab
            this.activeTabIndex = this.openTabs.length - 1;
          } else {
            // Keep the same index (which will now point to the next tab)
            this.activeTabIndex = index;
          }
        } else if (index < this.activeTabIndex) {
          // If we closed a tab before the active tab, decrement the active index
          this.activeTabIndex--;
        }
        // Update the selected tab reference
        this.selectedTab = this.openTabs[this.activeTabIndex];

        // Update the content of the selected tab
        const originalTab = this.selectedTab
          ? this.tabsData.find(t => t.id === this.selectedTab?.id)
          : null;
        if (this.selectedTab && originalTab) {
          // Update sections and prompts while preserving selection state
          this.selectedTab.sections = this.selectedTab.sections.map(section => {
            const originalSection = originalTab.sections.find(
              s => s.id === section.id
            );
            if (originalSection) {
              return {
                ...section,
                prompts: section.prompts.map(prompt => {
                  const originalPrompt = originalSection.prompts.find(
                    p => p.id === prompt.id
                  );
                  if (originalPrompt) {
                    return {
                      ...originalPrompt,
                      selected: prompt.selected, // Keep the current selection state
                    };
                  }
                  return prompt;
                }),
              };
            }
            return section;
          });
        }
      } else {
        // No tabs left
        this.activeTabIndex = 0;
        this.selectedTab = null;
      }

      // Update expanded sections state if needed
      if (this.selectedTab) {
        this.selectedTab.sections.forEach(section => {
          if (!this.expandedSections.hasOwnProperty(section.id)) {
            this.expandedSections[section.id] = true; // Default to expanded
          }
        });
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
              prompts: section.prompts.filter(
                (prompt: Prompt) => prompt.selected
              ),
            }))
            // Remove sections with no selected prompts
            .filter(section => section.prompts.length > 0),
        }))
        // Remove tabs with no sections (all sections were empty)
        .filter(tab => tab.sections.length > 0);

      // Expand all sections when locking
      this.openTabs.forEach(tab => {
        tab.sections.forEach(section => {
          this.expandedSections[String(section.id)] = true;
        });
      });

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
                  selectAll: true,
                  prompts: section.prompts.map((p: Prompt) => ({
                    ...p,
                    selected: true,
                  })),
                };
              }

              return {
                ...section,
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
            selectAll: true,
            prompts: section.prompts.map((prompt: Prompt) => ({
              ...prompt,
              selected: true,
            })),
          })),
        }));
      }
    }
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
    this.showClearConfirm = false;
  }

  clearSelected() {
    // Check if we have any original screen configuration
    const hasOriginalConfig = this.refactoredTabData.some(tab =>
      tab.sections.some(section =>
        section.prompts.some((prompt: any) => prompt.selected)
      )
    );

    if (hasOriginalConfig) {
      // Restore to original configuration
      this.openTabs = [];
      this.activeTabIndex = 0;
      this.selectedTab = null;
      this.expandedSections = {};

      // Reset tabs data to original state from refactoredTabData
      this.tabsData = JSON.parse(JSON.stringify(this.refactoredTabData));

      // Re-populate open tabs with original configuration
      this.refactoredTabData.forEach(tab => {
        const hasSelectedPrompts = tab.sections.some(section =>
          section.prompts.some((prompt: any) => prompt.selected)
        );

        if (hasSelectedPrompts) {
          const configuredTab = JSON.parse(JSON.stringify(tab));
          this.openTabs.push(configuredTab);
        }
      });

      // Set active tab to first tab if available
      if (this.openTabs.length > 0) {
        this.activeTabIndex = 0;
        this.selectedTab = this.openTabs[0];
      }

      // Restore expanded state for sections that had selected prompts
      this.openTabs.forEach(tab => {
        tab.sections.forEach(section => {
          if (section.prompts.some((prompt: any) => prompt.selected)) {
            this.expandedSections[String(section.id)] = true;
          }
        });
      });
    } else {
      // Clear everything as no original configuration exists
      this.openTabs = [];
      this.activeTabIndex = 0;
      this.selectedTab = null;
      this.expandedSections = {};
      this.selectedPrompts = [];
      this.tabsData = this.refactoredTabData.map(tab => ({
        ...tab,
        sections: tab.sections.map(section => ({
          ...section,
          selectAll: false,
          prompts: section.prompts.map(prompt => ({
            ...prompt,
            selected: false,
          })),
        })),
      }));
    }

    // Reset freeze state
    this.isFreeze = false;
    this.showDeleteConfirm = false;
  }

  hasSelectedPrompts(): boolean {
    return this.openTabs.some(tab =>
      tab.sections.some(section =>
        section.prompts.some((prompt: any) => prompt.selected)
      )
    );
  }

  saveScreenConfiguration() {
    const screenConfig = this.openTabs.map((tab: any) => ({
      tab: tab.id,
      sequence: tab.sequence,
      sections: tab.sections.map((section: any, sectionIndex: number) => ({
        id: section.id,
        name: section.name,
        sectionSequence: sectionIndex,
        prompts: section.prompts
          .filter((prompt: any) => prompt.selected)
          .map((prompt: any, promptIndex: number) => ({
            id: prompt.id,
            name: prompt.name,
            selected: prompt.selected,
            promptSequence: promptIndex,
          })),
      })),
    }));

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

  hasChanges(): boolean {
    // If there are no open tabs but original config exists, changes were made
    const hasOriginalConfig = this.refactoredTabData.some(tab =>
      tab.sections.some(section =>
        section.prompts.some((prompt: any) => prompt.selected)
      )
    );

    if (hasOriginalConfig && this.openTabs.length === 0) {
      return true;
    }

    // Compare current state with original configuration
    return this.openTabs.some(openTab => {
      const originalTab = this.refactoredTabData.find(
        tab => tab.id === openTab.id
      );
      if (!originalTab) return true;

      return openTab.sections.some(openSection => {
        const originalSection = originalTab.sections.find(
          section => section.id === openSection.id
        );
        if (!originalSection) return true;

        return openSection.prompts.some((openPrompt: any) => {
          const originalPrompt = originalSection.prompts.find(
            (p: any) => p.id === openPrompt.id
          );
          return originalPrompt?.selected !== openPrompt.selected;
        });
      });
    });
  }

  handleCancelOrClear() {
    if (this.hasExistingConfiguration()) {
      // Show confirmation dialog for cancel
      this.showDeleteConfirm = true;
    } else {
      // Clear all selections without confirmation
      this.showClearConfirm = true;
    }
  }

  hasExistingConfiguration(): boolean {
    return this.hasReceivedConfig;
  }

  clearAllSelections() {
    // Clear all selections in open tabs
    this.openTabs = []; // Clear all open tabs
    this.activeTabIndex = 0; // Reset active tab index
    this.selectedTab = null; // Clear selected tab

    // Clear selections in tabsData
    this.tabsData = this.tabsData.map(tab => ({
      ...tab,
      sections: tab.sections.map(section => ({
        ...section,
        selectAll: false,
        prompts: section.prompts.map(prompt => ({
          ...prompt,
          selected: false,
        })),
      })),
    }));

    // Update expanded sections
    this.expandedSections = {};
    this.showClearConfirm = false;
  }
}
