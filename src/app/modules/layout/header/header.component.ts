import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { GlobalService } from 'src/app/core/services/global.service';
import { interval, Subscription } from 'rxjs';
import { Renderer2 } from '@angular/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  currentTime: Date = new Date();
  organisationName: string = '';
  userInitials: string = '';
  userName: string = '';
  userRole: string = '';
  private timeSubscription?: Subscription;
  showProfileMenu: boolean = false;
  isDarkMode = true;
  isAnimating = false;

  constructor(
    private router: Router,
    private globalService: GlobalService,
    private renderer: Renderer2
  ) {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    this.isDarkMode = savedTheme === 'dark';
    this.applyTheme();
  }

  ngOnInit() {
    // Get organization name
    this.organisationName =
      this.globalService.getTokenDetails('organisationName');

    // Get user details and create initials
    const userFullName = this.globalService.getTokenDetails('name');
    this.userName = userFullName;
    this.userInitials = this.globalService.chipNameProvider(userFullName);
    this.userRole = this.globalService.getTokenDetails('role');

    // Update time every second
    this.timeSubscription = interval(1000).subscribe(() => {
      this.currentTime = new Date();
    });
  }

  ngOnDestroy() {
    if (this.timeSubscription) {
      this.timeSubscription.unsubscribe();
    }
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  clickout(event: any) {
    const userProfile = document.querySelector('.user-profile');
    if (!userProfile?.contains(event.target)) {
      this.showProfileMenu = false;
    }
  }

  toggleProfileMenu(event: Event) {
    event.stopPropagation();
    this.showProfileMenu = !this.showProfileMenu;
  }

  viewProfile() {
    // Implement profile view logic
    this.showProfileMenu = false;
  }

  toggleTheme() {
    const icon = document.querySelector('.theme-toggle .pi');
    if (icon) {
      icon.classList.add('animate');
      setTimeout(() => {
        icon.classList.remove('animate');
      }, 700); // Match animation duration
    }
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
    this.applyTheme();
  }

  private applyTheme() {
    if (this.isDarkMode) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }
}
