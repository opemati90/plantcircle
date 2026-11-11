import { zonedTimeToUtc } from '../../dates';
import type { City, Plan } from '../types';

// DEVELOPMENT FIXTURES ONLY (see ../index.ts). Sample data matching the prototype.

export const fixtureCities: City[] = [
  { id: 'berlin', name: 'Berlin', countryCode: 'DE', timezone: 'Europe/Berlin' },
  { id: 'lisbon', name: 'Lisbon', countryCode: 'PT', timezone: 'Europe/Lisbon' },
  { id: 'toronto', name: 'Toronto', countryCode: 'CA', timezone: 'America/Toronto' },
];

const TZ = 'Europe/Berlin';

/** The next occurrence of `weekday` (0 = Sunday) strictly after today, in Berlin. */
function nextWeekday(
  now: Date,
  weekday: number,
  hour: number,
  minute: number,
  weeksAhead = 0,
): Date {
  const first = 1 + weeksAhead * 7;
  for (let offset = first; offset < first + 7; offset += 1) {
    const day = new Date(now.getTime() + offset * 86_400_000);
    const candidate = zonedTimeToUtc(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      hour,
      minute,
      TZ,
    );
    if (candidate.getUTCDay() === weekday) return candidate;
  }
  throw new Error('unreachable: a week contains every weekday');
}

const hoursAfter = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 3_600_000).toISOString();

export interface FixtureBringItem {
  id: string;
  planId: string;
  label: string;
  quantity: number;
  claimedBy: string[];
}

export function fixturePlans(now: Date): Plan[] {
  const saturday = nextWeekday(now, 6, 17, 0);
  const sunday = nextWeekday(now, 0, 13, 0);
  // More than a week out, so it is reachable by link but not listed under "This week".
  const nextWeek = nextWeekday(now, 3, 19, 0, 1);
  const base = {
    cityId: 'berlin',
    city: 'Berlin',
    timezone: TZ,
    priceCents: 0,
    currency: 'EUR',
    imageFocus: null,
    hostVerified: false,
  };
  return [
    {
      ...base,
      id: 'cooking-night',
      title: 'West African Cooking Night',
      category: 'cooking_class',
      areaName: 'Neukölln',
      venueName: 'Neukölln Plant Kitchen',
      areaHint: 'Near U7 Rathaus Neukölln',
      startsAt: saturday.toISOString(),
      endsAt: hoursAfter(saturday, 3.5),
      revealAt: hoursAfter(saturday, -24),
      capacity: 8,
      description:
        'Learn jollof rice and efo riro with smoked tofu, then sit down and share dinner ' +
        'together. No experience needed — the main ingredients are provided.',
      allergens: 'Peanuts and soy',
      imagePath: '/images/cooking-together.jpg',
      imageAlt: 'Three women laughing while cooking vegetables together',
      imageFocus: '38% center',
      hostName: 'Ama O.',
      hostVerified: true,
      hostPlansCount: 6,
      goingCount: 4,
      attendeeInitials: ['M', 'J', 'S'],
      openBringSlots: 1,
    },
    {
      ...base,
      id: 'sunday-potluck',
      title: 'Sunday Community Potluck',
      category: 'potluck',
      areaName: 'Tempelhofer Feld',
      venueName: null,
      areaHint: 'Entrance Oderstraße',
      startsAt: sunday.toISOString(),
      endsAt: hoursAfter(sunday, 3),
      revealAt: hoursAfter(sunday, -24),
      capacity: 30,
      description: 'Bring a plant-based dish to share and meet people from the neighbourhood.',
      allergens: null,
      imagePath: '/images/potluck-spread.jpg',
      imageAlt: 'A potluck spread with hummus and vegetables',
      hostName: 'Mia S.',
      hostPlansCount: 2,
      goingCount: 14,
      attendeeInitials: ['J', 'S', 'K'],
      openBringSlots: 0,
    },
    {
      ...base,
      id: 'ramen-workshop',
      title: 'Vegan Ramen Workshop',
      category: 'cooking_class',
      areaName: 'Friedrichshain',
      venueName: null,
      areaHint: null,
      startsAt: nextWeek.toISOString(),
      endsAt: hoursAfter(nextWeek, 2.5),
      revealAt: hoursAfter(nextWeek, -24),
      capacity: 8,
      description: 'Make broth, tare and noodles from scratch with Kenji.',
      allergens: 'Soy, wheat and sesame',
      imagePath: '/images/pantry-jars.jpg',
      imageAlt: 'Jars of beans, oats and grains',
      hostName: 'Kenji T.',
      hostPlansCount: 3,
      goingCount: 8,
      attendeeInitials: ['M', 'J', 'S'],
      openBringSlots: 0,
    },
  ];
}

export const fixtureBringItems: FixtureBringItem[] = [
  {
    id: 'plantains',
    planId: 'cooking-night',
    label: 'Plantains',
    quantity: 2,
    claimedBy: ['Jonas'],
  },
  {
    id: 'drinks',
    planId: 'cooking-night',
    label: 'Drinks',
    quantity: 1,
    claimedBy: ['Mia S.'],
  },
];

export const fixtureAddresses: Record<string, string> = {
  'cooking-night': 'Weserstraße 12, 12047 Berlin',
};
