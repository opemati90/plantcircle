import { z } from 'zod';

// Mirrors the database's plan_kind enum, so any stored Plan parses.
export const PLAN_CATEGORIES = [
  'cooking_night',
  'potluck',
  'workshop',
  'meetup',
  'online_class',
  'group_order',
  'food_swap',
  'volunteering',
  'global_table',
] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];

/** Public read model of a Plan (mirrors the `plan_cards` view). */
export const PLAN_FORMATS = ['in_person', 'online'] as const;
export type PlanFormat = (typeof PLAN_FORMATS)[number];

export const planCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(PLAN_CATEGORIES),
  format: z.enum(PLAN_FORMATS),
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
  /** Where it happens: in person at an address, or online with a meeting link. */
  format: PlanFormat;
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
    format: row.format,
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

/** What the host enters for a thing guests can bring. */
export interface BringItemInput {
  label: string;
  quantity: number;
}

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
  /** Google Meet link; same visibility as `address`. Never on public cards. */
  meetingUrl: string | null;
}

export type RsvpState = 'none' | 'going' | 'waitlisted' | 'offered';

/** What happened when the viewer tried to confirm an offered spot. */
export type OfferOutcome = 'going' | 'expired' | 'waitlisted';

/** A spot currently held for the viewer. */
export interface WaitlistOffer {
  plan: Plan;
  expiresAt: string;
}

/** One of the viewer's own Plans, with where they stand on it. */
export interface MyPlan {
  plan: Plan;
  rsvp: Exclude<RsvpState, 'none'>;
  /** 1 = next in line. Present while waitlisted or offered. */
  waitlistPosition: number | null;
  offerExpiresAt: string | null;
}

/** `upcoming`: Plans not yet over where the viewer is going, waiting or offered a spot. */
export type MyPlansScope = 'upcoming' | 'past';

export const CIRCLE_ACCESS = ['open', 'request'] as const;
export type CircleAccess = (typeof CIRCLE_ACCESS)[number];
export type CircleRole = 'member' | 'moderator' | 'owner';

export const circleCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string().nullable(),
  city_id: z.string().nullable(),
  city: z.string().nullable(),
  is_global: z.boolean(),
  access: z.enum(['open', 'request', 'invite']),
  join_question: z.string().nullable(),
  member_count: z.number().int(),
  viewer_role: z.enum(['member', 'moderator', 'owner']).nullable(),
  viewer_request: z.string().nullable(),
});

/** A Circle as listed publicly, with the viewer's own standing in it. */
export interface Circle {
  id: string;
  name: string;
  tagline: string | null;
  cityId: string | null;
  city: string | null;
  isGlobal: boolean;
  access: 'open' | 'request' | 'invite';
  joinQuestion: string | null;
  memberCount: number;
  viewerRole: CircleRole | null;
  /** The viewer has asked to join and is waiting for a decision. */
  viewerRequestPending: boolean;
}

export const toCircle = (row: z.infer<typeof circleCardSchema>): Circle => ({
  id: row.id,
  name: row.name,
  tagline: row.tagline,
  cityId: row.city_id,
  city: row.city,
  isGlobal: row.is_global,
  access: row.access,
  joinQuestion: row.join_question,
  memberCount: row.member_count,
  viewerRole: row.viewer_role,
  viewerRequestPending: row.viewer_request === 'pending',
});

export const circleRequestSchema = z.object({
  request_id: z.string(),
  display_name: z.string().nullable(),
  answer: z.string().nullable(),
  created_at: z.string(),
});

/** Someone waiting for a decision on a request Circle. Only moderators and the owner see these. */
export interface CircleRequest {
  id: string;
  displayName: string | null;
  answer: string | null;
  createdAt: string;
}

export const toCircleRequest = (row: z.infer<typeof circleRequestSchema>): CircleRequest => ({
  id: row.request_id,
  displayName: row.display_name,
  answer: row.answer,
  createdAt: row.created_at,
});

export interface CircleInput {
  name: string;
  tagline: string | null;
  cityId: string;
  access: CircleAccess;
  joinQuestion: string | null;
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
  tz: z.string(),
});

