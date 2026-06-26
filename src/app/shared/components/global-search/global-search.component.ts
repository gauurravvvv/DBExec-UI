import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { SIDEBAR_ITEMS_ROUTES } from '../../../core/layout/sidebar/sidebar.constant';
import { GlobalSearchService } from '../../services/global-search.service';

@Component({
  selector: 'app-global-search',
  templateUrl: './global-search.component.html',
  styleUrls: ['./global-search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSearchComponent implements OnInit {
  showSearchModal = false;
  searchTerm = '';
  searchResults: any[] = [];
  uniqueEntityTypes: string[] = [];
  activeFilter = 'ALL';
  /** Currently-highlighted index in `filteredSearchResults`. Used by
   *  ↑/↓ keyboard navigation. Reset to 0 on every new result set. */
  selectedIndex = 0;

  private readonly searchSubject = new Subject<string>();

  readonly loading = this.globalSearchService.loading;
  readonly results = this.globalSearchService.results;

  GLOBAL_SEARCH_RESULT_ICON = {
    TAB: 'ci ci-ribbon',
    SECTION: 'ci ci-section',
    PROMPT: 'ci ci-caret-down',
    QUERY_BUILDER: 'ci ci-screen',
    DATASET: 'ci ci-dataset',
    ANALYSES: 'ci ci-analyses',
  };

  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly permissionService = inject(PermissionService);

  constructor(
    private globalSearchService: GlobalSearchService,
    private globalService: GlobalService,
    private router: Router,
  ) {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(term => this.performSearch(term));
  }

  ngOnInit(): void {
    this.globalSearchService.openSearch$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.openSearchModal();
        this.cdr.markForCheck();
      });
  }

  /**
   * Cmd-K / Ctrl-K shortcut keeps working from anywhere; the
   * sidebar's button hits the same service. Escape is handled by
   * the CommandModal base now, so we only intercept ↑/↓/Enter when
   * the modal is open.
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      if (!this.permissionService.canRead(PERMISSIONS.SYSTEM_ADMIN)) {
        this.openSearchModal();
      }
      return;
    }

    if (!this.showSearchModal) return;
    const rows = this.filteredSearchResults;
    if (rows.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % rows.length;
      this.cdr.markForCheck();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex =
        (this.selectedIndex - 1 + rows.length) % rows.length;
      this.cdr.markForCheck();
    } else if (event.key === 'Enter') {
      const target = rows[this.selectedIndex];
      if (target) {
        event.preventDefault();
        this.navigateToResult(target);
      }
    }
  }

  openSearchModal(): void {
    this.showSearchModal = true;
    this.selectedIndex = 0;
    this.cdr.markForCheck();
  }

  closeSearchModal(): void {
    this.showSearchModal = false;
    this.searchTerm = '';
    this.searchResults = [];
    this.uniqueEntityTypes = [];
    this.activeFilter = 'ALL';
    this.selectedIndex = 0;
    this.globalSearchService.clearResults();
    this.cdr.markForCheck();
  }

  onSearchInput(value: string): void {
    this.searchTerm = value;
    this.searchSubject.next(value);
  }

  performSearch(term: string): void {
    if (!term.trim()) {
      this.searchResults = [];
      this.uniqueEntityTypes = [];
      this.activeFilter = 'ALL';
      this.selectedIndex = 0;
      this.globalSearchService.clearResults();
      this.cdr.markForCheck();
      return;
    }

    this.globalSearchService
      .globalSearch({ key: term })
      .then((response: any) => {
        if (response && response.status && response.data) {
          this.searchResults = response.data.map((item: any) => ({
            title: item.name,
            type: item.entityType,
            entity: item.entity,
            description: item.description,
            link: this.getRouteUrl(item.entity),
            icon: this.getIcon(item),
            breadcrumb: this.getBreadcrumb(item),
            ...item,
          }));
          this.globalSearchService.setResults(this.searchResults);
          this.extractEntityTypes();
        } else {
          this.searchResults = [];
          this.uniqueEntityTypes = [];
          this.globalSearchService.clearResults();
        }
        this.selectedIndex = 0;
        this.cdr.markForCheck();
      })
      .catch(error => {
        console.error('Search failed', error);
        this.searchResults = [];
        this.uniqueEntityTypes = [];
        this.globalSearchService.clearResults();
        this.cdr.markForCheck();
      });
  }

  extractEntityTypes(): void {
    const types = new Set(this.searchResults.map(item => item.entityType));
    this.uniqueEntityTypes = Array.from(types).sort();
    this.activeFilter = 'ALL';
  }

  get filteredSearchResults() {
    if (this.activeFilter === 'ALL') return this.searchResults;
    return this.searchResults.filter(
      item => item.entityType === this.activeFilter,
    );
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.selectedIndex = 0;
  }

  getCountForType(type: string): number {
    return this.searchResults.filter(item => item.entityType === type).length;
  }

  getBreadcrumb(item: any): string {
    const parts: string[] = [];
    if (item.datasource?.name) parts.push(item.datasource.name);

    switch (item.entity) {
      case 'analyses':
        if (item.dataset?.name) parts.push(item.dataset.name);
        break;
      case 'datasetManager':
        break;
      case 'queryBuilderPrompt':
        if (item.tab?.name) parts.push(item.tab.name);
        if (item.section?.name) parts.push(item.section.name);
        break;
      case 'queryBuilderSection':
        if (item.tab?.name) parts.push(item.tab.name);
        break;
      case 'queryBuilderTab':
      case 'queryBuilderScreen':
        break;
    }
    return parts.join(' -> ');
  }

  getIcon(item: any): string {
    if (item.entityType) {
      const typeKey = item.entityType.toUpperCase();
      const hit =
        this.GLOBAL_SEARCH_RESULT_ICON[
          typeKey as keyof typeof this.GLOBAL_SEARCH_RESULT_ICON
        ];
      if (hit) return hit;
    }
    if (item.entity) {
      const entityKey = item.entity.toUpperCase();
      const hit =
        this.GLOBAL_SEARCH_RESULT_ICON[
          entityKey as keyof typeof this.GLOBAL_SEARCH_RESULT_ICON
        ];
      if (hit) return hit;
    }
    return 'pi pi-list';
  }

  getRouteUrl(entity: string): string {
    const routeItem = SIDEBAR_ITEMS_ROUTES.find(item => item.value === entity);
    return routeItem ? routeItem.route : '/';
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackById(index: number, item: any): any {
    return item.id ?? index;
  }

  navigateToResult(result: any): void {
    this.closeSearchModal();
    if (result.link) {
      const queryParams: any = {};
      if (result.organisationId) queryParams.orgId = result.organisationId;
      if (result.datasourceId) queryParams.datasourceId = result.datasourceId;
      if (result.name) queryParams.name = result.name;
      this.router.navigate([result.link], { queryParams });
    }
  }
}
