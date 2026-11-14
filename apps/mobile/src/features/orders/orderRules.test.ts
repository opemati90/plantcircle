import type { GroupOrder } from '../../lib/backend/types';
import { amount, canChangeInterest, money, myEstimate, progress } from './orderRules';

const order = (over: Partial<GroupOrder> = {}): GroupOrder => ({
  id: 'o',
  title: 'Bulk',
  description: '',
  organizerId: 'j',
  organizerName: 'Jonas',
  supplierName: 'Farm',
  supplierArea: null,
  closesAt: '2030-06-01T18:00:00Z',
  pickupStart: '2030-06-03T10:00:00Z',
  pickupEnd: '2030-06-03T13:00:00Z',
  pickupNote: null,
  timezone: 'Europe/Berlin',
  pickupAddress: null,
  state: 'collecting',
  extendedOnce: false,
  targetTotal: 100,
  interestTotal: 82,
  peopleCount: 14,
  items: [
    {
      id: 'a',
      name: 'Chickpeas',
      unit: 'kg',
      target: 50,
      estPriceMinor: 220,
      currency: 'EUR',
      interestTotal: 40,
      mine: 2,
    },
    {
      id: 'b',
      name: 'Lentils',
      unit: 'kg',
      target: 50,
      estPriceMinor: 330,
      currency: 'EUR',
      interestTotal: 42,
      mine: 1,
    },
  ],
  collected: false,
  ...over,
});

describe('order rules', () => {
  it('estimates the viewer’s own total from their amounts', () => {
    expect(myEstimate(order().items)).toEqual({ minor: 770, currency: 'EUR' });
    expect(money(770, 'EUR', 'de').replace(/\u00a0/g, ' ')).toBe('7,70 €');
    expect(myEstimate(order().items.map((i) => ({ ...i, mine: 0 })))).toBeNull();
  });
  it('formats amounts and progress', () => {
    expect(amount(2.5, 'kg', 'en')).toBe('2.5 kg');
    expect(progress(order())).toBeCloseTo(0.82);
    expect(progress(order({ interestTotal: 150 }))).toBe(1);
  });
  it('allows changes only while collecting and before the close', () => {
    expect(canChangeInterest(order(), new Date('2030-06-01T17:00:00Z'))).toBe(true);
    expect(canChangeInterest(order(), new Date('2030-06-01T18:00:00Z'))).toBe(false);
    expect(
      canChangeInterest(order({ state: 'locked' }), new Date('2030-06-01T17:00:00Z')),
    ).toBe(false);
  });
});
