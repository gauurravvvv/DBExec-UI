import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { PROMPT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { SectionService } from 'src/app/modules/section/services/section.service';
import { TabService } from 'src/app/modules/tab/services/tab.service';
import { PromptService } from '../../services/prompt.service';

interface TreeNode {
  key: string;
  label: string;
  data: any;
  children?: TreeNode[];
  expanded?: boolean;
  selectable?: boolean;
  leaf?: boolean;
  type?: 'tab' | 'section';
}

@Component({
  selector: 'app-list-prompt',
  templateUrl: './list-prompt.component.html',
  styleUrls: ['./list-prompt.component.scss'],
})
export class ListPromptComponent implements OnInit {
  users: any[] = [];
  filteredPrompts: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  pages: number[] = [];
  searchTerm: string = '';
  selectedStatus: number | null = null;
  showDeleteConfirm = false;
  promptToDelete: string | null = null;
  Math = Math;
  organisations: any[] = [];
  databases: any[] = [];
  prompts: any[] = [];
  tabs: any[] = [];
  sections: any[] = [];
  selectedOrg: any = {};
  selectedDatabase: any = {};
  selectedTab: any = {};
  selectedSection: any = {};
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  tabTreeNodes: TreeNode[] = [];
  selectedNode: TreeNode | null = null;

  treeExpanded: boolean = false;

  statusFilterItems: MenuItem[] = [
    {
      label: 'All',
      command: () => this.filterByStatus(null),
    },
    {
      label: 'Active',
      command: () => this.filterByStatus(1),
    },
    {
      label: 'Inactive',
      command: () => this.filterByStatus(0),
    },
  ];

  constructor(
    private databaseService: DatabaseService,
    private sectionService: SectionService,
    private organisationService: OrganisationService,
    private tabService: TabService,
    private router: Router,
    private globalService: GlobalService,
    private promptService: PromptService
  ) {}

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatabases();
    }
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadDatabases();
        }
      }
    });
  }

  onOrgChange(event: any) {
    this.selectedOrg = event.value;
    this.loadDatabases();
  }

  onDBChange(event: any) {
    this.selectedDatabase = event.value;
    this.currentPage = 1;
    this.loadTabs();
  }

  onTabChange(event: any) {
    const selectedNode = event.node;

    if (selectedNode.type === 'tab') {
      selectedNode.expanded = !selectedNode.expanded;
      this.selectedTab = selectedNode.data;
    } else if (selectedNode.type === 'section') {
      this.selectedSection = selectedNode.data;
      this.selectedTab = this.tabs.find(
        tab => tab.id === selectedNode.data.tabId
      );
      this.loadPrompts();
    }
  }

  loadPrompts() {
    if (!this.selectedSection) return;
    const params = {
      orgId: this.selectedOrg.id,
      sectionId: this.selectedSection.id,
    };

    this.promptService.listPrompt(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.prompts = response.data;
        this.filteredPrompts = [...this.prompts];
        this.totalItems = this.prompts.length;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize);
        this.generatePageNumbers();
        this.applyFilters();
      }
    });
  }

  loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.databases = response.data;
        if (this.databases.length > 0) {
          this.selectedDatabase = this.databases[0];
          this.loadTabs();
        }
      }
    });
  }

  loadTabs() {
    if (!this.selectedDatabase) return;
    const params = {
      orgId: this.selectedOrg.id,
      databaseId: this.selectedDatabase.id,
      pageNumber: 1,
      limit: 100,
    };

    this.tabService.listTab(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.tabs = response.data;
        if (this.tabs.length > 0) {
          this.selectedTab = this.tabs[0];
          this.tabTreeNodes = this.transformToTreeNodes(this.tabs);
          this.selectedNode = this.tabTreeNodes[0];
        }
      }
    });
  }

  generatePageNumbers() {
    this.pages = Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.loadTabs();
  }

  onSearch(event: any) {
    this.searchTerm = event.target.value;
    this.applyFilters();
  }

  filterByStatus(status: number | null) {
    this.selectedStatus = status;
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.prompts];
    if (this.searchTerm) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(prompt =>
        prompt.name.toLowerCase().includes(search)
      );
    }

    if (this.selectedStatus !== null) {
      filtered = filtered.filter(
        prompt => prompt.status === this.selectedStatus
      );
    }

    this.filteredPrompts = filtered;
  }

  onAddNewPrompt() {
    this.router.navigate([PROMPT.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([PROMPT.EDIT, this.selectedOrg.id, id]);
  }

  confirmDelete(id: string) {
    this.promptToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.promptToDelete = null;
  }

  proceedDelete() {
    if (this.promptToDelete) {
      this.promptService
        .deletePrompt(this.selectedOrg.id, this.promptToDelete)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.loadPrompts();
            this.showDeleteConfirm = false;
            this.promptToDelete = null;
          }
        });
    }
  }

  onEditTab(tab: any) {
    this.router.navigate([PROMPT.EDIT, this.selectedOrg.id, tab.id]);
  }

  transformToTreeNodes(tabs: any[]): TreeNode[] {
    return tabs.map(tab => ({
      key: `tab-${tab.id}`,
      label: tab.name,
      data: tab,
      expanded: false,
      type: 'tab',
      selectable: true,
      leaf: false,
      children: tab.sections?.length
        ? tab.sections.map((section: any) => ({
            key: `section-${section.id}`,
            label: section.name,
            data: section,
            type: 'section',
            selectable: true,
            leaf: true,
          }))
        : [],
    }));
  }

  onTreeClick() {
    this.treeExpanded = !this.treeExpanded;

    if (!this.treeExpanded) {
      this.tabTreeNodes.forEach(node => {
        if (node.children) {
          node.expanded = false;
        }
      });
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const dropdownElement = (event.target as HTMLElement).closest(
      '.dropdown-field'
    );
    if (!dropdownElement) {
      this.treeExpanded = false;

      this.tabTreeNodes.forEach(node => {
        if (node.children) {
          node.expanded = false;
        }
      });
    }
  }

  onConfig(id: string) {
    this.router.navigate([PROMPT.CONFIG, this.selectedOrg.id, id]);
  }
}
