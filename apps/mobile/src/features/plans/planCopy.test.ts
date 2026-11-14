import { catalogs } from '@plantcircle/copy';
import { createInstance, type TFunction } from 'i18next';
import type { BringItem, Plan } from '../../lib/backend/types';
import {
  addressNote,
  placeLabel,
  allergenNote,
  bringItemNote,
  goingLabel,
  offerFraction,
  placeInLine,
  priceLabel,
  spotsLabel,
  spotsLeftShort,
  timeLeft,
} from './planCopy';

async function translator(language: 'en' | 'de'): Promise<TFunction> {
  const instance = createInstance();
  await instance.init({
    lng: language,
    resources: { [language]: { translation: catalogs[language] } },
    interpolation: { escapeValue: false },
  });
  return instance.t;
}

const plan: Plan = {
  id: 'p1',
  title: 'West African Cooking Night',
  category: 'cooking_night',
  format: 'in_person',
  cityId: 'c1',
  city: 'Berlin',
  areaName: 'Neukölln',
  venueName: 'Neukölln Plant Kitchen',
  areaHint: 'Near U7 Rathaus Neukölln',
  startsAt: '2026-11-07T16:00:00.000Z',
  endsAt: '2026-11-07T19:30:00.000Z',
  revealAt: '2026-11-06T16:00:00.000Z',
  timezone: 'Europe/Berlin',
  capacity: 8,
  priceCents: 0,
  currency: 'EUR',
  description: '',
  allergens: 'Peanuts and soy',
  imagePath: null,
  imageAlt: null,
  imageFocus: null,
  hostName: 'Ama O.',
  hostVerified: true,
  hostFeatured: true,
  hostPlansCount: 6,
  goingCount: 4,
  attendeeInitials: ['M', 'J', 'S'],
  openBringSlots: 1,
  waitlistCount: 0,
  hasOpenSpot: true,
};

const item: BringItem = {
  id: 'i1',
  label: 'Plantains',
  quantity: 2,
  claimedCount: 1,
  claimedBy: ['Jonas'],
  claimedByMe: false,
};

describe('English', () => {
  let t: TFunction;
  beforeAll(async () => {
    t = await translator('en');
  });

  it('matches the prototype for a guest and a visitor', () => {
    expect(goingLabel(t, plan, false)).toBe('4 people are going');
    expect(spotsLabel(t, plan)).toBe('4 of 8 spots left');
    expect(goingLabel(t, { ...plan, goingCount: 5 }, true)).toBe('You and 4 others are going');
    expect(spotsLabel(t, { ...plan, goingCount: 5 })).toBe('3 of 8 spots left');
  });

  it('handles singular, empty and full Plans', () => {
    expect(goingLabel(t, { ...plan, goingCount: 1 }, false)).toBe('1 person is going');
    expect(goingLabel(t, { ...plan, goingCount: 2 }, true)).toBe('You and 1 other are going');
    expect(goingLabel(t, { ...plan, goingCount: 1 }, true)).toBe('You’re going');
    expect(goingLabel(t, { ...plan, goingCount: 0 }, false)).toBe('Be the first to join');
    expect(goingLabel(t, { ...plan, goingCount: 8, hasOpenSpot: false }, false)).toBe(
      'All 8 spots are taken',
    );
    expect(spotsLeftShort(t, { ...plan, goingCount: 7 })).toBe('1 spot left');
    expect(spotsLeftShort(t, { ...plan, goingCount: 9 })).toBe('Full');
  });

  it('never shows an address the viewer was not given', () => {
    expect(addressNote(t, plan, false, null)).toBe(
      'Near U7 Rathaus Neukölln · exact address after you join',
    );
    expect(addressNote(t, plan, true, null)).toBe(
      'Address unlocks Friday, 17:00 · Near U7 Rathaus Neukölln',
    );
    expect(addressNote(t, { ...plan, areaHint: null }, false, null)).toBe(
      'exact address after you join',
    );
    expect(addressNote(t, plan, true, 'Weserstr. 1')).toBe('Weserstr. 1');
  });

  it('describes open and claimed items', () => {
    expect(bringItemNote(t, item)).toBe('1 of 2 still open');
    expect(bringItemNote(t, { ...item, claimedCount: 2, claimedBy: ['Mia S.', 'Jonas'] })).toBe(
      'Mia S., Jonas are bringing these',
    );
    expect(bringItemNote(t, { ...item, quantity: 1, claimedBy: ['Mia S.'] })).toBe(
      'Mia S. is bringing this',
    );
    expect(
      bringItemNote(t, { ...item, quantity: 1, claimedBy: ['Lena'], claimedByMe: true }),
    ).toBe('You’re bringing this');
  });

  it('never implies safety when the host has not confirmed allergens', () => {
    expect(allergenNote(t, { ...plan, allergens: null })).toMatch(/not confirmed/);
    expect(allergenNote(t, plan)).toBe('Peanuts and soy, as declared by the host.');
  });

  it('writes places in line as ordinals', () => {
    expect([1, 2, 3, 4, 11, 22].map((n) => placeInLine(t, n))).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '22nd',
    ]);
    expect(t('plan.wouldBe', { place: placeInLine(t, 4) })).toBe('You’d be 4th in line');
  });

  it('formats paid Plans in their own currency', () => {
    expect(priceLabel(t, plan, 'en')).toBe('Free');
    expect(priceLabel(t, { ...plan, priceCents: 1800 }, 'en')).toBe('€18.00');
    expect(priceLabel(t, { ...plan, priceCents: 1800, currency: 'CAD' }, 'en')).toBe(
      'CA$18.00',
    );
  });
});

