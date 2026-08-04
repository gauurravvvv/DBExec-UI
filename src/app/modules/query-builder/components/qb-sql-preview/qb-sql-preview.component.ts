/**
 * qb-sql-preview — read-only Monaco showing the server-generated SQL.
 *
 * The SQL is never built in the browser; this component only displays what the
 * /preview endpoint returned. Mounts through the shared CodeEditorService so it
 * uses the one Monaco theme + chrome.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';

@Component({
  selector: 'qb-sql-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-sql-preview.component.html',
  styleUrls: ['./qb-sql-preview.component.scss'],
})
export class QbSqlPreviewComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() sql = '';
  @Input() warnings: string[] = [];

  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;

  private readonly codeEditor = inject(CodeEditorService);
  private handle: EditorHandle | null = null;

  async ngAfterViewInit(): Promise<void> {
    this.handle = await this.codeEditor.create({
      host: this.host.nativeElement,
      flavour: 'sql',
      readOnly: true,
      value: this.sql,
    });
  }

  ngOnChanges(): void {
    if (this.handle) this.handle.setValue(this.sql ?? '');
  }

  ngOnDestroy(): void {
    this.handle?.dispose();
    this.handle = null;
  }
}
