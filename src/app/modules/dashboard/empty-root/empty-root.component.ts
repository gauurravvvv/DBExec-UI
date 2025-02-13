import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-empty-root',
  templateUrl: './empty-root.component.html',
  styleUrls: ['./empty-root.component.scss'],
})
export class EmptyRootComponent implements OnInit {
  constructor(private router: Router, private globalService: GlobalService) {}

  ngOnInit(): void {
    const role = this.globalService.getTokenDetails('role');

    if (!role) {
      this.router.navigate(['/login']);
      return;
    }

    switch (role) {
      case ROLES.SUPER_ADMIN:
        this.router.navigate(['/app/dashboard/super-admin']);
        break;
      case ROLES.ORG_ADMIN:
        this.router.navigate(['/app/dashboard/org-admin']);
        break;
      case ROLES.ORG_USER:
        this.router.navigate(['/app/dashboard/org-user']);
        break;
      default:
        this.router.navigate(['/login']);
        break;
    }
  }
}
