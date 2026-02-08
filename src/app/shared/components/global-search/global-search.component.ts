import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { GlobalSearchService } from '../../services/global-search.service';
import { SIDEBAR_ITEMS_ROUTES } from '../layout/sidebar/sidebar.constant';

@Component({
  selector: 'app-global-search',
  templateUrl: './global-search.component.html',
  styleUrls: ['./global-search.component.scss'],
})
export class GlobalSearchComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput!: ElementRef;

  showSearchModal = false;
  searchTerm = '';
  searchResults: any[] = [];
  openSearchSubscription?: Subscription;
  searchSubject = new Subject<string>();

  GLOBAL_SEARCH_RESULT_ICON = {
    TAB: 'ci ci-ribbon',
    SECTION: 'ci ci-section',
    PROMPT: 'ci ci-caret-down',
    SCREEN: 'ci ci-screen',
    DATASET: 'ci ci-dataset',
    ANALYSES: 'ci ci-analyses',
  };

  constructor(
    private globalSearchService: GlobalSearchService,
    private router: Router,
  ) {
    // Debounce search input
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(term => {
        this.performSearch(term);
      });
  }

  ngOnInit(): void {
    this.openSearchSubscription =
      this.globalSearchService.openSearch$.subscribe(() => {
        this.openSearchModal();
      });
  }

  ngOnDestroy(): void {
    if (this.openSearchSubscription) {
      this.openSearchSubscription.unsubscribe();
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault(); // Prevent default browser behavior
      this.openSearchModal();
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
  }

  onSearch() {
    this.searchSubject.next(this.searchTerm);
  }

  performSearch(term: string) {
    if (!term.trim()) {
      this.searchResults = [];
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
        } else {
          this.searchResults = [];
        }
      })
      .catch(error => {
        console.error('Search failed', error);
        this.searchResults = [];
      });
  }

  getBreadcrumb(item: any): string {
    const parts: string[] = [];

    // Base: All items seem to have a database context
    if (item.databaseName) parts.push(item.databaseName);

    // Context specific logic
    switch (item.entity) {
      case 'analyses':
        if (item.datasetName) parts.push(item.datasetName);
        break;
      case 'datasetManager': // Assuming this is dataset
        // Already has databaseName
        break;
      case 'queryBuilderPrompt':
        if (item.tabName) parts.push(item.tabName);
        if (item.sectionName) parts.push(item.sectionName);
        break;
      case 'queryBuilderSection':
        if (item.tabName) parts.push(item.tabName);
        break;
      case 'queryBuilderTab':
      case 'queryBuilderScreen':
        // Direct child of database (or screen)
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

  navigateToResult(result: any) {
    this.closeSearchModal();
    if (result.link) {
      const queryParams: any = {};
      if (result.organisationId) queryParams.orgId = result.organisationId;
      if (result.databaseId) queryParams.databaseId = result.databaseId;
      if (result.name) queryParams.name = result.name;

      this.router.navigate([result.link], { queryParams });
    }
  }
}
