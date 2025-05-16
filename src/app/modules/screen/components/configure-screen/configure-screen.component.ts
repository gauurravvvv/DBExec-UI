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
  sections: any[];
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
  isSidebarCollapsed = false;
  selectedTab: TabData | null = null;
  openTabs: TabData[] = [];
  activeTabIndex: number = 0;
  isFreeze: boolean = true;

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
        this.tabsData = [...response.data];
      }
    });
  }

  onTabClick(tab: TabData) {
    this.selectedTab = tab;

    // Check if tab is already open
    const existingTabIndex = this.openTabs.findIndex(t => t.id === tab.id);

    if (existingTabIndex === -1) {
      // Add new tab
      this.openTabs.push(tab);
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
}
