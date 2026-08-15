/**
 * cp-source-step — pick the prompt's source schema + table (+ optional alias).
 * Reads/writes PromptConfigService.source. Schema/table lists come from the
 * DatasourceService for the prompt's datasource (svc.datasourceId).
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { PromptConfigService } from '../../../../services/prompt-config.service';

interface Option {
  label: string;
  value: string;
}

@Component({
  selector: 'cp-source-step',
  templateUrl: './cp-source-step.component.html',
  styleUrls: ['../cp-step.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpSourceStepComponent implements OnInit {
  @Input({ required: true }) svc!: PromptConfigService;
  private readonly datasources = inject(DatasourceService);

  readonly schemas = signal<Option[]>([]);
  readonly tables = signal<Option[]>([]);
  readonly loadingTables = signal(false);

  async ngOnInit(): Promise<void> {
    const dsId = this.svc.datasourceId();
    if (!dsId) return;
    try {
      const res: any = await this.datasources.listDatasourceSchemas(
        { datasourceId: dsId },
        true,
      );
      const rows: any[] = res?.data ?? [];
      this.schemas.set(
        rows.map((r: any) => {
          const name = typeof r === 'string' ? r : r.schema_name ?? r.schemaName ?? r.name;
          return { label: name, value: name };
        }),
      );
    } catch {
      this.schemas.set([]);
    }
    // If a schema is already chosen (edit case), preload its tables.
    if (this.svc.source().schema) {
      await this.loadTables(this.svc.source().schema);
    }
  }

  async onSchema(schema: string): Promise<void> {
    // dropdown fires onChangeEvent — cascade reset dependent fields.
    this.svc.patchSource({ schema, table: '', alias: '' });
    await this.loadTables(schema);
  }

  onTable(table: string): void {
    this.svc.patchSource({ table, alias: table?.slice(0, 3) ?? '' });
  }

  onAlias(alias: string): void {
    this.svc.patchSource({ alias });
  }

  private async loadTables(schema: string): Promise<void> {
    const dsId = this.svc.datasourceId();
    if (!dsId || !schema) {
      this.tables.set([]);
      return;
    }
    this.loadingTables.set(true);
    try {
      const res: any = await this.datasources.listSchemaTables(
        { datasourceId: dsId, schemaName: schema },
        true,
      );
      const rows: any[] = res?.data ?? [];
      this.tables.set(
        rows.map((r: any) => {
          const name = r.table_name ?? r.tableName ?? r.name ?? String(r);
          return { label: name, value: name };
        }),
      );
    } catch {
      this.tables.set([]);
    } finally {
      this.loadingTables.set(false);
    }
  }
}
