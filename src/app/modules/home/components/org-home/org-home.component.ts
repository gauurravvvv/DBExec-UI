import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-org-home',
  templateUrl: './org-home.component.html',
  styleUrls: ['./org-home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrgHomeComponent implements OnInit {
  userName = '';
  organisationName = '';
  userRole = '';
  isAdmin = false;

  constructor(
    private globalService: GlobalService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.userName = this.globalService.getTokenDetails('name') || '';
    this.organisationName =
      this.globalService.getTokenDetails('organisation') || '';
    this.userRole = this.globalService.getTokenDetails('role') || '';
    this.isAdmin = this.userRole === ROLES.ORG_ADMIN;
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }
}
