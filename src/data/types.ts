import { z } from 'zod';

export const PLAN_CATEGORIES = ['cooking_class', 'potluck', 'social', 'online_class'] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];

/** Public read model of a Plan (mirrors the `plan_cards` view). */
export const planCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(PLAN_CATEGORIES),
  city: z.string(),
  area_name: z.string(),
  venue_name: z.string().nullable(),
  area_hint: z.string().nullable(),
  starts_at: z.string(),
  ends_at: z.string(),
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
});

export interface Plan {
  id: string;
  title: string;
  category: PlanCategory;
  city: string;
  areaName: string;
  venueName: string | null;
  areaHint: string | null;
  startsAt: string;
  endsAt: string;
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
}

export function toPlan(row: z.infer<typeof planCardSchema>): Plan {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    city: row.city,
    areaName: row.area_name,
    venueName: row.venue_name,
    areaHint: row.area_hint,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
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
  isGoing: boolean;
  /** Only present for the host, or for confirmed guests inside the unlock window. */
  address: string | null;
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

export interface Profile {
  displayName: string;
  city: string;
  goals: string[];
}

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(60),
  goals: z.array(z.string().max(60)).max(8),
  termsVersion: z.string().min(1).max(20),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const emailSchema = z.email().max(254);
export const emailCodeSchema = z.string().regex(/^\d{6}$/);
