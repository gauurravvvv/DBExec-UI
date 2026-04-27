import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CONNECTION } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { ConnectionService } from '../../services/connection.service';

@Component({
  selector: 'app-view-connection',
  templateUrl: './view-connection.component.html',
  styleUrls: ['./view-connection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewConnectionComponent implements OnInit {
  connectionId: string = '';
  orgId: string = '';
  connectionData: any = null;
  showDeleteConfirm = false;
  deleteJustification = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private globalService: GlobalService,
    private connectionService: ConnectionService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.orgId = this.route.snapshot.params['orgId'];
    this.connectionId = this.route.snapshot.params['id'];
    this.loadConnectionDetails();
  }

  async loadConnectionDetails() {
    await this.connectionService.loadOne(this.orgId, this.connectionId);
    const data = this.connectionService.current();
    if (data) {
      this.connectionData = data;
    }
    this.cdr.markForCheck();
  }

  onEdit() {
    this.router.navigate([CONNECTION.EDIT, this.orgId, this.connectionId]);
  }

  goBack() {
    this.router.navigate([CONNECTION.LIST]);
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  trackByIndex(index: number): number {
    return index;
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  async proceedDelete(): Promise<void> {
    if (this.connectionData && this.deleteJustification.trim()) {
      const response = await this.connectionService.delete(
        this.orgId,
        this.connectionData.id,
        this.deleteJustification.trim(),
      );
      this.showDeleteConfirm = false;
      this.deleteJustification = '';
      if (this.globalService.handleSuccessService(response)) {
        this.router.navigate([CONNECTION.LIST]);
      }
      this.cdr.markForCheck();
    }
  }
}
