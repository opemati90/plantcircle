import { zonedTimeToUtc } from '../../dates';
import type { Circle, City, Person, Plan, RecipeDetail } from '../types';

// DEVELOPMENT FIXTURES ONLY (see ../index.ts). Sample data matching the prototype.

/** Mirrors supabase/seed.sql, the starter city list. */
export const fixtureCities: City[] = [
  { id: 'berlin', name: 'Berlin', countryCode: 'DE', timezone: 'Europe/Berlin' },
  { id: 'hamburg', name: 'Hamburg', countryCode: 'DE', timezone: 'Europe/Berlin' },
  { id: 'munich', name: 'Munich', countryCode: 'DE', timezone: 'Europe/Berlin' },
  { id: 'cologne', name: 'Cologne', countryCode: 'DE', timezone: 'Europe/Berlin' },
  { id: 'lisbon', name: 'Lisbon', countryCode: 'PT', timezone: 'Europe/Lisbon' },
  { id: 'porto', name: 'Porto', countryCode: 'PT', timezone: 'Europe/Lisbon' },
  { id: 'london', name: 'London', countryCode: 'GB', timezone: 'Europe/London' },
  { id: 'amsterdam', name: 'Amsterdam', countryCode: 'NL', timezone: 'Europe/Amsterdam' },
  { id: 'paris', name: 'Paris', countryCode: 'FR', timezone: 'Europe/Paris' },
  { id: 'milan', name: 'Milan', countryCode: 'IT', timezone: 'Europe/Rome' },
  { id: 'rome', name: 'Rome', countryCode: 'IT', timezone: 'Europe/Rome' },
  { id: 'warsaw', name: 'Warsaw', countryCode: 'PL', timezone: 'Europe/Warsaw' },
  { id: 'toronto', name: 'Toronto', countryCode: 'CA', timezone: 'America/Toronto' },
  { id: 'new-york', name: 'New York', countryCode: 'US', timezone: 'America/New_York' },
  {
    id: 'mexico-city',
    name: 'Mexico City',
    countryCode: 'MX',
    timezone: 'America/Mexico_City',
  },
  { id: 'sao-paulo', name: 'São Paulo', countryCode: 'BR', timezone: 'America/Sao_Paulo' },
  { id: 'lagos', name: 'Lagos', countryCode: 'NG', timezone: 'Africa/Lagos' },
  { id: 'nairobi', name: 'Nairobi', countryCode: 'KE', timezone: 'Africa/Nairobi' },
  { id: 'accra', name: 'Accra', countryCode: 'GH', timezone: 'Africa/Accra' },
  {
    id: 'johannesburg',
    name: 'Johannesburg',
    countryCode: 'ZA',
    timezone: 'Africa/Johannesburg',
  },
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
    format: 'in_person' as const,
    cityId: 'berlin',
    city: 'Berlin',
    timezone: TZ,
    priceCents: 0,
    currency: 'EUR',
    imageFocus: null,
    hostVerified: false,
    hostFeatured: false,
    waitlistCount: 0,
    hasOpenSpot: true,
  };
  return [
    {
      ...base,
      id: 'cooking-night',
      title: 'West African Cooking Night',
      category: 'cooking_night',
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
      hostFeatured: true,
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
      category: 'cooking_night',
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
      waitlistCount: 3,
      hasOpenSpot: false,
      attendeeInitials: ['M', 'J', 'S'],
      openBringSlots: 0,
    },
    {
      ...base,
      format: 'online' as const,
      id: 'feijoada-online',
      title: 'Vegan Feijoada (online)',
      category: 'online_class',
      areaName: 'Online',
      venueName: null,
      areaHint: null,
      // Next week, so it sits outside "This week" but is listed in Explore.
      startsAt: nextWeekday(now, 2, 19, 0, 1).toISOString(),
      endsAt: hoursAfter(nextWeekday(now, 2, 19, 0, 1), 2),
      // The link opens 10 minutes before the start, for confirmed guests only.
      revealAt: new Date(nextWeekday(now, 2, 19, 0, 1).getTime() - 10 * 60_000).toISOString(),
      capacity: 12,
      description: 'Cook along from home with Ama. Shopping list sent after you join.',
      allergens: null,
      imagePath: null,
      imageAlt: null,
      hostName: 'Ama O.',
      hostPlansCount: 1,
      goingCount: 4,
      attendeeInitials: ['A', 'L', 'M'],
      openBringSlots: 0,
      waitlistCount: 0,
      hasOpenSpot: true,
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

/** Development only: Circles listed publicly. An invite-only Circle is never listed. */
export const fixtureCircles: Circle[] = [
  {
    id: 'neukolln-plant-kitchen',
    name: 'Neukölln Plant Kitchen',
    tagline: 'Cooking nights and potlucks',
    cityId: 'berlin',
    city: 'Berlin',
    isGlobal: false,
    access: 'open',
    joinQuestion: null,
    memberCount: 42,
    viewerRole: null,
    viewerRequestPending: false,
    ownerName: 'Ama O.',
  },
  {
    id: 'budget-plant-cooking',
    name: 'Budget Plant Cooking',
    tagline: 'Shared orders, approval needed',
    cityId: 'berlin',
    city: 'Berlin',
    isGlobal: false,
    access: 'request',
    joinQuestion: 'What do you like to cook?',
    memberCount: 18,
    viewerRole: null,
    viewerRequestPending: false,
    ownerName: 'Jonas K.',
  },
  {
    id: 'new-to-plant-based',
    name: 'New to Plant-Based',
    tagline: 'Beginners welcome · online',
    cityId: null,
    city: null,
    isGlobal: true,
    access: 'open',
    joinQuestion: null,
    memberCount: 120,
    viewerRole: null,
    viewerRequestPending: false,
    ownerName: 'Mia S.',
  },
];

export const fixtureAddresses: Record<string, string> = {
  'cooking-night': 'Weserstraße 12, 12047 Berlin',
};

/** Development only: the Google Meet link for online Plans, shown to confirmed guests. */
export const fixtureMeetingUrls: Record<string, string> = {
  'feijoada-online': 'https://meet.google.com/sample-link-only',
};

/** Recipes shared into the fixture Circles. The viewer sees those of Circles they are in. */
export const fixtureRecipes: RecipeDetail[] = [
  {
    id: 'efo-riro-smoked-tofu',
    title: 'Efo Riro with Smoked Tofu',
    cuisine: 'Nigerian',
    serves: 4,
    minutes: 45,
    intro:
      'A Yoruba spinach stew. Smoked tofu stands in for stockfish and brings the same deep flavour.',
    allergens: [],
    allergensConfirmed: false,
    circleId: 'neukolln-plant-kitchen',
    circleName: 'Neukölln Plant Kitchen',
    authorId: 'fixture-ama',
    authorName: 'Ama O.',
    votes: 38,
    voted: false,
    followingAuthor: false,
    createdAt: '2026-11-10T10:00:00Z',
    ingredients: [
      { name: 'Spinach or kale', qty: 500, unit: 'g' },
      { name: 'Smoked tofu', qty: 200, unit: 'g' },
      { name: 'Red bell peppers', qty: 2, unit: null },
      { name: 'Onion', qty: 1, unit: null },
    ],
    steps: [
      'Blend the peppers, scotch bonnet and half the onion.',
      'Fry the rest of the onion, add the blend and cook for 15 minutes.',
      'Add the tofu and greens, stir until wilted. Serve with rice.',
    ],
  },
  {
    id: 'five-minute-hummus-board',
    title: 'Five-minute hummus board',
    cuisine: null,
    serves: 4,
    minutes: 5,
    intro: null,
    allergens: ['sesame'],
    allergensConfirmed: true,
    circleId: 'new-to-plant-based',
    circleName: 'New to Plant-Based',
    authorId: 'fixture-mia-k',
    authorName: 'Mia S.',
    votes: 12,
    voted: false,
    followingAuthor: false,
    createdAt: '2026-11-09T10:00:00Z',
    ingredients: [
      { name: 'Chickpeas, tinned', qty: 400, unit: 'g' },
      { name: 'Tahini', qty: 2, unit: 'tbsp' },
      { name: 'Lemon', qty: 1, unit: null },
    ],
    steps: [
      'Drain the chickpeas and blend them with the tahini, lemon and a pinch of salt.',
      'Spread on a board and finish with olive oil.',
    ],
  },
  {
    id: 'dried-beans-for-the-week',
    title: 'Dried beans for the week',
    cuisine: null,
    serves: 6,
    minutes: 90,
    intro: 'Soak once, cook a big pot, and eat it three ways.',
    allergens: ['none'],
    allergensConfirmed: true,
    circleId: 'budget-plant-cooking',
    circleName: 'Budget Plant Cooking',
    authorId: 'fixture-jonas',
    authorName: 'Jonas K.',
    votes: 5,
    voted: false,
    followingAuthor: false,
    createdAt: '2026-11-08T10:00:00Z',
    ingredients: [
      { name: 'Dried beans', qty: 500, unit: 'g' },
      { name: 'Onion', qty: 1, unit: null },
      { name: 'Bay leaves', qty: 2, unit: null },
    ],
    steps: ['Soak the beans overnight.', 'Simmer with the onion and bay for about 90 minutes.'],
  },
];

/** Members who chose to be visible. The viewer sees them only through a Circle they share. */
export const fixturePeople: { person: Person; circleId: string }[] = [
  {
    circleId: 'neukolln-plant-kitchen',
    person: {
      userId: 'fixture-mia-k',
      displayName: 'Mia K.',
      city: 'Berlin',
      circleNames: ['Neukölln Plant Kitchen'],
      connection: 'requested_by_them',
    },
  },
  {
    circleId: 'budget-plant-cooking',
    person: {
      userId: 'fixture-jonas-k',
      displayName: 'Jonas K.',
      city: 'Berlin',
      circleNames: ['Budget Plant Cooking'],
      connection: 'none',
    },
  },
];
