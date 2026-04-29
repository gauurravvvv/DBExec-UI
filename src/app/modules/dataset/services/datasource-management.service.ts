import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { OrganisationService } from '../../organisation/services/organisation.service';
import { QueryService } from './query.service';

export interface Organisation {
  id: string;
  name: string;
  [key: string]: any;
}

export interface Datasource {
  id: string;
  name: string;
  type: string;
  orgId: string;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class DatasourceManagementService {
  // Organisations
  private organisationsSubject = new BehaviorSubject<Organisation[]>([]);
  public organisations$ = this.organisationsSubject.asObservable();

  private selectedOrgSubject = new BehaviorSubject<Organisation | null>(null);
  public selectedOrg$ = this.selectedOrgSubject.asObservable();

  // Datasources
  private datasourcesSubject = new BehaviorSubject<Datasource[]>([]);
  public datasources$ = this.datasourcesSubject.asObservable();

  private selectedDatasourceSubject = new BehaviorSubject<Datasource | null>(
    null,
  );
  public selectedDatasource$ = this.selectedDatasourceSubject.asObservable();

  // Loading states
  private loadingOrganisationsSubject = new BehaviorSubject<boolean>(false);
  private loadingDatasourcesSubject = new BehaviorSubject<boolean>(false);

  public loadingOrganisations$ =
    this.loadingOrganisationsSubject.asObservable();
  public loadingDatasources$ = this.loadingDatasourcesSubject.asObservable();

  constructor(
    private organisationService: OrganisationService,
    private queryService: QueryService,
  ) {}

  // Organisation management
  loadOrganisations(): Observable<Organisation[]> {
    this.loadingOrganisationsSubject.next(true);

    // Convert promise to observable
    return new Observable<Organisation[]>(observer => {
      this.organisationService
        .listOrganisation({ pageNumber: 1, limit: 1000 })
        .then((response: any) => {
          const organisations = response?.data || [];
          this.organisationsSubject.next(organisations);
          this.loadingOrganisationsSubject.next(false);
          observer.next(organisations);
          observer.complete();
        })
        .catch(error => {
          console.error('Failed to load organisations:', error);
          this.loadingOrganisationsSubject.next(false);
          observer.next([]);
          observer.complete();
        });
    });
  }

  selectOrganisation(org: Organisation | null): void {
    this.selectedOrgSubject.next(org);

    // Clear datasources when organisation changes
    if (!org) {
      this.datasourcesSubject.next([]);
      this.selectedDatasourceSubject.next(null);
    } else {
      // Load datasources for the selected organisation
      this.loadDatasources(org.id);
    }
  }

  getSelectedOrganisation(): Organisation | null {
    return this.selectedOrgSubject.value;
  }

  // Datasource management
  loadDatasources(orgId?: string): Observable<Datasource[]> {
    const organisationId = orgId || this.getSelectedOrganisation()?.id;

    if (!organisationId) {
      return of([]);
    }

    this.loadingDatasourcesSubject.next(true);

    // For now, return mock datasources based on organisation
    // In a real implementation, this would call an API
    const mockDatasources: Datasource[] = [
      {
        id: '1',
        name: 'PostgreSQL Database',
        type: 'postgresql',
        orgId: organisationId,
      },
      { id: '2', name: 'MySQL Database', type: 'mysql', orgId: organisationId },
      {
        id: '3',
        name: 'MongoDB Database',
        type: 'mongodb',
        orgId: organisationId,
      },
    ];

    this.datasourcesSubject.next(mockDatasources);
    this.loadingDatasourcesSubject.next(false);

    return of(mockDatasources);
  }

  selectDatasource(datasource: Datasource | null): void {
    this.selectedDatasourceSubject.next(datasource);
  }

  getSelectedDatasource(): Datasource | null {
    return this.selectedDatasourceSubject.value;
  }

  // Utility methods
  getOrganisations(): Organisation[] {
    return this.organisationsSubject.value;
  }

  getDatasources(): Datasource[] {
    return this.datasourcesSubject.value;
  }

  isLoadingOrganisations(): boolean {
    return this.loadingOrganisationsSubject.value;
  }

  isLoadingDatasources(): boolean {
    return this.loadingDatasourcesSubject.value;
  }

  // Clear all selections
  clearSelections(): void {
    this.selectedOrgSubject.next(null);
    this.selectedDatasourceSubject.next(null);
    this.datasourcesSubject.next([]);
  }

  // Get datasource by ID
  getDatasourceById(id: string): Datasource | null {
    return this.getDatasources().find(db => db.id === id) || null;
  }

  // Get organisation by ID
  getOrganisationById(id: string): Organisation | null {
    return this.getOrganisations().find(org => org.id === id) || null;
  }

  // Check if user has system admin role (for organisation dropdown visibility)
  shouldShowOrganisationDropdown(userRole: string): boolean {
    // This would typically come from a role/permission service
    // For now, we'll check against a constant
    return userRole === 'SYSTEM_ADMIN';
  }
}
