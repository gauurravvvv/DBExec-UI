import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { OrganisationService } from '../../organisation/services/organisation.service';
import { QueryService } from './query.service';

export interface Organisation {
  id: number;
  name: string;
  [key: string]: any;
}

export interface Database {
  id: number;
  name: string;
  type: string;
  orgId: number;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseManagementService {
  // Organisations
  private organisationsSubject = new BehaviorSubject<Organisation[]>([]);
  public organisations$ = this.organisationsSubject.asObservable();

  private selectedOrgSubject = new BehaviorSubject<Organisation | null>(null);
  public selectedOrg$ = this.selectedOrgSubject.asObservable();

  // Databases
  private databasesSubject = new BehaviorSubject<Database[]>([]);
  public databases$ = this.databasesSubject.asObservable();

  private selectedDatabaseSubject = new BehaviorSubject<Database | null>(null);
  public selectedDatabase$ = this.selectedDatabaseSubject.asObservable();

  // Loading states
  private loadingOrganisationsSubject = new BehaviorSubject<boolean>(false);
  private loadingDatabasesSubject = new BehaviorSubject<boolean>(false);

  public loadingOrganisations$ =
    this.loadingOrganisationsSubject.asObservable();
  public loadingDatabases$ = this.loadingDatabasesSubject.asObservable();

  constructor(
    private organisationService: OrganisationService,
    private queryService: QueryService
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

    // Clear databases when organisation changes
    if (!org) {
      this.databasesSubject.next([]);
      this.selectedDatabaseSubject.next(null);
    } else {
      // Load databases for the selected organisation
      this.loadDatabases(org.id);
    }
  }

  getSelectedOrganisation(): Organisation | null {
    return this.selectedOrgSubject.value;
  }

  // Database management
  loadDatabases(orgId?: number): Observable<Database[]> {
    const organisationId = orgId || this.getSelectedOrganisation()?.id;

    if (!organisationId) {
      return of([]);
    }

    this.loadingDatabasesSubject.next(true);

    // For now, return mock databases based on organisation
    // In a real implementation, this would call an API
    const mockDatabases: Database[] = [
      { id: 1, name: 'PostgreSQL Database', type: 'postgresql', orgId: organisationId },
      { id: 2, name: 'MySQL Database', type: 'mysql', orgId: organisationId },
      { id: 3, name: 'MongoDB Database', type: 'mongodb', orgId: organisationId },
    ];

    this.databasesSubject.next(mockDatabases);
    this.loadingDatabasesSubject.next(false);

    return of(mockDatabases);
  }

  selectDatabase(database: Database | null): void {
    this.selectedDatabaseSubject.next(database);
  }

  getSelectedDatabase(): Database | null {
    return this.selectedDatabaseSubject.value;
  }

  // Utility methods
  getOrganisations(): Organisation[] {
    return this.organisationsSubject.value;
  }

  getDatabases(): Database[] {
    return this.databasesSubject.value;
  }

  isLoadingOrganisations(): boolean {
    return this.loadingOrganisationsSubject.value;
  }

  isLoadingDatabases(): boolean {
    return this.loadingDatabasesSubject.value;
  }

  // Clear all selections
  clearSelections(): void {
    this.selectedOrgSubject.next(null);
    this.selectedDatabaseSubject.next(null);
    this.databasesSubject.next([]);
  }

  // Get database by ID
  getDatabaseById(id: number): Database | null {
    return this.getDatabases().find(db => db.id === id) || null;
  }

  // Get organisation by ID
  getOrganisationById(id: number): Organisation | null {
    return this.getOrganisations().find(org => org.id === id) || null;
  }

  // Check if user has super admin role (for organisation dropdown visibility)
  shouldShowOrganisationDropdown(userRole: string): boolean {
    // This would typically come from a role/permission service
    // For now, we'll check against a constant
    return userRole === 'SUPER_ADMIN';
  }
}
