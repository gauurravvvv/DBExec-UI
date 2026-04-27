import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { GlobalService } from 'src/app/core/services/global.service';
import { GlobalSearchService } from '../../services/global-search.service';
import { SIDEBAR_ITEMS_ROUTES } from '../layout/sidebar/sidebar.constant';

@Component({
  selector: 'app-global-search',
  templateUrl: './global-search.component.html',
  styleUrls: ['./global-search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlobalSearchComponent implements OnInit {
  @ViewChild('searchInput') searchInput!: ElementRef;

  showSearchModal = false;
  searchTerm = '';
  searchResults: any[] = [];
  uniqueEntityTypes: string[] = [];
  activeFilter: string = 'ALL';
  searchSubject = new Subject<string>();

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

  private userRole: string = '';
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private globalSearchService: GlobalSearchService,
    private globalService: GlobalService,
    private router: Router,
  ) {
    this.userRole = this.globalService.getTokenDetails('role');
    // Debounce search input
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(term => {
        this.performSearch(term);
      });
  }

  ngOnInit(): void {
    this.globalSearchService.openSearch$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.openSearchModal();
        this.cdr.markForCheck();
      });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault(); // Prevent default browser behavior
      if (this.userRole !== 'SUPER-ADMIN') {
        this.openSearchModal();
      }
    }

    // Check for Escape key to close modal
    if (event.key === 'Escape' && this.showSearchModal) {
      this.closeSearchModal();
    }
  }

  openSearchModal() {
    this.showSearchModal = true;
    setTimeout(() => {
      if (this.searchInput) {
        this.searchInput.nativeElement.focus();
      }
    }, 100);
  }

  closeSearchModal() {
    this.showSearchModal = false;
    this.searchTerm = '';
    this.searchResults = [];
    this.globalSearchService.clearResults();
  }

  onSearch() {
    this.searchSubject.next(this.searchTerm);
  }

  performSearch(term: string) {
    if (!term.trim()) {
      this.searchResults = [];
      this.uniqueEntityTypes = [];
      this.activeFilter = 'ALL';
      this.globalSearchService.clearResults();
      this.cdr.markForCheck();
      return;
    }

    this.globalSearchService
      .globalSearch({ key: term })
      .then((response: any) => {
        if (response && response.status && response.data) {
          this.searchResults = response.data.map((item: any) => {
            return {
              title: item.name,
              type: item.entityType, // Use entityType for display
              entity: item.entity, // Store original entity for logic
              description: item.description,
              link: this.getRouteUrl(item.entity),
              icon: this.getIcon(item),
              breadcrumb: this.getBreadcrumb(item),
              ...item,
            };
          });
          this.globalSearchService.setResults(this.searchResults);
          this.extractEntityTypes();
        } else {
          this.searchResults = [];
          this.uniqueEntityTypes = [];
          this.globalSearchService.clearResults();
        }
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

  extractEntityTypes() {
    const types = new Set(this.searchResults.map(item => item.entityType));
    this.uniqueEntityTypes = Array.from(types).sort();
    // Reset filter to ALL when new search results arrive
    this.activeFilter = 'ALL';
  }

  get filteredSearchResults() {
    if (this.activeFilter === 'ALL') {
      return this.searchResults;
    }
    return this.searchResults.filter(
      item => item.entityType === this.activeFilter,
    );
  }

  setFilter(filter: string) {
    this.activeFilter = filter;
  }

  getCountForType(type: string): number {
    return this.searchResults.filter(item => item.entityType === type).length;
  }

  getBreadcrumb(item: any): string {
    const parts: string[] = [];

    // Base: All items have a datasource context via JOIN
    if (item.datasource?.name) parts.push(item.datasource.name);

    // Context specific logic
    switch (item.entity) {
      case 'analyses':
        if (item.dataset?.name) parts.push(item.dataset.name);
        break;
      case 'datasetManager': // Assuming this is dataset
        // Already has datasource name
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
        // Direct child of database (or query builder)
        break;
    }

    // Finally append the item name itself?
    // User requested "Database -> Tab -> Section -> Prompt" ABOVE the prompt item?
    // "show this data in a breadcrumb"
    // Usually breadCrumbs show the path TO the item.
    // If I search for a Prompt "P1", breadcrumb should be "DB1 -> Tab1 -> Sec1".

    return parts.join(' -> ');
  }

  getIcon(item: any): string {
    // Try to match by entityType (e.g. "Analyses" -> "ANALYSES")
    if (item.entityType) {
      const typeKey = item.entityType.toUpperCase();
      if (
        this.GLOBAL_SEARCH_RESULT_ICON[
          typeKey as keyof typeof this.GLOBAL_SEARCH_RESULT_ICON
        ]
      ) {
        return this.GLOBAL_SEARCH_RESULT_ICON[
          typeKey as keyof typeof this.GLOBAL_SEARCH_RESULT_ICON
        ];
      }
    }

    // Try to match by entity (e.g. "analyses" -> "ANALYSES")
    if (item.entity) {
      const entityKey = item.entity.toUpperCase();
      if (
        this.GLOBAL_SEARCH_RESULT_ICON[
          entityKey as keyof typeof this.GLOBAL_SEARCH_RESULT_ICON
        ]
      ) {
        return this.GLOBAL_SEARCH_RESULT_ICON[
          entityKey as keyof typeof this.GLOBAL_SEARCH_RESULT_ICON
        ];
      }
    }

    // Default icon
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
    return item.id;
  }

  navigateToResult(result: any) {
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
