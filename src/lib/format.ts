/**
 * One timestamp format for the whole app. Mixed granularities ("9 days ago"
 * next to "2 weeks ago") were a real inconsistency in the first designs.
 */

/**
 * Past this many days a count stops being information and becomes arithmetic —
 * nobody reads "43 DAYS AGO" as a time, they read it as a number they would
 * have to subtract. The calendar date is what someone actually recognises.
 */
const RELATIVE_LIMIT = 10;

/** Spelled out rather than taken from Intl, which Hermes does not always carry. */
const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

export function relativeDate(iso: string | null): string {
  if (!iso) return '';

  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);

  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < RELATIVE_LIMIT) return `${days} DAYS AGO`;

  const stamp = `${MONTHS[then.getMonth()]} ${then.getDate()}`;

  // A bare "AUG 10" on a roll from a previous year reads as this August.
  const sameYear = then.getFullYear() === new Date().getFullYear();
  return sameYear ? stamp : `${stamp} ${then.getFullYear()}`;
}
