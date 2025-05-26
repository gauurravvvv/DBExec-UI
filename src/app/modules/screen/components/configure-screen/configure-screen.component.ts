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
  sectionSequence: number;
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
  draggedTabIndex: number | null = null;
  dragOverIndex: number | null = null;
  draggedSectionIndex: number | null = null;
  draggedTabId: string | number | null = null;
  draggedPromptIndex: number | null = null;
  draggedPromptTabId: string | number | null = null;
  draggedPromptSectionId: string | number | null = null;

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
      newTab.sections = newTab.sections.map((section: Section) => {
        // Set expanded state based on whether section has prompts
        this.expandedSections[section.id] =
          section.prompts?.length === 0 || true;
        return {
          ...section,
          selectAll: true,
          prompts: section.prompts.map((prompt: Prompt) => ({
            ...prompt,
            selected: true,
          })),
        };
      });
      newTab.sequence = this.openTabs.length + 1;
      this.openTabs.push(newTab);
      this.activeTabIndex = this.openTabs.length - 1;
    } else {
      // Switch to existing tab
      this.activeTabIndex = existingTabIndex;

      // Update expanded state for empty sections
      tab.sections.forEach(section => {
        if (section.prompts?.length === 0) {
          this.expandedSections[section.id] = true;
        }
      });
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
      // Store current state
      this.selectedPrompts = JSON.parse(JSON.stringify(this.openTabs));

      // Filter tabs and their sections
      this.openTabs = this.openTabs
        .map(tab => {
          // First filter sections to only keep those with selected prompts
          const filteredSections = tab.sections.filter(section =>
            section.prompts.some((prompt: Prompt) => prompt.selected)
          );

          return {
            ...tab,
            sections: filteredSections,
          };
        })
        // Then filter out tabs that have no sections with selected prompts
        .filter(tab => tab.sections.length > 0);

      // If current active tab was removed, adjust activeTabIndex
      if (this.activeTabIndex >= this.openTabs.length) {
        this.activeTabIndex = Math.max(0, this.openTabs.length - 1);
      }
    } else {
      // Restore all prompts while maintaining selection state
      if (this.selectedPrompts && this.selectedPrompts.length > 0) {
        // Create a map of the current selection state
        const selectionMap = new Map();
        this.selectedPrompts.forEach(tab => {
          tab.sections.forEach(section => {
            section.prompts.forEach((prompt: Prompt) => {
              selectionMap.set(prompt.id, prompt.selected);
            });
          });
        });

        // Restore tabs from original data while maintaining selection state
        this.openTabs = this.tabsData
          .filter(tab => this.openTabs.some(openTab => openTab.id === tab.id))
          .map(tab => {
            const tabCopy = JSON.parse(JSON.stringify(tab));
            tabCopy.sections = tabCopy.sections.map((section: Section) => {
              return {
                ...section,
                selectAll: section.prompts.every(prompt =>
                  selectionMap.has(prompt.id)
                    ? selectionMap.get(prompt.id)
                    : false
                ),
                prompts: section.prompts.map(prompt => ({
                  ...prompt,
                  selected: selectionMap.has(prompt.id)
                    ? selectionMap.get(prompt.id)
                    : false,
                })),
              };
            });
            return tabCopy;
          });

        // Maintain the sequence of tabs
        const sequenceMap = new Map(
          this.selectedPrompts.map((tab, index) => [tab.id, index + 1])
        );
        this.openTabs.forEach(tab => {
          tab.sequence = sequenceMap.get(tab.id) || tab.sequence;
        });

        // Sort tabs based on sequence
        this.openTabs.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      } else {
        // If no previous state, show all sections with default selection
        this.openTabs = this.openTabs.map(tab => ({
          ...tab,
          sections:
            this.tabsData
              .find(t => t.id === tab.id)
              ?.sections.map((section: Section) => ({
                ...section,
                selectAll: false,
                prompts: section.prompts.map((prompt: Prompt) => ({
                  ...prompt,
                  selected: false,
                })),
              })) || [],
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

  onTabDragStart(index: number) {
    if (this.isFreeze) return;
    this.draggedTabIndex = index;
  }

  onTabDragEnd() {
    this.draggedTabIndex = null;
  }

  onTabDragEnter(dropIndex: number) {
    if (
      this.isFreeze ||
      this.draggedTabIndex === null ||
      this.draggedTabIndex === dropIndex
    )
      return;

    // Create a new array to trigger change detection
    const updatedTabs = [...this.openTabs];
    const draggedTab = updatedTabs[this.draggedTabIndex];

    // Remove tab from original position
    updatedTabs.splice(this.draggedTabIndex, 1);
    // Insert at new position
    updatedTabs.splice(dropIndex, 0, draggedTab);

    // Update the dragged index
    this.draggedTabIndex = dropIndex;

    // Update the tabs array
    this.openTabs = updatedTabs;

    // Update sequences
    this.openTabs.forEach((tab, idx) => {
      tab.sequence = idx + 1;
    });

    // Update active tab index
    if (this.activeTabIndex === this.draggedTabIndex) {
      this.activeTabIndex = dropIndex;
    } else if (
      this.activeTabIndex > this.draggedTabIndex &&
      this.activeTabIndex <= dropIndex
    ) {
      this.activeTabIndex--;
    } else if (
      this.activeTabIndex < this.draggedTabIndex &&
      this.activeTabIndex >= dropIndex
    ) {
      this.activeTabIndex++;
    }
  }

  onTabDragLeave(index: number) {
    // Optional: Add specific drag leave behavior if needed
  }

  onTabDrop(dropIndex: number) {
    if (
      this.isFreeze ||
      this.draggedTabIndex === null ||
      this.draggedTabIndex === dropIndex
    ) {
      return;
    }

    // Reset drag states
    this.draggedTabIndex = null;
  }

  onTabDragOver(event: DragEvent) {
    if (this.isFreeze) return;
    event.preventDefault();
  }

  onSectionDragStart(tabId: string | number, sectionIndex: number) {
    if (this.isFreeze) return;
    this.draggedSectionIndex = sectionIndex;
    this.draggedTabId = tabId;
  }

  onSectionDragEnd() {
    this.draggedSectionIndex = null;
    this.draggedTabId = null;
  }

  onSectionDragEnter(tabId: string | number, dropIndex: number) {
    if (
      this.isFreeze ||
      this.draggedSectionIndex === null ||
      this.draggedTabId === null ||
      this.draggedSectionIndex === dropIndex ||
      this.draggedTabId !== tabId
    )
      return;

    const tab = this.openTabs.find(t => t.id === tabId);
    if (!tab) return;

    // Create a new array to trigger change detection
    const updatedSections = [...tab.sections];
    const draggedSection = updatedSections[this.draggedSectionIndex];

    // Remove section from original position
    updatedSections.splice(this.draggedSectionIndex, 1);
    // Insert at new position
    updatedSections.splice(dropIndex, 0, draggedSection);

    // Update the dragged index to match new position
    this.draggedSectionIndex = dropIndex;

    // Update the sections array
    tab.sections = updatedSections;

    // Update section sequences
    tab.sections.forEach((section, idx) => {
      section.sectionSequence = idx + 1;
    });
  }

  onSectionDragLeave(sectionIndex: number) {
    // Optional: Add any specific drag leave behavior if needed
  }

  onSectionDrop(tabId: string | number, dropIndex: number) {
    if (
      this.isFreeze ||
      this.draggedSectionIndex === null ||
      this.draggedTabId === null ||
      this.draggedSectionIndex === dropIndex ||
      this.draggedTabId !== tabId
    ) {
      return;
    }

    // Reset drag states
    this.draggedSectionIndex = null;
    this.draggedTabId = null;
  }

  onPromptDragStart(
    tabId: string | number,
    sectionId: string | number,
    promptIndex: number
  ) {
    if (this.isFreeze) return;
    this.draggedPromptIndex = promptIndex;
    this.draggedPromptTabId = tabId;
    this.draggedPromptSectionId = sectionId;
  }

  onPromptDragEnd() {
    this.draggedPromptIndex = null;
    this.draggedPromptTabId = null;
    this.draggedPromptSectionId = null;
  }

  onPromptDragEnter(
    tabId: string | number,
    sectionId: string | number,
    dropIndex: number
  ) {
    if (
      this.isFreeze ||
      this.draggedPromptIndex === null ||
      this.draggedPromptTabId === null ||
      this.draggedPromptSectionId === null ||
      this.draggedPromptSectionId !== sectionId || // Prevent dropping in different sections
      this.draggedPromptIndex === dropIndex
    )
      return;

    const tab = this.openTabs.find(t => t.id === tabId);
    if (!tab) return;

    const section = tab.sections.find(s => s.id === sectionId);
    if (!section) return;

    // Same section reordering
    const updatedPrompts = [...section.prompts];
    const draggedPrompt = updatedPrompts[this.draggedPromptIndex];

    // Remove prompt from original position
    updatedPrompts.splice(this.draggedPromptIndex, 1);
    // Insert at new position
    updatedPrompts.splice(dropIndex, 0, draggedPrompt);

    // Update the dragged index
    this.draggedPromptIndex = dropIndex;

    // Update the prompts array
    section.prompts = updatedPrompts;

    // Update prompt sequences
    section.prompts.forEach((prompt, idx) => {
      prompt.promptSequence = idx + 1;
    });
  }

  onPromptDragLeave(promptIndex: number) {
    // Optional: Add specific drag leave behavior if needed
  }

  onPromptDrop(
    tabId: string | number,
    sectionId: string | number,
    dropIndex: number
  ) {
    if (
      this.isFreeze ||
      this.draggedPromptIndex === null ||
      this.draggedPromptTabId === null ||
      this.draggedPromptSectionId === null ||
      this.draggedPromptSectionId !== sectionId // Ensure same section
    ) {
      return;
    }

    // Reset drag states
    this.draggedPromptIndex = null;
    this.draggedPromptTabId = null;
    this.draggedPromptSectionId = null;
  }
}