export interface Profile {
  displayName: string;
  /** null until the member picks a city. */
  cityId: string | null;
  goals: string[];
  /** Off by default. On means members of the Circles you share can see you in People. */
  peopleVisible: boolean;
}

export const PERSON_CONNECTIONS = ['none', 'requested', 'requested_by_them', 'connected'] as const;
export type PersonConnection = (typeof PERSON_CONNECTIONS)[number];

export const personRowSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  city: z.string().nullable(),
  circle_names: z.array(z.string()),
  connection: z.enum(PERSON_CONNECTIONS),
});

/** A member who chose to be visible and shares a Circle with you. */
export interface Person {
  userId: string;
  displayName: string;
  city: string | null;
  /** The Circles you both belong to, by name. */
  circleNames: string[];
  connection: PersonConnection;
}

export const toPerson = (row: z.infer<typeof personRowSchema>): Person => ({
  userId: row.user_id,
  displayName: row.display_name,
  city: row.city,
  circleNames: row.circle_names,
  connection: row.connection,
});

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  cityId: z.string().nullable(),
  goals: z.array(z.string().max(60)).max(8),
  termsVersion: z.string().min(1).max(20),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const emailSchema = z.email().max(254);
export const emailCodeSchema = z.string().regex(/^\d{6}$/);

/** The allergens a poster can declare. 'none' means the poster checked and there are none. */
export const RECIPE_ALLERGENS = [
  'none',
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type RecipeAllergen = (typeof RECIPE_ALLERGENS)[number];

export const isRecipeAllergen = (value: string): value is RecipeAllergen =>
  (RECIPE_ALLERGENS as readonly string[]).includes(value);

export const recipeCardSchema = z.object({
  id: z.string(),
  circle_id: z.string(),
  circle_name: z.string(),
  author_name: z.string().nullable(),
  title: z.string(),
  cuisine: z.string().nullable(),
  serves: z.number().int(),
  minutes: z.number().int().nullable(),
  intro: z.string().nullable(),
  allergens: z.array(z.enum(RECIPE_ALLERGENS)),
  allergens_confirmed: z.boolean(),
  created_at: z.string(),
});

export const recipeIngredientSchema = z.object({
  name: z.string(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
});

/** A recipe as shared into a Circle, without its method. */
export interface Recipe {
  id: string;
  title: string;
  cuisine: string | null;
  serves: number;
  minutes: number | null;
  intro: string | null;
  allergens: RecipeAllergen[];
  /** False means the poster did not confirm allergens: show that, never assume none. */
  allergensConfirmed: boolean;
  circleId: string;
  circleName: string;
  authorName: string | null;
  createdAt: string;
}

export interface RecipeIngredient {
  name: string;
  qty: number | null;
  unit: string | null;
}

export interface RecipeDetail extends Recipe {
  ingredients: RecipeIngredient[];
  steps: string[];
}

export interface RecipeInput {
  circleId: string;
  title: string;
  cuisine: string | null;
  serves: number;
  minutes: number | null;
  intro: string | null;
  allergens: RecipeAllergen[];
  allergensConfirmed: boolean;
  ingredients: RecipeIngredient[];
  steps: string[];
}

export const GUEST_STATES = ['going', 'checked_in', 'no_show', 'waitlisted', 'offered'] as const;
export type GuestState = (typeof GUEST_STATES)[number];

export const guestRowSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  state: z.enum(GUEST_STATES),
  checked_in_at: z.string().nullable(),
});

/** Someone on a Plan's list, as the host sees it: a name and a state, never contact details. */
export interface Guest {
  userId: string;
  displayName: string;
  state: GuestState;
  checkedInAt: string | null;
}

export const toGuest = (row: z.infer<typeof guestRowSchema>): Guest => ({
  userId: row.user_id,
  displayName: row.display_name,
  state: row.state,
  checkedInAt: row.checked_in_at,
});

