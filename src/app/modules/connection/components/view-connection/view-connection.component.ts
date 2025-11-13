import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CONNECTION } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { ConnectionService } from '../../services/connection.service';
@Component({
  selector: 'app-view-connection',
  templateUrl: './view-connection.component.html',
  styleUrls: ['./view-connection.component.scss'],
})
export class ViewConnectionComponent implements OnInit {
  connectionId: string = '';
  orgId: string = '';
  connectionData: any = null;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private globalService: GlobalService,
    private connectionService: ConnectionService
  ) {}

  ngOnInit() {
    this.orgId = this.route.snapshot.params['orgId'];
    this.connectionId = this.route.snapshot.params['id'];
    this.loadConnectionDetails();
  }

  loadConnectionDetails() {
    this.connectionService
      .viewConnection(this.orgId, this.connectionId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.connectionData = response.data;
        }
      });
  }

  onEdit() {
    this.router.navigate([CONNECTION.EDIT, this.orgId, this.connectionId]);
  }

  goBack() {
    this.router.navigate([CONNECTION.LIST]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    if (this.connectionData) {
      this.connectionService
        .deleteConnection(this.orgId, this.connectionData.id)
        .then(response => {
          this.showDeleteConfirm = false;
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([CONNECTION.LIST]);
          }
        });
    }
  }
}
