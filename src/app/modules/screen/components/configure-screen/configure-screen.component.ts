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
  sequence: number;
  currentGroupId?: number;
  selectedGroupId?: number | null;
  [key: string]: any;
}

interface Prompt {
  id: string | number;
  name: string;
  type: string;
  selected?: boolean;
  sequence?: number;
  groupId?: number;
  [key: string]: any;
}

interface GroupData {
  [key: number]: number;
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
  currentGroupId: number = 0;
  isGroupingMode: boolean = false;
  currentGlobalGroupId: number = 0;
  groupColors: string[] = [
    '#8BB9DD', // Soft blue
    '#98D4BB', // Mint green
    '#F2B6B6', // Soft pink
    '#B6CCF2', // Light periwinkle
    '#E2C799', // Warm sand
    '#C3B1E1', // Soft purple
    '#9DDBAD', // Sage green
    '#F2D4C2', // Peach
  ];
  selectedGroupId: number | null = null;

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
    this.initializeSections();
    this.getTabsData();
  }

  initializeSections() {
    if (this.openTabs) {
      this.openTabs.forEach(tab => {
        tab.sections.forEach(section => {
          section.currentGroupId = 0;
          section.selectedGroupId = null;
        });
      });
    }
  }

  patchScreenConfiguration(configData: any[]) {
    // Sort config data by tab sequence
    configData.sort((a, b) => a.sequence - b.sequence);

    // Create a deep copy of tabsData to work with
    const patchedTabs = JSON.parse(JSON.stringify(this.tabsData));

    // Process each tab in the configuration
    configData.forEach(configTab => {
      const tab = patchedTabs.find(
        (t: TabData) => String(t.id) === String(configTab.id)
      );
      if (tab) {
        // Set tab sequence
        tab.sequence = configTab.sequence;

        // Sort sections by sequence
        configTab.sections.sort((a: any, b: any) => a.sequence - b.sequence);

        // Process each section in the configuration
        configTab.sections.forEach((configSection: any) => {
          const section = tab.sections.find(
            (s: Section) => String(s.id) === String(configSection.id)
          );
          if (section) {
            // Set section sequence
            section.sequence = configSection.sequence;

            // Sort prompts by sequence
            configSection.prompts.sort(
              (a: any, b: any) => a.sequence - b.sequence
            );

            // Create a map of configured prompts with their sequences
            const sequenceMap = new Map(
              configSection.prompts.map((p: any) => [String(p.id), p.sequence])
            );

            // Update prompts based on configuration
            section.prompts = section.prompts.map((prompt: Prompt) => {
              const isConfigured = sequenceMap.has(String(prompt.id));
              return {
                ...prompt,
                selected: isConfigured,
                sequence: isConfigured
                  ? sequenceMap.get(String(prompt.id))
                  : null,
              };
            });

            // Sort prompts: configured prompts first (by sequence), then unconfigured prompts
            section.prompts.sort((a: Prompt, b: Prompt) => {
              if (a.selected && b.selected) {
                return (a.sequence || 0) - (b.sequence || 0);
              }
              if (a.selected) return -1;
              if (b.selected) return 1;
              return 0;
            });

            // Update section's selectAll status
            section.selectAll = section.prompts.every(
              (p: Prompt) => p.selected
            );
          }
        });

        // Sort sections based on sequence
        tab.sections.sort(
          (a: Section, b: Section) => (a.sequence || 0) - (b.sequence || 0)
        );
      }
    });

    // Filter and sort tabs
    this.openTabs = patchedTabs
      .filter((tab: TabData) =>
        configData.some(configTab => String(configTab.id) === String(tab.id))
      )
      .sort((a: TabData, b: TabData) => (a.sequence || 0) - (b.sequence || 0));

    // Set active tab to first tab
    if (this.openTabs.length > 0) {
      this.activeTabIndex = 0;
      this.selectedTab = this.openTabs[0];
    }

    // Store the patched data
    this.tabsData = patchedTabs;
    this.refactoredTabData = JSON.parse(JSON.stringify(patchedTabs));
    this.hasReceivedConfig = true;

    // Initialize expanded sections for configured sections
    this.openTabs.forEach(tab => {
      tab.sections.forEach(section => {
        if (section.prompts.some(prompt => prompt.selected)) {
          this.expandedSections[String(section.id)] = true;
        }
      });
    });
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
          // Set all prompts as unselected by default
          const tabsWithPrompts = response.data.map((tab: TabData) => ({
            ...tab,
            sequence: 0,
            sections: tab.sections?.map((section: Section) => ({
              ...section,
              selectAll: false,
              prompts: section.prompts?.map((prompt: Prompt) => ({
                ...prompt,
                selected: false,
              })),
            })),
          }));
          this.tabsData = tabsWithPrompts;
          this.refactoredTabData = JSON.parse(JSON.stringify(tabsWithPrompts));
        }
      })
      .then(() => {
        this.screenService
          .getScreenConfiguration(this.orgId, this.screenId)
          .then(response => {
            if (this.globalService.handleSuccessService(response)) {
              if (response.data && response.data.length > 0) {
                this.patchScreenConfiguration(response.data);
              }
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
          const filteredSections = tab.sections
            .map(section => {
              // Filter prompts to only keep selected ones
              const selectedPrompts = section.prompts
                .filter((prompt: Prompt) => prompt.selected)
                .map((prompt: any, promptIndex: number) => ({
                  ...prompt,
                  sequence: promptIndex + 1,
                }));

              return {
                ...section,
                prompts: selectedPrompts,
                selectAll: selectedPrompts.length === section.prompts.length,
              };
            })
            .filter(section => section.prompts.length > 0); // Remove sections with no selected prompts

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
      // Restore all prompts while maintaining selection state and order
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

        // Restore tabs from original data while maintaining selection state and order
        this.openTabs = this.tabsData
          .filter(tab => this.openTabs.some(openTab => openTab.id === tab.id))
          .map(tab => {
            const tabCopy = JSON.parse(JSON.stringify(tab));
            tabCopy.sections = tabCopy.sections.map((section: Section) => {
              // Get all prompts and sort them based on selection
              const allPrompts = section.prompts.map(prompt => ({
                ...prompt,
                selected: selectionMap.has(prompt.id)
                  ? selectionMap.get(prompt.id)
                  : false,
              }));

              // Sort prompts to put selected ones first
              const sortedPrompts = [
                ...allPrompts.filter(p => p.selected),
                ...allPrompts.filter(p => !p.selected),
              ];

              // Update sequences
              sortedPrompts.forEach((prompt, index) => {
                prompt.sequence = index + 1;
              });

              return {
                ...section,
                selectAll: allPrompts.every(prompt => prompt.selected),
                prompts: sortedPrompts,
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
        sequence: sectionIndex,
        prompts: section.prompts
          .filter((prompt: any) => prompt.selected)
          .map((prompt: any, promptIndex: number) => ({
            id: prompt.id,
            name: prompt.name,
            selected: prompt.selected,
            sequence: promptIndex,
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
      section.sequence = idx + 1;
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
      prompt.sequence = idx + 1;
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

  toggleGroupingMode() {
    if (!this.isFreeze) {
      this.globalService.handleErrorService({
        message: 'Please lock the screen first to use grouping functionality',
      });
      return;
    }
    this.isGroupingMode = !this.isGroupingMode;
    if (!this.isGroupingMode) {
      // Reset all section group states
      this.openTabs.forEach(tab => {
        tab.sections.forEach(section => {
          section.selectedGroupId = null;
        });
      });
    } else {
      // Initialize group state for each section
      this.openTabs.forEach(tab => {
        tab.sections.forEach(section => {
          section.selectedGroupId = null;
        });
      });
    }
  }

  handlePromptGrouping(prompt: Prompt, section: Section) {
    if (!this.isFreeze || !this.isGroupingMode) return;

    if (section.selectedGroupId === null) {
      // Check if there are enough selected prompts before creating a new group
      const selectedPrompts = section.prompts.filter(p => p.selected);
      if (selectedPrompts.length < 2) {
        this.globalService.handleErrorService({
          message: 'Please select at least 2 prompts before creating a group',
        });
        return;
      }
      // Create a new group using the global counter
      prompt.groupId = this.currentGlobalGroupId;
      section.selectedGroupId = this.currentGlobalGroupId;
      this.currentGlobalGroupId++;
    } else if (prompt.groupId === section.selectedGroupId) {
      // Check if removing this prompt would leave only one prompt in the group
      const promptsInGroup = section.prompts.filter(
        p => p.groupId === section.selectedGroupId
      );
      if (promptsInGroup.length <= 2) {
        // If only 2 or fewer prompts in group, remove the entire group
        promptsInGroup.forEach(p => (p.groupId = undefined));
        section.selectedGroupId = null;
      } else {
        // Otherwise just remove this prompt from group
        prompt.groupId = undefined;
      }
    } else {
      // Add to current selected group
      prompt.groupId = section.selectedGroupId;
    }
  }

  selectGroup(groupId: number, section: Section) {
    if (!this.isFreeze || !this.isGroupingMode) return;
    section.selectedGroupId =
      section.selectedGroupId === groupId ? null : groupId;
  }

  getGroupedPrompts(section: Section): GroupData {
    const groups: GroupData = {};
    section.prompts.forEach(prompt => {
      if (
        prompt.groupId !== undefined &&
        prompt.groupId !== null &&
        !isNaN(prompt.groupId)
      ) {
        groups[prompt.groupId] = (groups[prompt.groupId] || 0) + 1;
      }
    });
    return groups;
  }

  getPromptGroupStyle(prompt: Prompt, section: Section): any {
    if (prompt.groupId === undefined || prompt.groupId === null) {
      return {};
    }

    const isSelected = section.selectedGroupId === prompt.groupId;
    const color = this.groupColors[prompt.groupId % this.groupColors.length];
    return {
      'border-color': color,
      'border-width': '1px',
      'border-style': 'solid',
      'box-shadow': isSelected ? `0 0 0 1px ${color}33` : 'none',
      'background-color': isSelected ? `${color}10` : `${color}05`,
      opacity: isSelected ? 1 : 0.9,
    };
  }

  clearAllGroups() {
    if (!this.isFreeze) {
      this.globalService.handleErrorService({
        message: 'Please lock the screen first to clear groups',
      });
      return;
    }
    this.openTabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(prompt => {
          prompt.groupId = undefined;
        });
        section.selectedGroupId = null;
      });
    });
    this.currentGlobalGroupId = 0; // Reset the global group counter
    this.isGroupingMode = false;
  }

  hasMinimumPromptsSelected(section: Section): boolean {
    const selectedPrompts = section.prompts.filter(prompt => prompt.selected);
    return selectedPrompts.length >= 2;
  }
}
