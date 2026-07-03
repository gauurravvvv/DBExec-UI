import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { DbAccessService } from '../../services/db-access.service';

/**
 * DbEffectivePrivilegesComponent — pick a role, view its effective
 * privileges (the recursive membership union) with a "via" provenance
 * column showing which role each privilege was inherited through
 * (FR-4.4). Read-only.
 */
@Component({
  selector: 'app-db-effective-privileges',
  templateUrl: './db-effective-privileges.component.html',
  styleUrls: ['./db-effective-privileges.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbEffectivePrivilegesComponent implements OnInit {
  @Input() datasourceId = '';

  private cdr = inject(ChangeDetectorRef);

  roleOptions: { label: string; value: string }[] = [];
  selectedRole = '';
  rows: any[] = [];
  loadingRows = false;

  constructor(private dbAccess: DbAccessService) {}

  ngOnInit(): void {
    this.dbAccess.loadRoles(this.datasourceId).then(() => {
      this.roleOptions = (this.dbAccess.roles() ?? []).map(r => ({
        label: r.name,
        value: r.name,
      }));
      this.cdr.markForCheck();
    }).catch(() => {});
  }

  onRoleChange(role: any): void {
    this.selectedRole = role;
    if (!role) {
      this.rows = [];
      return;
    }
    this.loadingRows = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadEffective(this.datasourceId, role)
      .then(res => {
        if (res?.status) this.rows = res.data ?? [];
        else this.rows = [];
      })
      .catch(() => (this.rows = []))
      .finally(() => {
        this.loadingRows = false;
        this.cdr.markForCheck();
      });
  }
}
