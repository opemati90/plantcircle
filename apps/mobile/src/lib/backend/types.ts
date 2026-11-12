import { z } from 'zod';

export const PLAN_CATEGORIES = ['cooking_class', 'potluck', 'social', 'online_class'] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];

/** Public read model of a Plan (mirrors the `plan_cards` view). */
export const planCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(PLAN_CATEGORIES),
  city_id: z.string(),
  city: z.string(),
  area_name: z.string(),
  venue_name: z.string().nullable(),
  area_hint: z.string().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
  reveal_at: z.string(),
  timezone: z.string(),
  capacity: z.number().int().positive(),
  price_cents: z.number().int().nonnegative(),
  currency: z.string(),
  description: z.string(),
  allergens: z.string().nullable(),
  image_path: z.string().nullable(),
  image_alt: z.string().nullable(),
  image_focus: z.string().nullable(),
  host_name: z.string(),
  host_verified: z.boolean(),
  host_plans_count: z.number().int(),
  going_count: z.number().int(),
  attendee_initials: z.array(z.string()),
  open_bring_slots: z.number().int(),
  waitlist_count: z.number().int(),
  has_open_spot: z.boolean(),
});

export interface Plan {
  id: string;
  title: string;
  category: PlanCategory;
  cityId: string;
  city: string;
  areaName: string;
  venueName: string | null;
  areaHint: string | null;
  startsAt: string;
  endsAt: string;
  /** When confirmed guests may see the exact address. */
  revealAt: string;
  timezone: string;
  capacity: number;
  priceCents: number;
  currency: string;
  description: string;
  allergens: string | null;
  imagePath: string | null;
  imageAlt: string | null;
  imageFocus: string | null;
  hostName: string;
  hostVerified: boolean;
  hostPlansCount: number;
  goingCount: number;
  attendeeInitials: string[];
  openBringSlots: number;
  /** People in line (waiting, or holding an offer). */
  waitlistCount: number;
  /** A spot can be taken directly: one is free and nobody is in line. */
  hasOpenSpot: boolean;
}

export function toPlan(row: z.infer<typeof planCardSchema>): Plan {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    cityId: row.city_id,
    city: row.city,
    areaName: row.area_name,
    venueName: row.venue_name,
    areaHint: row.area_hint,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    revealAt: row.reveal_at,
    timezone: row.timezone,
    capacity: row.capacity,
    priceCents: row.price_cents,
    currency: row.currency,
    description: row.description,
    allergens: row.allergens,
    imagePath: row.image_path,
    imageAlt: row.image_alt,
    imageFocus: row.image_focus,
    hostName: row.host_name,
    hostVerified: row.host_verified,
    hostPlansCount: row.host_plans_count,
    goingCount: row.going_count,
    attendeeInitials: row.attendee_initials,
    openBringSlots: row.open_bring_slots,
    waitlistCount: row.waitlist_count,
    hasOpenSpot: row.has_open_spot,
  };
}

export const bringItemCardSchema = z.object({
  id: z.string(),
  plan_id: z.string(),
  label: z.string(),
  quantity: z.number().int().positive(),
  position: z.number().int(),
  claimed_count: z.number().int(),
  claimed_by: z.array(z.string()),
});

export interface BringItem {
  id: string;
  label: string;
  quantity: number;
  claimedCount: number;
  claimedBy: string[];
  claimedByMe: boolean;
}

/** A Plan plus everything that depends on who is looking at it. */
export interface PlanDetail {
  plan: Plan;
  bringItems: BringItem[];
  /** The viewer's own state for this Plan. */
  rsvp: RsvpState;
  /** 1 = next in line. Present while waitlisted or offered. */
  waitlistPosition: number | null;
  /** Present while a spot is being held for the viewer. */
  offerExpiresAt: string | null;
  /** Only present for the host, or for confirmed guests after `revealAt`. */
  address: string | null;
}

export type RsvpState = 'none' | 'going' | 'waitlisted' | 'offered';

/** What happened when the viewer tried to confirm an offered spot. */
export type OfferOutcome = 'going' | 'expired' | 'waitlisted';

/** A spot currently held for the viewer. */
export interface WaitlistOffer {
  plan: Plan;
  expiresAt: string;
}

export interface UpNext {
  plan: Plan;
  needsDish: boolean;
}

export interface Session {
  userId: string;
  email: string | null;
  /** Name supplied by the identity provider, if any. */
  providerName: string | null;
}

export interface City {
  id: string;
  name: string;
  countryCode: string;
  timezone: string;
}

export const cityRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  country_code: z.string(),
  timezone: z.string(),
});

export interface Profile {
  displayName: string;
  /** null until the member picks a city. */
  cityId: string | null;
  goals: string[];
}

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  cityId: z.string().nullable(),
  goals: z.array(z.string().max(60)).max(8),
  termsVersion: z.string().min(1).max(20),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const emailSchema = z.email().max(254);
export const emailCodeSchema = z.string().regex(/^\d{6}$/);
