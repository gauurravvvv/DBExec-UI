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
  constructor(
    private router: Router,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    const role = this.globalService.getTokenDetails('role');

    if (!role) {
      this.router.navigate(['/login']);
      return;
    }

    if (role === ROLES.SUPER_ADMIN) {
      this.router.navigate(['/app/home/super-admin']);
    } else {
      this.router.navigate(['/app/home/org']);
    }
  }
}
