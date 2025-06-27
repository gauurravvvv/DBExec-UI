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
  sequence?: number;
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
  colorIndex?: number;
  isMandatory?: boolean;
  [key: string]: any;
}

interface GroupData {
  [key: number]: number;
}

interface ConfigPrompt {
  id: string | number;
  sequence: number;
  isGrouped: boolean;
  groupId: number;
  color: string | null;
  isMandatory?: boolean;
}

interface SectionGroupColor {
  groupId: number;
  colorIndex: number;
  sectionId: number | string;
}

interface SectionGroupData {
  sectionId: number | string;
  groupId: number;
  color: string;
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
  selectedPrompts: { [sectionId: string]: Prompt[] } = {};
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
  groupColors: string[] = [
    '#8BB9DD', // Soft blue
    '#98D4BB', // Mint green
    '#F2B6B6', // Soft pink
    '#B6CCF2', // Light periwinkle
    '#E2C799', // Warm sand
    '#C3B1E1', // Soft purple
    '#9DDBAD', // Sage green
    '#F2D4C2', // Peach
    '#FFB6C1', // Light pink
    '#87CEEB', // Sky blue
    '#DDA0DD', // Plum
    '#F0E68C', // Khaki
    '#B0E0E6', // Powder blue
    '#FFDAB9', // Peach puff
    '#C9E4CA', // Pale green
    '#E6E6FA', // Lavender
  ];
  selectedGroupId: number | null = null;
  activeGroupId: number | null = null;
  activeGroupSectionId: string | number | null = null;

  // Add Object to component to use in template
  protected readonly Object = Object;

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

    // Reset the current group ID counter
    this.currentGroupId = 0;

    // First pass: Collect all section-specific group colors
    const sectionGroupColors = new Map<string, Map<number, string>>();
    const sectionColorIndices = new Map<string, Map<number, number>>();

    // Initialize color tracking for each section
    configData.forEach(configTab => {
      configTab.sections.forEach((configSection: any) => {
        const sectionColors = new Map<number, string>();
        const colorIndices = new Map<number, number>();
        sectionGroupColors.set(String(configSection.id), sectionColors);
        sectionColorIndices.set(String(configSection.id), colorIndices);

        // First collect all colors for this section
        const sectionGroupsWithColors = new Set<number>();
        configSection.prompts.forEach((prompt: ConfigPrompt) => {
          if (prompt.isGrouped && prompt.groupId > 0 && prompt.color) {
            sectionColors.set(prompt.groupId, prompt.color);
            sectionGroupsWithColors.add(prompt.groupId);

            // Find the color index in our palette
            const colorIndex = this.groupColors.findIndex(
              c => c === prompt.color
            );
            if (colorIndex !== -1) {
              colorIndices.set(prompt.groupId, colorIndex);
            }
          }
        });

        // Verify each group in this section has its own color
        configSection.prompts.forEach((prompt: ConfigPrompt) => {
          if (
            prompt.isGrouped &&
            prompt.groupId > 0 &&
            !sectionGroupsWithColors.has(prompt.groupId)
          ) {
            // Group missing color assignment
          }
        });
      });
    });

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
            section.currentGroupId = 0;
            section.selectedGroupId = null;

            // Get this section's color indices
            const colorIndices = sectionColorIndices.get(
              String(configSection.id)
            );
            const sectionColors = sectionGroupColors.get(
              String(configSection.id)
            );

            // Sort prompts by sequence
            configSection.prompts.sort(
              (a: any, b: any) => a.sequence - b.sequence
            );

            // Create a map of configured prompts with their data
            const promptConfigMap = new Map<string, ConfigPrompt>(
              configSection.prompts.map((p: ConfigPrompt) => [String(p.id), p])
            );

            // Track groups in this section to ensure they get their own colors
            const sectionGroups = new Set<number>();