describe('offer countdown', () => {
  const now = new Date('2026-11-05T14:48:00.000Z');

  it('shows hours and minutes left and never goes negative', () => {
    expect(timeLeft('2026-11-05T16:30:00.000Z', now)).toBe('1:42');
    expect(timeLeft('2026-11-05T14:48:30.000Z', now)).toBe('0:01');
    expect(timeLeft('2026-11-05T14:00:00.000Z', now)).toBe('0:00');
  });

  it('reports how much of the 2 hours remains', () => {
    expect(offerFraction('2026-11-05T16:48:00.000Z', now)).toBe(1);
    expect(offerFraction('2026-11-05T15:48:00.000Z', now)).toBe(0.5);
    expect(offerFraction('2026-11-05T13:00:00.000Z', now)).toBe(0);
  });
});

describe('German', () => {
  let t: TFunction;
  beforeAll(async () => {
    t = await translator('de');
  });

  it('uses the strings from the German prototype screens', () => {
    expect(goingLabel(t, plan, false)).toBe('4 dabei');
    expect(goingLabel(t, { ...plan, goingCount: 5 }, true)).toBe('Du + 4 dabei');
    expect(spotsLabel(t, plan)).toBe('Noch 4 von 8 Plätzen');
    expect(spotsLeftShort(t, plan)).toBe('Noch 4 Plätze');
    expect(spotsLeftShort(t, { ...plan, goingCount: 7 })).toBe('Noch 1 Platz');
    expect(bringItemNote(t, item)).toBe('1 von 2 noch offen');
    expect(priceLabel(t, plan, 'de')).toBe('Kostenlos');
    expect(placeInLine(t, 4)).toBe('4.');
  });
});

describe('online Plans', () => {
  const online: Plan = { ...plan, format: 'online', id: 'o1', areaName: 'Online' };
  let t: TFunction;
  beforeAll(async () => {
    t = await translator('en');
  });

  it('label the place "Online" instead of an area', () => {
    expect(placeLabel(t, online)).toBe(catalogs.en.plan.onlineTitle);
    expect(placeLabel(t, plan)).toBe('Neukölln');
  });

  it('never shows a link note to people who are not going', () => {
    expect(addressNote(t, online, false, null, null)).toBe(catalogs.en.plan.onlineForGuests);
  });

  it('shows when the link opens to confirmed guests before it is released', () => {
    expect(addressNote(t, online, true, null, null)).toMatch(/^Google Meet · link opens /);
  });

  it('describes the meeting service once the link is shown', () => {
    expect(addressNote(t, online, true, null, 'https://meet.google.com/abc-defg-hij')).toBe(
      catalogs.en.plan.onlineForGuests,
    );
  });
});
