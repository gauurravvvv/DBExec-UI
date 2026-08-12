import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { TourService } from 'src/app/core/services/tour.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, OnDestroy {
  constructor(private tourService: TourService) {}

  ngOnInit(): void {
    // The shell mounts once the session is applied (post-relay or
    // post-refresh). Ask the tour whether to auto-start — it self-gates on
    // the persisted showTour flag and the once-per-session guard.
    this.tourService.maybeAutoStart();
  }

  ngOnDestroy(): void {
    // Leaving the shell (logout / hard nav) must tear down any live tour so
    // an overlay never lingers on the login page.
    this.tourService.stop();
  }
}
