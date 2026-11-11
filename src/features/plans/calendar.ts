import type { Plan } from '../../data/types';

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** RFC 5545 TEXT escaping. */
const escapeText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

/**
 * A single-event iCalendar file. The location is the neighbourhood unless the
 * viewer has been given the exact address.
 */
export function buildIcs(plan: Plan, url: string, address: string | null, now: Date): string {
  const location = address ?? [plan.venueName, plan.areaName].filter(Boolean).join(', ');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlantCircle//Plans//EN',
    'BEGIN:VEVENT',
    `UID:plan-${plan.id}@plantcircle.app`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(new Date(plan.startsAt).toISOString())}`,
    `DTEND:${stamp(new Date(plan.endsAt).toISOString())}`,
    `SUMMARY:${escapeText(plan.title)}`,
    `LOCATION:${escapeText(location)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export function downloadIcs(plan: Plan, address: string | null): void {
  const ics = buildIcs(plan, window.location.href, address, new Date());
  const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = `${plan.title.replace(/[^\p{L}\p{N}]+/gu, '-')}.ics`;
  link.click();
  URL.revokeObjectURL(href);
}
