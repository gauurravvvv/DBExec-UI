import { Component, OnInit } from "@angular/core";
import { GlobalService } from "src/app/core/services/global.service";

@Component({
  selector: "app-footer",
  templateUrl: "./footer.component.html",
  styleUrls: ["./footer.component.scss"],
})
export class FooterComponent implements OnInit {
  year: number = new Date().getFullYear();
  version: string = "v1.0";
  appName: string = "DBExec";

  constructor(private globalService: GlobalService) {}

  ngOnInit() {}
}
