import { Component, OnInit } from '@angular/core';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent implements OnInit {
  year: number = new Date().getFullYear();
  version: string = environment.appVersion;
  appName: string = 'DBExec';

  constructor() {}

  ngOnInit() {}
}
