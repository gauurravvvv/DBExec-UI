import {
  ChangeDetectionStrategy,
  Component,
  Input,
} from '@angular/core';

/** A single audit-derived activity row. */
export interface ActivityEntry {
  id: string;
  actorName: string | null;
  action: string; // e.g. EXECUTE, CREATE, EXPORT, DELETE, UPDATE
  module?: string;
  entityName?: string | null;
  entityType?: string | null;
  responseSuccess?: boolean;
  createdOn: string | Date;
}

/**
 * app-activity-item — one row of the recent-activity feed.
 *
 * Shows an actor initials avatar, a human sentence ("<actor> <verb>
 * <target>"), an action tag coloured by kind, and a relative time.
 * The verb text is supplied already-localized by the parent (it maps
 * the raw action to a DASHBOARD.VERB.* key); this component only
 * renders. Relative time uses the app's RelativeTimePipe.
 */
@Component({
  selector: 'app-activity-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './activity-item.component.html',
  styleUrls: ['./activity-item.component.scss'],
})
export class ActivityItemComponent {
  @Input() entry!: ActivityEntry;
  /** Localized verb phrase, e.g. "executed prompt". */
  @Input() verb = '';

  get actorLabel(): string {
    return this.entry?.actorName || 'System';
  }

  get initials(): string {
    const name = this.actorLabel.trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /** Deterministic avatar tone from the actor name (theme tokens). */
  get avatarVar(): string {
    const vars = [
      '--primary-color',
      '--success-color',
      '--info-color',
      '--warning-color',
      '--error-color',
    ];
    const key = this.actorLabel;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return vars[h % vars.length];
  }

  /** Tag kind → css modifier, from the raw action. */
  get tagKind(): string {
    const a = (this.entry?.action || '').toUpperCase();
    if (a === 'EXECUTE') return 'execute';
    if (a === 'CREATE') return 'create';
    if (a === 'EXPORT' || a === 'IMPORT') return 'export';
    if (a === 'DELETE') return 'delete';
    if (a === 'UPDATE' || a === 'CONFIG') return 'update';
    return 'neutral';
  }
}
