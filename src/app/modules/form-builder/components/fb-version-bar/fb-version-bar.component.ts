import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { FormVersionSummary, VersionState } from '../../services/fb-types';

/**
 * Draft/published banner + version picker + Publish/Fork actions. Draft →
 * info bar + Publish; published/retired → read-only banner + Fork.
 */
@Component({
  selector: 'fb-version-bar',
  templateUrl: './fb-version-bar.component.html',
  styleUrls: ['./fb-version-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbVersionBarComponent {
  @Input() status: VersionState = 'draft';
  @Input() canPublish = false;
  @Input() set versions(list: FormVersionSummary[]) {
    this.versionOptions = (list ?? []).map(v => ({
      version: v.version,
      label: `v${v.version} · ${v.state}`,
    }));
  }
  @Input() version = 1;
  @Output() publish = new EventEmitter<void>();
  @Output() fork = new EventEmitter<void>();
  @Output() versionChange = new EventEmitter<number>();

  versionOptions: { version: number; label: string }[] = [];
}
