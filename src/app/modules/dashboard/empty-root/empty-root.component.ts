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

    console.log('role', role);

    if (!role) {
      this.router.navigate(['/login']);
    }

    switch (role) {
      case ROLES.SUPER_ADMIN:
        console.log('super admin');
        this.router.navigate(['/home/dashboard/super-admin']);
        break;
      case ROLES.ORG_ADMIN:
        this.router.navigate(['/home/dashboard/org-admin']);
        break;
      case ROLES.ORG_USER:
        this.router.navigate(['/home/dashboard/org-user']);
        break;
      default:
        this.router.navigate(['/login']);
        break;
    }
  }
}
