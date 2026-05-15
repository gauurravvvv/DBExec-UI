import {
  animate,
  AnimationTriggerMetadata,
  style,
  transition,
  trigger,
} from '@angular/animations';

/**
 * Schema-tree expand/collapse animation. Used on the inline lists that
 * appear/disappear when a user toggles a datasource, schema, or table row.
 *
 * Plays a short opacity + max-height transition so the tree doesn't jump.
 * Animations apply on the `*ngIf` enter/leave hooks — no DOM-structure
 * changes required at the call site.
 *
 * Kept light on purpose:
 *   - 160ms is fast enough that long lists (50+ tables) don't feel sluggish.
 *   - max-height is set to a generous overshoot rather than `auto`, since
 *     animating to `auto` is not supported by the CSS animation engine.
 *   - Tweens use `ease-out` for the enter (element settling in) and
 *     `ease-in` for the leave (element collapsing away) — matches OS-native
 *     dropdown feel.
 */
export const expandAnimation: AnimationTriggerMetadata = trigger('expand', [
  transition(':enter', [
    style({ opacity: 0, maxHeight: 0, overflow: 'hidden' }),
    animate(
      '160ms ease-out',
      style({ opacity: 1, maxHeight: '2000px', overflow: 'hidden' }),
    ),
  ]),
  transition(':leave', [
    style({ opacity: 1, maxHeight: '2000px', overflow: 'hidden' }),
    animate(
      '120ms ease-in',
      style({ opacity: 0, maxHeight: 0, overflow: 'hidden' }),
    ),
  ]),
]);
