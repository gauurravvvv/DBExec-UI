/**
 * qb-settings — admin editor for a builder's execution settings (spec §10.2).
 *
 * Row limits, forceDistinct, the operator-engine flag, and the base
 * schema/table/alias the compiler builds FROM. Loaded and saved via
 * QbAdminService; the server clamps values on execute regardless.
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { QbAdminService, QbSettings } from '../../services/qb-admin.service';

@Component({
  selector: 'qb-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-settings.component.html',
  styleUrls: ['./qb-settings.component.scss'],
})
export class QbSettingsComponent implements OnInit {
  @Input({ required: true }) queryBuilderId!: string;

  private readonly admin = inject(QbAdminService);
  private readonly global = inject(GlobalService);

  readonly model = signal<QbSettings>({
    defaultLimit: 1000,
    maxLimit: 50000,
    forceDistinct: false,
    mandatoryFilter: null,
    usesOperatorEngine: true,
    baseSchema: null,
    baseTable: null,
    baseAlias: null,
  });
  readonly loading = signal(true);
  readonly saving = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.getSettings(this.queryBuilderId);
      const s = res?.data;
      if (s) this.model.set({ ...this.model(), ...s });
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load settings');
    } finally {
      this.loading.set(false);
    }
  }

  patch<K extends keyof QbSettings>(key: K, value: QbSettings[K]): void {
    this.model.update(m => ({ ...m, [key]: value }));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const res = await this.admin.saveSettings(this.queryBuilderId, this.model());
      this.global.handleAPIResponse(res);
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
