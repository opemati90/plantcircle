import { describe, expect, it } from 'vitest';
import type { BringItem, Plan } from '../../data/types';
import {
  addressNote,
  allergenNote,
  bringItemNote,
  goingLabel,
  priceLabel,
  spotsLabel,
  spotsLeftShort,
} from './planCopy';

const plan: Plan = {
  id: 'p1',
  title: 'West African Cooking Night',
  category: 'cooking_class',
  city: 'Berlin',
  areaName: 'Neukölln',
  venueName: 'Neukölln Plant Kitchen',
  areaHint: 'Near U7 Rathaus Neukölln',
  startsAt: '2026-11-07T16:00:00.000Z',
  endsAt: '2026-11-07T19:30:00.000Z',
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
  hostPlansCount: 6,
  goingCount: 4,
  attendeeInitials: ['M', 'J', 'S'],
  openBringSlots: 1,
};

describe('attendance copy', () => {
  it('matches the design for a guest and a visitor', () => {
    expect(goingLabel(plan, false)).toBe('4 people are going');
    expect(spotsLabel(plan)).toBe('4 of 8 spots left');
    expect(goingLabel({ ...plan, goingCount: 5 }, true)).toBe('You and 4 others are going');
    expect(spotsLabel({ ...plan, goingCount: 5 })).toBe('3 of 8 spots left');
  });

  it('handles singular, empty and full Plans', () => {
    expect(goingLabel({ ...plan, goingCount: 1 }, false)).toBe('1 person is going');
    expect(goingLabel({ ...plan, goingCount: 2 }, true)).toBe('You and 1 other are going');
    expect(goingLabel({ ...plan, goingCount: 0 }, false)).toBe('Be the first to join');
    expect(goingLabel({ ...plan, goingCount: 8 }, false)).toBe('All 8 spots are taken');
    expect(spotsLeftShort({ ...plan, goingCount: 7 })).toBe('1 spot left');
    expect(spotsLeftShort({ ...plan, goingCount: 9 })).toBe('Full');
  });
});

describe('addressNote', () => {
  it('never shows an address the viewer was not given', () => {
    expect(addressNote(plan, false, null)).toBe(
      'Near U7 Rathaus Neukölln · exact address after you join',
    );
    expect(addressNote(plan, true, null)).toBe(
      'Address unlocks Friday, 17:00 · Near U7 Rathaus Neukölln',
    );
    expect(addressNote(plan, true, 'Weserstr. 1')).toBe('Weserstr. 1');
  });
});

describe('bringItemNote', () => {
  const item: BringItem = {
    id: 'i1',
    label: 'Plantains',
    quantity: 2,
    claimedCount: 1,
    claimedBy: ['Jonas'],
    claimedByMe: false,
  };

  it('describes open and claimed items', () => {
    expect(bringItemNote(item)).toBe('1 of 2 still open');
    expect(bringItemNote({ ...item, claimedCount: 2, claimedBy: ['Mia S.', 'Jonas'] })).toBe(
      'Mia S., Jonas are bringing these',
    );
    expect(
      bringItemNote({ ...item, quantity: 1, claimedBy: ['Lena'], claimedByMe: true }),
    ).toBe('You’re bringing this');
  });
});

describe('allergens and price', () => {
  it('never implies safety when the host has not confirmed allergens', () => {
    expect(allergenNote({ ...plan, allergens: null })).toMatch(/not confirmed/);
    expect(allergenNote(plan)).toBe('Peanuts and soy, as declared by the host.');
  });

  it('formats paid Plans in their currency', () => {
    expect(priceLabel(plan)).toBe('Free');
    expect(priceLabel({ ...plan, priceCents: 1800 })).toBe('€18.00');
  });
});
