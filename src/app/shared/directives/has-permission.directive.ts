/**
 * *hasPermission — structural directive that renders its template
 * only when the current user has the required level on a permission.
 *
 * Usage:
 *   <button *hasPermission="'users'">View</button>                  <!-- READ -->
 *   <button *hasPermission="'users'; level: 'write'">Edit</button>  <!-- WRITE -->
 *   <button *hasPermission="'users'; level: 'delete'">Del</button>  <!-- FULL -->
 *
 * Numeric levels are accepted too if you'd rather import ACCESS:
 *   <button *hasPermission="'users'; level: 3">Del</button>
 *
 * Backed by PermissionService — re-evaluates only when the directive
 * input changes (not on every change-detection tick), so binding it
 * across hundreds of buttons in a list view is cheap.
 *
 * Module: declared in the shared SharedModule so any feature module
 * can use it without re-importing. Standalone components import the
 * symbol directly.
 */
import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  inject,
} from '@angular/core';
import {
  ACCESS,
  AccessLevel,
  PermissionService,
} from 'src/app/core/services/permission.service';

type LevelKey = 'read' | 'write' | 'delete' | 'full';

const LEVEL_MAP: Record<LevelKey, AccessLevel> = {
  read: ACCESS.READ,
  write: ACCESS.WRITE,
  delete: ACCESS.FULL,
  full: ACCESS.FULL,
};

@Directive({
  selector: '[hasPermission]',
})
export class HasPermissionDirective {
  private readonly template = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly permission = inject(PermissionService);

  private permissionValue = '';
  private requiredLevel: AccessLevel = ACCESS.READ;
  private rendered = false;

  @Input() set hasPermission(value: string) {
    this.permissionValue = value;
    this.update();
  }

  @Input() set hasPermissionLevel(level: LevelKey | AccessLevel) {
    if (typeof level === 'number') {
      this.requiredLevel = level as AccessLevel;
    } else {
      this.requiredLevel = LEVEL_MAP[level] ?? ACCESS.READ;
    }
    this.update();
  }

  private update(): void {
    const allowed =
      !!this.permissionValue &&
      this.permission.hasLevel(this.permissionValue, this.requiredLevel);
    if (allowed && !this.rendered) {
      this.viewContainer.createEmbeddedView(this.template);
      this.rendered = true;
    } else if (!allowed && this.rendered) {
      this.viewContainer.clear();
      this.rendered = false;
    }
  }
}
