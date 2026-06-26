import { NotificationRow } from 'src/app/core/services/notification.service';

export type DateBucket =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'thisMonth'
  | 'older';

export interface NotificationGroup {
  bucket: DateBucket;
  /** i18n key (NOTIFICATION.GROUP_*) — translated at render time. */
  label: string;
  items: NotificationRow[];
}

const LABELS: Record<DateBucket, string> = {
  today: 'NOTIFICATION.GROUP_TODAY',
  yesterday: 'NOTIFICATION.GROUP_YESTERDAY',
  thisWeek: 'NOTIFICATION.GROUP_THIS_WEEK',
  thisMonth: 'NOTIFICATION.GROUP_THIS_MONTH',
  older: 'NOTIFICATION.GROUP_OLDER',
};

/**
 * Group notifications by calendar bucket (Today / Yesterday /
 * This week / This month / Older). The ranges are calendar-based
 * (not rolling-window), so a notification at 23:59 yesterday lands
 * in "Yesterday" — same way Gmail or Slack present timelines.
 *
 * Pure function; `now` is injectable to keep tests deterministic.
 * Empty buckets are filtered out so the UI doesn't render lonely
 * group headers.
 */
export function groupByDateBucket(
  items: NotificationRow[],
  now: Date = new Date(),
): NotificationGroup[] {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  // ISO week: Monday is day 1; Sunday is day 7.
  const isoDow = now.getDay() === 0 ? 7 : now.getDay();
  const weekStart = todayStart - (isoDow - 1) * 24 * 60 * 60 * 1000;
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).getTime();

  const buckets: Record<DateBucket, NotificationRow[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  for (const n of items) {
    const t = new Date(n.createdOn).getTime();
    if (Number.isNaN(t)) {
      // Defensive — malformed timestamp lands in "older" so the row
      // is still visible to the user (better than dropping silently).
      buckets.older.push(n);
      continue;
    }
    if (t >= todayStart) buckets.today.push(n);
    else if (t >= yesterdayStart) buckets.yesterday.push(n);
    else if (t >= weekStart) buckets.thisWeek.push(n);
    else if (t >= monthStart) buckets.thisMonth.push(n);
    else buckets.older.push(n);
  }

  const order: DateBucket[] = [
    'today',
    'yesterday',
    'thisWeek',
    'thisMonth',
    'older',
  ];

  return order
    .filter(k => buckets[k].length > 0)
    .map(k => ({ bucket: k, label: LABELS[k], items: buckets[k] }));
}
