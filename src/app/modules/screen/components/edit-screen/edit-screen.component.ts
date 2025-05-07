import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { SCREEN } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { ScreenService } from '../../services/screen.service';

@Component({
  selector: 'app-edit-screen',
  templateUrl: './edit-screen.component.html',
  styleUrls: ['./edit-screen.component.scss'],
})
export class EditScreenComponent implements OnInit {
  screenForm!: FormGroup;
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  orgId: string = '';
  screenId: string = '';
  screenData: any;
  isCancelClicked = false;
  selectedOrgName: string = '';
  selectedDatabaseName: string = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private screenService: ScreenService,
    private route: ActivatedRoute
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.screenForm.dirty;
  }

  ngOnInit() {
    this.screenId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.screenId) {
      this.loadScreenDetails();
    }

    this.screenForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
    });
  }

  initForm() {
    this.screenForm = this.fb.group({
      id: [''],
      organisation: [''],
      database: [''],
      name: ['', [Validators.required, Validators.pattern(REGEX.firstName)]],
      description: [''],
      status: [false],
    });

    if (!this.showOrganisationDropdown) {
      this.screenForm.get('database')?.enable();
    }
  }

  loadScreenDetails(): void {
    this.screenService.viewScreen(this.orgId, this.screenId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.screenData = response.data;
        this.screenForm.patchValue({
          id: this.screenData.id,
          name: this.screenData.name,
          description: this.screenData.description,
          organisation: this.screenData.organisationId,
          database: this.screenData.databaseId,
          status: this.screenData.status,
        });

        this.selectedOrgName = this.screenData.organisationName || '';
        this.selectedDatabaseName = this.screenData.databaseName || '';

        this.screenForm.markAsPristine();
      }
    });
  }

  onSubmit() {
    if (this.screenForm.valid) {
      this.screenService.updateScreen(this.screenForm).then(res => {
        if (this.globalService.handleSuccessService(res, true, true)) {
          this.router.navigate([SCREEN.LIST]);
        }
      });
    }
  }

  onCancel() {
    if (this.isFormDirty) {
      // Restore basic form values
      this.screenForm.patchValue({
        id: this.screenData.id,
        name: this.screenData.name,
        description: this.screenData.description,
        organisation: this.screenData.organisation,
        database: this.screenData.database,
        status: this.screenData.status,
      });

      this.selectedOrgName = this.screenData.organisationName;
      this.isCancelClicked = true;
      this.screenForm.markAsPristine();
    } else {
      this.router.navigate([SCREEN.LIST]);
    }
  }
}
