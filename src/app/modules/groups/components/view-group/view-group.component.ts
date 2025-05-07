import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GROUP } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from '../../services/group.service';

@Component({
  selector: 'app-view-group',
  templateUrl: './view-group.component.html',
  styleUrls: ['./view-group.component.scss'],
})
export class ViewGroupComponent implements OnInit {
  groupId: string = '';
  orgId: string = '';
  groupData: any = null;
  showDeleteConfirm = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private groupService: GroupService,
    private globalService: GlobalService
  ) {}

  ngOnInit() {
    this.groupId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.loadGroupDetails();
  }

  loadGroupDetails() {
    this.groupService.viewGroup(this.orgId, this.groupId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.groupData = response.data;
      }
    });
  }

  onEdit() {
    this.router.navigate([GROUP.EDIT, this.orgId, this.groupId], {
      queryParams: {
        orgId: this.orgId,
        adminId: this.groupId,
      },
    });
  }

  goBack() {
    this.router.navigate([GROUP.LIST]);
  }

  confirmDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    if (this.groupData) {
      this.groupService
        .deleteGroup(this.orgId, this.groupData.id)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.router.navigate([GROUP.LIST]);
          }
        });
    }
  }
}