            // Update prompts based on configuration
            section.prompts = section.prompts.map((prompt: Prompt) => {
              const configPrompt = promptConfigMap.get(String(prompt.id));
              const isConfigured = configPrompt !== undefined;

              if (isConfigured) {
                if (configPrompt.isGrouped && configPrompt.groupId > 0) {
                  // Get the color index for this group in this section
                  let colorIndex = colorIndices?.get(configPrompt.groupId);

                  // If no color index found, assign a new one for this section's group
                  if (
                    colorIndex === undefined &&
                    !sectionGroups.has(configPrompt.groupId)
                  ) {
                    // Find the first unused color index
                    colorIndex = this.groupColors.findIndex(
                      (_, idx) =>
                        !Array.from(colorIndices?.values() || []).includes(idx)
                    );
                    if (colorIndex !== -1) {
                      colorIndices?.set(configPrompt.groupId, colorIndex);
                    }
                  }

                  sectionGroups.add(configPrompt.groupId);

                  // Update current group ID counter if needed
                  section.currentGroupId = Math.max(
                    section.currentGroupId,
                    configPrompt.groupId
                  );

                  return {
                    ...prompt,
                    selected: true,
                    sequence: configPrompt.sequence,
                    groupId: configPrompt.groupId,
                    colorIndex: colorIndex,
                    isMandatory: configPrompt.isMandatory || false,
                  };
                }

                return {
                  ...prompt,
                  selected: true,
                  sequence: configPrompt.sequence,
                  groupId: undefined,
                  colorIndex: undefined,
                  isMandatory: configPrompt.isMandatory || false,
                };
              }

              return {
                ...prompt,
                selected: false,
                sequence: null,
                groupId: undefined,
                colorIndex: undefined,
                isMandatory: false,
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

            // Update the global currentGroupId if needed
            this.currentGroupId = Math.max(
              this.currentGroupId,
              section.currentGroupId
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

    // Initialize lastSavedConfig with the current configuration
    this.lastSavedConfig = this.getCurrentConfiguration();

    // Increment currentGroupId to be ready for new groups
    this.currentGroupId++;
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
      const closedTab = this.openTabs[index];
      const closedTabSequence = closedTab?.sequence || 0;

      // Remove the tab
      this.openTabs = this.openTabs.filter((_, i) => i !== index);

      // Resequence remaining tabs - only update sequence for tabs that were after the closed tab
      this.openTabs = this.openTabs.map(tab => {
        const currentSequence = tab.sequence || 0;
        if (currentSequence > closedTabSequence) {
          return {
            ...tab,
            sequence: currentSequence - 1,
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
      const selectedTabs = JSON.parse(JSON.stringify(this.openTabs));

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
      // Store the current configuration state for comparison
      const currentConfig = this.getCurrentConfiguration();

      // Clear selections
      this.selectedPrompts = {};

      // Restore tabs from original data while preserving selected states
      this.openTabs = this.tabsData
        .filter(tab => this.openTabs.some(openTab => openTab.id === tab.id))
        .map(tab => {
          const existingTab = this.openTabs.find(t => t.id === tab.id);
          const tabCopy = JSON.parse(JSON.stringify(tab));

          tabCopy.sequence = existingTab?.sequence;
          tabCopy.sections = tabCopy.sections.map((section: Section) => {
            const existingSection = existingTab?.sections.find(
              s => s.id === section.id
            );

            return {
              ...section,
              sequence: existingSection?.sequence,
              prompts: section.prompts.map((prompt: Prompt) => {
                const existingPrompt = existingSection?.prompts.find(
                  p => p.id === prompt.id
                );
                return {
                  ...prompt,
                  selected: existingPrompt ? true : false,
                  sequence: existingPrompt?.sequence,
                  groupId: existingPrompt?.groupId,
                  colorIndex: existingPrompt?.colorIndex,
                };
              }),
              selectAll: existingSection
                ? section.prompts.every(p =>
                    existingSection.prompts.some(ep => ep.id === p.id)
                  )
                : false,
            };
          });
          return tabCopy;
        });

      // Sort tabs based on sequence
      this.openTabs.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

      // Store the new configuration state
      this.lastSavedConfig = this.getCurrentConfiguration();
    }
  }

  // Add new properties to track configuration changes
  private lastSavedConfig: string = '';

  private getCurrentConfiguration(): string {
    return JSON.stringify(
      this.openTabs.map(tab => ({
        tab: tab.id,
        sequence: tab.sequence,
        sections: tab.sections.map((section, sectionIndex) => ({
          id: section.id,
          name: section.name,
          sequence: sectionIndex,
          prompts: section.prompts
            .filter(p => p.selected)
            .map((prompt, promptIndex) => ({
              id: prompt.id,
              name: prompt.name,
              selected: prompt.selected,
              sequence: promptIndex,
              isGrouped:
                prompt.groupId !== undefined && prompt.groupId !== null,
              groupId: prompt.groupId || 0,
              colorIndex: prompt.colorIndex,
              isMandatory: prompt.isMandatory || false,
            })),
        })),
      }))
    );
  }

  hasChanges(): boolean {
    // For new configurations (no existing config)
    if (!this.hasReceivedConfig && this.hasSelectedPrompts()) {
      return true;
    }

    // If we haven't received the initial config yet, no changes
    if (!this.hasReceivedConfig) {
      return false;
    }

    // Get current configuration state
    const currentConfig = this.getCurrentConfiguration();

    // Compare with last saved state
    const hasConfigChanges = currentConfig !== this.lastSavedConfig;

    return hasConfigChanges;
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
      this.selectedPrompts = {};
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
      sections: tab.sections.map((section: any, sectionIndex: number) => {
        // Create a map of old group IDs to new sequential group IDs (starting from 1) for this section
        const groupIdMap = new Map<number, number>();
        let nextGroupId = 1;

        // First pass: build the mapping of group IDs
        section.prompts
          .filter(
            (prompt: any) =>
              prompt.selected &&
              prompt.groupId !== undefined &&
              prompt.groupId !== null
          )
          .forEach((prompt: any) => {
            if (!groupIdMap.has(prompt.groupId)) {
              groupIdMap.set(prompt.groupId, nextGroupId++);
            }
          });

        return {
          id: section.id,
          name: section.name,
          sequence: sectionIndex,
          prompts: section.prompts
            .filter((prompt: any) => prompt.selected)
            .map((prompt: any, promptIndex: number) => {
              const isGrouped =
                prompt.groupId !== undefined && prompt.groupId !== null;

              // Base prompt data
              const promptData = {
                id: prompt.id,
                name: prompt.name,
                selected: prompt.selected,
                sequence: promptIndex,
                isGrouped: isGrouped,
                // Use the new mapped group ID if grouped, otherwise 0
                groupId: isGrouped ? groupIdMap.get(prompt.groupId) : 0,
                color: undefined as string | undefined,
                isMandatory: prompt.isMandatory || false,
              };

              // Add color information if prompt is in a group
              if (promptData.isGrouped && prompt.colorIndex !== undefined) {
                promptData.color = this.groupColors[prompt.colorIndex];
              }

              return promptData;
            }),
        };
      }),
    }));

    //save screen configuration
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

  isGroupActiveInSection(section: Section, groupId: number): boolean {
    return section.prompts.some(p => p.groupId === groupId);
  }

  hasSectionGroups(section: Section): boolean {
    return section.prompts.some(
      p => p.groupId !== undefined && p.groupId !== null
    );
  }

  handlePromptSelection(event: MouseEvent, prompt: Prompt, section: Section) {
    if (!this.isFreeze) return;

    // Only allow group operations with Ctrl/Cmd key
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();

      // Regular multi-selection behavior
      if (!this.selectedPrompts[section.id]) {
        this.selectedPrompts[section.id] = [];
      }

      const index = this.selectedPrompts[section.id].findIndex(
        p => p.id === prompt.id
      );
      if (index === -1) {
        this.selectedPrompts[section.id].push(prompt);
      } else {
        this.selectedPrompts[section.id].splice(index, 1);
      }

      // If active group exists, handle group operations
      if (this.activeGroupId !== null) {
        if (!this.isGroupActiveInSection(section, this.activeGroupId)) {
          return; // Don't allow selection in other sections
        }

        // Toggle prompt in/out of the active group
        if (prompt.groupId === this.activeGroupId) {
          // Remove from group
          prompt.groupId = undefined;
          prompt.colorIndex = undefined;
          // Check if group still has enough prompts
          this.validateAndCleanupGroup(section, this.activeGroupId);
        } else {
          // Add to group (handle case where prompt might be in another group)
          const oldGroupId = prompt.groupId;

          // Find the color index used by the active group in this section
          const activeGroupColorIndex = section.prompts.find(
            p => p.groupId === this.activeGroupId && p.colorIndex !== undefined
          )?.colorIndex;

          prompt.groupId = this.activeGroupId;
          prompt.colorIndex = activeGroupColorIndex;

          // If prompt was removed from another group, check if that group still has enough prompts
          if (oldGroupId !== undefined && oldGroupId !== null) {
            this.validateAndCleanupGroup(section, oldGroupId);
          }
        }
      }
    }
  }

  validateAndCleanupGroup(section: Section, groupId: number) {
    // Count prompts in the group
    const promptsInGroup = section.prompts.filter(p => p.groupId === groupId);

    // If less than 2 prompts, remove the group
    if (promptsInGroup.length < 2) {
      // Remove group from all prompts in this group
      section.prompts.forEach(prompt => {
        if (prompt.groupId === groupId) {
          prompt.groupId = undefined;
          prompt.colorIndex = undefined;
        }
      });

      // If this was the active group, deactivate it
      if (this.activeGroupId === groupId) {
        this.activeGroupId = null;
    this.activeGroupSectionId = null;
      }
    }
  }

  selectGroupForAdding(groupId: number, section: Section) {
    if (!this.isFreeze) return;

    // If clicking the same group in the same section, deactivate
    if (this.activeGroupId === groupId && this.activeGroupSectionId === section.id) {
      this.activeGroupId = null;
    this.activeGroupSectionId = null;
      this.activeGroupSectionId = null;
    } else {
      // Only activate if the group belongs to this section
      if (this.isGroupActiveInSection(section, groupId)) {
        this.activeGroupId = groupId;
        this.activeGroupSectionId = section.id;
      }
    }

    // Clear any existing selections
    this.selectedPrompts[section.id] = [];
  }

  isPromptSelected(prompt: Prompt, section: Section): boolean {
    return (
      this.selectedPrompts[section.id]?.some(p => p.id === prompt.id) || false
    );
  }

  canGroupPrompts(section: Section): boolean {
    return this.selectedPrompts[section.id]?.length >= 2 || false;
  }

  groupSelectedPrompts(section: Section) {
    if (!this.canGroupPrompts(section)) return;

    const nextColorIndex = this.getNextAvailableColorIndex();
    if (nextColorIndex === null) {
      return;
    }

    const newGroupId = this.currentGroupId++;

    this.selectedPrompts[section.id].forEach(prompt => {
      prompt.groupId = newGroupId;
      prompt.colorIndex = nextColorIndex;
    });

    // Clear selection after grouping
    this.selectedPrompts[section.id] = [];
  }

  getPromptMandatoryStyle(prompt: Prompt): any {
    if (!prompt.isMandatory) {
      return {};
    }

    const color = '#ff4444'; // Red color for mandatory
    return {
      'border-color': color,
      'border-width': '2px',
      'border-style': 'solid',
      'box-shadow': `0 0 0 1px ${color}33`,
      'background-color': `${color}10`,
    };
  }

  getGroupBulletStyle(groupId: number, section?: Section): any {
    // For section-specific dots, find the prompt in this section
    if (section) {
      // ONLY use prompts from this specific section and group
      const sectionPrompts = section.prompts.filter(p => {
        const matches = p.selected && p.groupId === groupId;
        return matches;
      });

      if (sectionPrompts.length > 0) {
        const prompt = sectionPrompts[0];
        if (prompt.colorIndex !== undefined) {
          const color = this.groupColors[prompt.colorIndex];
          const isActive = this.activeGroupId === groupId && this.activeGroupSectionId === section.id;

          return {
            'background-color': color,
            opacity: isActive ? '1' : '0.7',
            animation: isActive
              ? 'quickPulse 0.4s ease-in-out infinite'
              : 'none',
          };
        }
      }

      // If we have a section but couldn't find a color, return empty style
      return {};
    }

    // For accordion header dots (when no section is provided)
    // Find the section in the current tab that contains this group
    const currentTab = this.openTabs[this.activeTabIndex];
    if (!currentTab) {
      return {};
    }

    // Find the section that contains this group in the current tab
    const sectionWithGroup = currentTab.sections.find(s =>
      s.prompts.some(p => p.selected && p.groupId === groupId)
    );

    if (sectionWithGroup) {
      // Recursively call with the found section to get the correct color
      return this.getGroupBulletStyle(groupId, sectionWithGroup);
    }

    return {};
  }

  getPromptGroupStyle(prompt: Prompt, section: Section): any {
    if (prompt.groupId === undefined || prompt.groupId === null) {
      return {};
    }

    const colorIndex = this.getColorIndexForGroup(prompt.groupId, section);
    if (colorIndex === null) return {};

    const color = this.groupColors[colorIndex];
    const isActive = this.activeGroupId === prompt.groupId && 
                     this.activeGroupSectionId === section.id;

    return {
      'border-color': color,
      'border-width': '2px',
      'border-style': 'solid',
      'box-shadow': `0 0 0 1px ${color}33`,
      'background-color': `${color}10`,
      opacity: isActive ? '1' : '0.7',
    };
  }

  getPromptGroupDotStyle(prompt: Prompt, section: Section): any {
    if (prompt.groupId === undefined || prompt.groupId === null) {
      return { display: 'none' };
    }

    const colorIndex = this.getColorIndexForGroup(prompt.groupId, section);
    if (colorIndex === null) return { display: 'none' };

    const color = this.groupColors[colorIndex];
    const isActive = this.activeGroupId === prompt.groupId && 
                     this.activeGroupSectionId === section.id;

    return {
      display: 'block',
      'background-color': color,
      opacity: isActive ? '1' : '0.7',
      animation: isActive
        ? 'groupDotGlow 1.5s ease-in-out infinite'
        : 'none',
      'box-shadow': isActive
        ? `0 0 8px ${color}, 0 0 16px ${color}66, 0 0 24px ${color}33`
        : 'none',
    };
  }

  // Helper method to get section-specific color
  private getSectionGroupColor(
    sectionId: string | number,
    groupId: number
  ): string | null {
    // Find the section in the current tab
    const currentTab = this.openTabs[this.activeTabIndex];
    if (!currentTab) return null;

    const section = currentTab.sections.find(s => s.id === sectionId);
    if (!section) return null;

    // Find the prompt in this specific section with this group ID
    const prompt = section.prompts.find(
      p => p.selected && p.groupId === groupId
    );
    if (!prompt || prompt.colorIndex === undefined) return null;

    return this.groupColors[prompt.colorIndex];
  }

  getGroupedPromptsCount(section: Section): { [key: number]: number } {
    const groups: { [key: number]: number } = {};
    section.prompts.forEach(prompt => {
      if (prompt.groupId !== undefined && prompt.groupId !== null) {
        groups[prompt.groupId] = (groups[prompt.groupId] || 0) + 1;
      }
    });
    return groups;
  }

  clearAllGroups() {
    if (!this.isFreeze) return;

    this.openTabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(prompt => {
          prompt.groupId = undefined;
          prompt.colorIndex = undefined;
        });
      });
    });
    this.selectedPrompts = {};
    this.activeGroupId = null;
    this.activeGroupSectionId = null;
  }

  clearSectionGroups(section: Section) {
    if (!this.isFreeze) return;

    // Clear all groups in this section
    section.prompts.forEach(prompt => {
      if (prompt.groupId !== undefined && prompt.groupId !== null) {
        prompt.groupId = undefined;
        prompt.colorIndex = undefined;
      }
    });

    // Reset active group if it was in this section
    if (this.activeGroupId !== null) {
      const isGroupInSection = section.prompts.some(
        p => p.groupId === this.activeGroupId
      );
      if (isGroupInSection) {
        this.activeGroupId = null;
    this.activeGroupSectionId = null;
      }
    }
  }

  hasAnyGroups(): boolean {
    return this.openTabs.some(tab =>
      tab.sections.some(section =>
        section.prompts.some(
          prompt => prompt.groupId !== undefined && prompt.groupId !== null
        )
      )
    );
  }

  getNextAvailableColorIndex(): number | null {
    // Get all currently used color indices across all groups
    const currentlyUsedIndices = new Set<number>();

    this.openTabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(prompt => {
          if (
            prompt.colorIndex !== undefined &&
            prompt.groupId !== undefined &&
            prompt.groupId !== null
          ) {
            currentlyUsedIndices.add(prompt.colorIndex);
          }
        });
      });
    });

    // Find the first unused color index
    for (let i = 0; i < this.groupColors.length; i++) {
      if (!currentlyUsedIndices.has(i)) {
        return i;
      }
    }

    // If all colors are used, find the least used color
    const colorUsageCount = new Map<number, number>();
    for (let i = 0; i < this.groupColors.length; i++) {
      colorUsageCount.set(i, 0);
    }

    this.openTabs.forEach(tab => {
      tab.sections.forEach(section => {
        section.prompts.forEach(prompt => {
          if (
            prompt.colorIndex !== undefined &&
            prompt.groupId !== undefined &&
            prompt.groupId !== null
          ) {
            const count = colorUsageCount.get(prompt.colorIndex) || 0;
            colorUsageCount.set(prompt.colorIndex, count + 1);
          }
        });
      });
    });

    // Find the color with minimum usage
    let minUsage = Infinity;
    let minUsageIndex = 0;
    colorUsageCount.forEach((count, index) => {
      if (count < minUsage) {
        minUsage = count;
        minUsageIndex = index;
      }
    });

    return minUsageIndex;
  }

  getColorIndexForGroup(groupId: number, section?: Section): number | null {
    // If section is provided, only look for color index within that section
    if (section) {
      // First try to find an existing prompt in this section with this group ID
      const existingPrompt = section.prompts.find(
        prompt => prompt.groupId === groupId && prompt.colorIndex !== undefined
      );
      if (existingPrompt && existingPrompt.colorIndex !== undefined) {
        return existingPrompt.colorIndex;
      }
    }

    // If no section provided or no color found in section, get next available
    const nextIndex = this.getNextAvailableColorIndex();
    return nextIndex;
  }

  assignColorToGroup(groupId: number): void {
    const colorIndex = this.getNextAvailableColorIndex();
    if (colorIndex !== null) {
      // Assign this color index to all prompts in the group
      this.openTabs.forEach(tab => {
        tab.sections.forEach(section => {
          section.prompts.forEach(prompt => {
            if (prompt.groupId === groupId) {
              prompt.colorIndex = colorIndex;
            }
          });
        });
      });
    }
  }

  isColorInUse(colorIndex: number): boolean {
    return this.openTabs.some(tab =>
      tab.sections.some(section =>
        section.prompts.some(prompt => prompt.colorIndex === colorIndex)
      )
    );
  }

  toggleMandatory(prompt: Prompt, event: MouseEvent) {
    event.stopPropagation(); // Prevent card click event
    event.preventDefault(); // Prevent context menu from appearing

    // Only allow toggling if screen is frozen
    if (!this.isFreeze) return;

    // Toggle the mandatory state
    prompt.isMandatory = !prompt.isMandatory;

    // If this prompt is part of a group, optionally update all prompts in the group
    if (prompt.groupId !== undefined && prompt.groupId !== null) {
      const section = this.findSectionContainingPrompt(prompt);
      if (section) {
        // Update all prompts in the same group
        section.prompts.forEach(p => {
          if (p.groupId === prompt.groupId) {
            p.isMandatory = prompt.isMandatory;
          }
        });
      }
    }
  }

  onPromptRightClick(event: MouseEvent, prompt: Prompt) {
    event.preventDefault(); // Prevent context menu
    event.stopPropagation();
    
    // Only allow right-click toggle if screen is frozen
    if (!this.isFreeze) return;
    
    this.toggleMandatory(prompt, event);
  }

  // Helper method to find the section containing a prompt
  private findSectionContainingPrompt(prompt: Prompt): Section | null {
    for (const tab of this.openTabs) {
      for (const section of tab.sections) {
        if (section.prompts.some(p => p.id === prompt.id)) {
          return section;
        }
      }
    }
    return null;
  }
}