export interface HostSummary {
  going: number;
  checkedIn: number;
  noShow: number;
  /** The host has ended the Plan. */
  ended: boolean;
  /** Published or changed: a Plan that is running, as opposed to on hold or cancelled. */
  live: boolean;
  feedbackCount: number;
  /** Null until someone has rated. */
  averageRating: number | null;
}

export interface FeedbackState {
  /** A checked-in guest, once the Plan has ended. */
  eligible: boolean;
  rating: number | null;
  comment: string | null;
}

/** What a host enters to publish a Plan. The database checks every rule again. */
export interface PlanInput {
  category: 'cooking_night' | 'potluck';
  format: PlanFormat;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  /** The allergen keys the host chose, never empty. */
  allergens: RecipeAllergen[];
  /** In person: the public area. */
  areaName: string | null;
  /** In person: the exact address, revealed to confirmed guests. */
  address: string | null;
  keepAddressPrivate: boolean;
  /** Online: the Google Meet link, https only. */
  meetingUrl: string | null;
}

export const messageCardSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  sender_id: z.string(),
  sender_name: z.string(),
  body: z.string(),
  created_at: z.string(),
});

/** One message in a group chat, with who sent it. */
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export const toChatMessage = (row: z.infer<typeof messageCardSchema>): ChatMessage => ({
  id: row.id,
  senderId: row.sender_id,
  senderName: row.sender_name,
  body: row.body,
  createdAt: row.created_at,
});

export const messageRequestCardSchema = z.object({
  id: z.string(),
  from_id: z.string(),
  from_name: z.string(),
  first_message: z.string(),
  created_at: z.string(),
});

/** A first-message request from someone who shares a Circle with you. */
export interface DirectRequest {
  id: string;
  fromId: string;
  fromName: string;
  firstMessage: string;
  createdAt: string;
}

export const toDirectRequest = (row: z.infer<typeof messageRequestCardSchema>): DirectRequest => ({
  id: row.id,
  fromId: row.from_id,
  fromName: row.from_name,
  firstMessage: row.first_message,
  createdAt: row.created_at,
});

/** Your own view of one conversation: muted until a time, and pinned. */
export interface ConversationSettings {
  mutedUntil: string | null;
  pinned: boolean;
}

export const INBOX_KINDS = ['plan', 'circle', 'direct'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export const inboxRowSchema = z.object({
  conversation_id: z.string().nullable(),
  kind: z.enum(INBOX_KINDS),
  ref_id: z.string(),
  title: z.string(),
  last_body: z.string().nullable(),
  last_sender_name: z.string().nullable(),
  last_at: z.string().nullable(),
  unread: z.number().int(),
  pinned: z.boolean(),
  muted: z.boolean(),
  image_path: z.string().nullable(),
});

/** One line in the inbox: a chat the viewer can use, with its last message and unread count. */
export interface InboxThread {
  /** Null until someone opens the chat; the row still shows so the place is reachable. */
  conversationId: string | null;
  kind: InboxKind;
  /** The Plan, Circle or other person the chat belongs to. */
  refId: string;
  title: string;
  lastBody: string | null;
  lastSenderName: string | null;
  lastAt: string | null;
  unread: number;
  pinned: boolean;
  muted: boolean;
  /** A Plan's photo path, for the row's thumbnail. */
  imagePath: string | null;
}

export const toInboxThread = (row: z.infer<typeof inboxRowSchema>): InboxThread => ({
  conversationId: row.conversation_id,
  kind: row.kind,
  refId: row.ref_id,
  title: row.title,
  lastBody: row.last_body,
  lastSenderName: row.last_sender_name,
  lastAt: row.last_at,
  unread: row.unread,
  pinned: row.pinned,
  muted: row.muted,
  imagePath: row.image_path,
});

export const toRecipe = (row: z.infer<typeof recipeCardSchema>): Recipe => ({
  id: row.id,
  title: row.title,
  cuisine: row.cuisine,
  serves: row.serves,
  minutes: row.minutes,
  intro: row.intro,
  allergens: row.allergens,
  allergensConfirmed: row.allergens_confirmed,
  circleId: row.circle_id,
  circleName: row.circle_name,
  authorName: row.author_name,
  createdAt: row.created_at,
});
