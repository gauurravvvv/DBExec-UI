import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { PromptService } from '../../services/prompt.service';
import { PROMPT } from 'src/app/constants/routes';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-config-prompt',
  templateUrl: './config-prompt.component.html',
  styleUrls: ['./config-prompt.component.scss'],
})
export class ConfigPromptComponent implements OnInit {
  promptForm!: FormGroup;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  orgId: string = '';
  promptId: string = '';
  selectedOrgName: string = '';
  selectedPromptType: string = '';
  showAddPromptValues: boolean = false;
  selectedDatabaseName: string = '';
  selectedTabName: string = '';
  selectedSectionName: string = '';
  sectionData: any;
  sections: any[] = [];
  isCancelClicked = false;
  schemas: any[] = [];
  tables: { [key: string]: any[] } = {};
  private staticSchemaData: any[] = [];
  separator: string = ','; // Use comma as separator
  editingChipIndex: number = -1;
  @ViewChild('chipInput') chipInput!: ElementRef;
  configData: any = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private messageService: MessageService,
    private promptService: PromptService,
    private databaseService: DatabaseService
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.promptId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.promptId) {
      this.loadPromptData();
    }

    this.promptForm.valueChanges.subscribe(() => {
      if (this.isCancelClicked) {
        this.isCancelClicked = false;
      }
    });
  }

  get isFormDirty(): boolean {
    return this.promptForm.dirty;
  }

  initForm(): void {
    this.promptForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      organisation: [''],
      database: [''],
      tab: [''],
      section: [''],
      schema: ['', Validators.required],
      tables: [[], Validators.required],
      promptJoin: [''],
      promptWhere: ['', Validators.required],
      promptValues: [[]], // Initially no validation
    });

    this.promptForm.get('schema')?.valueChanges.subscribe(schema => {
      if (schema) {
        this.promptForm.get('tables')?.setValue([]);
        this.loadTablesForSchema(schema.name);
      }
    });

    this.promptForm.get('promptType')?.valueChanges.subscribe(type => {
      const promptValuesControl = this.promptForm.get('promptValues');
      if (['dropdown', 'multiselect', 'checkbox'].includes(type)) {
        promptValuesControl?.setValidators([Validators.required]);
      } else {
        promptValuesControl?.clearValidators();
      }
      promptValuesControl?.updateValueAndValidity();
    });

    this.promptForm.get('tables')?.valueChanges.subscribe(tables => {
      const promptJoinControl = this.promptForm.get('promptJoin');
      if (tables?.length > 1) {
        promptJoinControl?.setValidators([Validators.required]);
      } else {
        promptJoinControl?.clearValidators();
      }
      promptJoinControl?.updateValueAndValidity();
    });

    // Add validator for promptValues based on promptType
    if (this.showAddPromptValues) {
      this.promptForm.get('promptValues')?.setValidators([Validators.required]);
    } else {
      this.promptForm.get('promptValues')?.clearValidators();
    }
    this.promptForm.get('promptValues')?.updateValueAndValidity();
  }

  loadPromptData(): void {
    this.promptService.viewPrompt(this.orgId, this.promptId).subscribe({
      next: response => {
        this.sectionData = response.data;

        this.promptForm.patchValue({
          id: this.sectionData.id,
          name: this.sectionData.name,
          organisation: this.sectionData.organisationId,
          database: this.sectionData.databaseId,
          tab: this.sectionData.section.tab.id,
          section: this.sectionData.section.id,
        });

        this.selectedOrgName = this.sectionData.organisationName || '';
        this.selectedDatabaseName = this.sectionData.databaseName || '';
        this.selectedTabName = this.sectionData.section.tab.name || '';
        this.selectedSectionName = this.sectionData.section.name || '';
        this.selectedPromptType = this.sectionData.type || '';
        this.showAddPromptValues =
          this.selectedPromptType === 'dropdown' ||
          this.selectedPromptType === 'multiselect' ||
          this.selectedPromptType === 'checkbox';

        // Update promptValues validation when type changes
        if (this.showAddPromptValues) {
          this.promptForm
            .get('promptValues')
            ?.setValidators([Validators.required]);
        } else {
          this.promptForm.get('promptValues')?.clearValidators();
        }
        this.promptForm.get('promptValues')?.updateValueAndValidity();

        this.promptForm.markAsPristine();

        this.loadConfigData();
        this.loadSchemaData();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load tab data',
        });
      },
    });
  }

  loadConfigData() {
    this.promptService.getConfig(this.orgId, this.promptId).subscribe({
      next: (response: any) => {
        const config = response.data.configuration[0];
        const values = response.data.values;

        // Store config data to use after schema loads
        this.configData = config;

        // Patch prompt values immediately
        this.promptForm.patchValue({
          promptJoin: config.prompt_join,
          promptWhere: config.prompt_where,
          promptValues: values.map((v: any) => v.value),
        });
      },
      error: (error: any) => {
        console.error('Error loading config data:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load configuration data',
        });
      },
    });
  }

  loadSchemaData() {
    const params = {
      orgId: this.sectionData.organisationId,
      databaseId: this.sectionData.databaseId,
    };

    this.databaseService.listDatabaseSchemas(params).subscribe({
      next: (response: any) => {
        this.staticSchemaData = response.data;
        this.schemas = this.staticSchemaData.map(schema => ({
          name: schema.schema_name,
        }));

        // Set schema and table after schemas are loaded
        if (this.configData) {
          // First set the schema
          const schemaControl = this.promptForm.get('schema');
          schemaControl?.patchValue({ name: this.configData.prompt_schema });

          // Parse and set table after schema is set
          const tableMatch =
            this.configData.prompt_table.match(/(.+?)\((.+?)\)/);
          if (tableMatch) {
            const tableName = tableMatch[1];
            const alias = tableMatch[2];

            // Wait for tables to be loaded
            setTimeout(() => {
              this.promptForm.patchValue({
                tables: [
                  {
                    tableName: tableName,
                    alias: alias,
                  },
                ],
              });
            });
          }
        }
      },
      error: error => {
        console.error('Error loading schemas:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load schema data',
        });
      },
    });
  }

  onSubmit(): void {
    if (this.promptForm.valid) {
      const formValues = this.promptForm.value;

      const transformedTables = formValues.tables
        .map((table: any) => `${table.tableName}(${table.alias})`)
        .join(',');

      const submitData = {
        ...formValues,
        tables: transformedTables,
        schema: formValues.schema.name,
      };

      this.promptService.configPrompt(submitData).subscribe({
        next: () => {
          this.router.navigate([PROMPT.LIST]);
        },
        error: (error: any) => {
          console.error('Error configuring prompt:', error);
        },
      });
    } else {
      Object.keys(this.promptForm.controls).forEach(key => {
        const control = this.promptForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.promptForm.patchValue({
        id: this.sectionData.id,
        name: this.sectionData.name,
        organisation: this.sectionData.organisationId,
        database: this.sectionData.databaseId,
        tab: this.sectionData.section.tab.id,
        section: this.sectionData.section.id,
        schema: '',
        tables: [],
        promptJoin: '',
        promptWhere: '',
        promptValues: [], // Reset to empty array
      });

      this.selectedOrgName = this.sectionData.organisationName || '';
      this.selectedDatabaseName = this.sectionData.databaseName || '';
      this.selectedTabName = this.sectionData.section.tab.name || '';
      this.selectedSectionName = this.sectionData.section.name || '';

      this.tables = {};

      this.isCancelClicked = true;

      this.promptForm.markAsPristine();
      this.promptForm.markAsUntouched();
    }
  }

  private loadTablesForSchema(schemaName: string) {
    const schemaData = this.staticSchemaData.find(
      schema => schema.schema_name === schemaName
    );

    if (schemaData) {
      const tables = schemaData.tables.map((table: any, index: number) => ({
        name: `${table.table_name}(t${index + 1})`,
        value: {
          tableName: table.table_name,
          alias: `t${index + 1}`,
        },
        columns: table.columns,
      }));

      this.tables[schemaName] = tables;
    } else {
      this.tables[schemaName] = [];
    }
  }

  getAvailableTables(schema: any): any[] {
    if (!schema) return [];
    const schemaName = schema.name;

    if (!this.tables[schemaName]) {
      this.loadTablesForSchema(schemaName);
    }

    return this.tables[schemaName] || [];
  }

  clearPromptValues(): void {
    this.promptForm.patchValue({
      promptValues: [],
    });
  }

  onChipDoubleClick(event: any): void {
    const item = event.value;
    const values = this.promptForm.get('promptValues')?.value || [];
    this.editingChipIndex = values.indexOf(item);
    setTimeout(() => {
      if (this.chipInput) {
        this.chipInput.nativeElement.focus();
        this.chipInput.nativeElement.style.width = `${item.length}ch`;
      }
    });
  }

  updateChip(event: any): void {
    const newValue = event.target.value.trim();
    if (this.editingChipIndex > -1) {
      const values = [...(this.promptForm.get('promptValues')?.value || [])];
      if (newValue && !values.includes(newValue)) {
        values[this.editingChipIndex] = newValue;
        this.promptForm.patchValue({ promptValues: values });
        event.target.style.width = `${newValue.length}ch`;
      }
      this.editingChipIndex = -1;
    }
  }

  cancelEdit(): void {
    this.editingChipIndex = -1;
  }
}
