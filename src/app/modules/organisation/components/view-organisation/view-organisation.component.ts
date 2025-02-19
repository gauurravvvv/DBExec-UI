import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganisationService } from '../../services/organisation.service';
import { MessageService } from 'primeng/api';

interface OrganisationConfig {
  maxDatabases: number;
  maxAdmins: number;
  maxUsers: number;
  maxEnvironment: number;
  maxCategories: number;
}

interface OrganisationData {
  id: string;
  name: string;
  status: number;
  createdOn: Date;
  config: OrganisationConfig;
}

@Component({
  selector: 'app-view-organisation',
  templateUrl: './view-organisation.component.html',
  styleUrls: ['./view-organisation.component.scss'],
})
export class ViewOrganisationComponent implements OnInit {
  organisationId!: number;
  organisationData!: OrganisationData;
  avatarBackground: string = '#2196F3'; // Default color
  organisationInitials: string = '';
  showDeleteConfirm: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private organisationService: OrganisationService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.organisationId = params['id'];
      this.loadOrganisationData();
    });
  }

  loadOrganisationData() {
    this.organisationService
      .viewOrganisation(this.organisationId.toString())
      .subscribe({
        next: response => {
          console.log(response);
          this.organisationData = response.data;
          this.setOrganisationInitials();
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load organisation details',
          });
        },
      });
  }

  setOrganisationInitials() {
    if (this.organisationData?.name) {
      const words = this.organisationData.name.split(' ');
      this.organisationInitials = words
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
    }
  }

  confirmDelete(id: number) {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
  }

  proceedDelete() {
    this.organisationService
      .deleteOrganisation(this.organisationId.toString())
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Organisation deleted successfully',
          });
          this.router.navigate(['/app/organisation']);
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete organisation',
          });
        },
        complete: () => {
          this.showDeleteConfirm = false;
        },
      });
  }
}
