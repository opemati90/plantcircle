import type {
  AppNotification,
  AuditRow,
  BlockedPerson,
  BringItemInput,
  ChatMessage,
  Circle,
  CircleInput,
  CircleRequest,
  City,
  ConversationSettings,
  DirectRequest,
  FeedbackState,
  GroupOrder,
  Guest,
  HostLevel,
  HostSummary,
  InboxThread,
  MyPlan,
  MyPlansScope,
  OfferOutcome,
  OrderDecision,
  OrderInput,
  OrderState,
  PendingPolicy,
  Person,
  Plan,
  PlanDetail,
  PlanInput,
  PolicyName,
  Profile,
  ProfileInput,
  ProfileStats,
  Recipe,
  RecipeDetail,
  RecipeInput,
  ReportInput,
  ReportReceipt,
  Session,
  SettingsPatch,
  StaffAction,
  StaffAppeal,
  StaffCase,
  StaffQueueRow,
  Suspension,
  UpNext,
  UserSettings,
  WaitlistOffer,
  WebRsvpInput,
  WebRsvpResult,
} from './types';

export type BackendErrorCode =
  | 'network'
  | 'not_authenticated'
  | 'not_found'
  | 'plan_full'
  | 'plan_ended'
  | 'item_taken'
  | 'rsvp_required'
  | 'no_offer'
  | 'invalid_code'
  | 'rate_limited'
  | 'forbidden'
  | 'invalid_input'
  | 'city_required'
  | 'host_level_required'
  | 'host_level_in_person'
  | 'host_level_capacity'
  | 'own_recipe'
  | 'checkin_closed'
  | 'plan_not_started'
  | 'item_claimed'
  | 'closed_chat'
  | 'person_not_found'
  | 'interest_closed'
  | 'order_not_open'
  | 'blocked'
  | 'suspended'
  | 'messages_frozen'
  | 'account_deleted'
  | 'age_required'
  | 'cancelled'
  | 'invalid_response'
  | 'unknown';

export class BackendError extends Error {
  readonly code: BackendErrorCode;

  constructor(code: BackendErrorCode, message?: string, options?: ErrorOptions) {
    super(message ?? code, options);
    this.name = 'BackendError';
    this.code = code;
  }
}

export function errorCode(error: unknown): BackendErrorCode {
  return error instanceof BackendError ? error.code : 'unknown';
}

export type OAuthProvider = 'apple' | 'google';

/**
 * Everything the UI needs from a backend. The Supabase adapter is the real one;
 * the fixtures adapter exists only for local development and tests.
 */
export interface Backend {
  readonly kind: 'supabase' | 'fixtures';

  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  /** Resolves once signed in; rejects with `cancelled` if the person backs out. */
  signInWithOAuth(provider: OAuthProvider): Promise<void>;
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;

  getProfile(): Promise<Profile | null>;
  createProfile(input: ProfileInput): Promise<Profile>;
  /** The member's home city. Only changes the profile; browsing other cities does not call this. */
  /** `null` is "Anywhere": no home city, so Home shows Plans from every city. */
  setCity(cityId: string | null): Promise<void>;
  /** Name and interests, from Edit profile. The city has its own call. */
  updateProfile(input: { displayName: string; goals: string[] }): Promise<Profile>;
  /** Whole counts for the identity card. */
  getProfileStats(): Promise<ProfileStats>;
  /** The viewer's hosting level: what earned it, what it allows, what is next. */
  getHostLevel(): Promise<HostLevel>;
  /** Follow or unfollow a member (from a recipe). Returns the author's follower count. */
  setFollow(userId: string, on: boolean): Promise<{ following: boolean; followers: number }>;
  /** Upvote a recipe or take it back. Never the viewer's own. */
  setRecipeVote(recipeId: string, on: boolean): Promise<{ voted: boolean; votes: number }>;

  /** Circles anyone can see (open and request), with optional text search. */
  listCircles(query: { search: string }): Promise<Circle[]>;
  /** Every Circle the viewer is a member of, for pickers. Not limited by the discovery search. */
  listMyCircles(): Promise<Circle[]>;
  getCircle(circleId: string): Promise<Circle>;
  /** Open Circles admit at once; request Circles record a request with the answer. */
  joinCircle(
    circleId: string,
    answer: string | null,
    idempotencyKey: string,
  ): Promise<'member' | 'requested'>;
  createCircle(input: CircleInput, idempotencyKey: string): Promise<string>;
  /** Waiting requests for a request Circle. Only its owner and moderators can read them. */
  getCircleRequests(circleId: string): Promise<CircleRequest[]>;
  respondToCircleRequest(
    requestId: string,
    approve: boolean,
    idempotencyKey: string,
  ): Promise<void>;

  /** Visible members who share a Circle with the viewer. */
  listPeople(): Promise<Person[]>;
  /** Asks to connect. The result is "connected" when the other person had already asked. */
  connectWithPerson(userId: string, idempotencyKey: string): Promise<'requested' | 'connected'>;
  /** The member's own choice to be seen in People. Off by default. */
  setPeopleVisible(visible: boolean): Promise<void>;

  /** Recipes shared into Circles the viewer is in, newest first, searched on the server. */
  listRecipes(query: { search: string }): Promise<Recipe[]>;
  getRecipe(recipeId: string): Promise<RecipeDetail>;
  createRecipe(input: RecipeInput, idempotencyKey: string): Promise<string>;

  /** Publishes a Plan in the host's home city. Returns the new Plan's id. */
  createPlan(input: PlanInput, idempotencyKey: string): Promise<string>;

  /** Group chats for a Plan or a Circle, for members only. */
  openConversation(kind: 'plan' | 'circle' | 'direct', refId: string): Promise<string>;
  listMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(conversationId: string, body: string, clientId: string): Promise<void>;
  /** A first message to someone who shares a Circle with you. The answer may be a conversation. */
  requestDirect(
    userId: string,
    firstMessage: string,
    clientId: string,
  ): Promise<{ status: 'pending' | 'accepted' | 'declined'; conversationId?: string }>;
  listDirectRequests(): Promise<DirectRequest[]>;
  respondDirectRequest(requestId: string, accept: boolean): Promise<'accepted' | 'declined'>;
  getConversationSettings(conversationId: string): Promise<ConversationSettings>;
  /** Mute until a time, or unmute with null. */
  setMutedUntil(conversationId: string, until: string | null): Promise<void>;
  setPinned(conversationId: string, pinned: boolean): Promise<void>;
  /** Every chat the viewer can use, pinned first, then newest activity. */
  listInbox(): Promise<InboxThread[]>;

  /** Group orders. Interest is non-binding; the organizer decides below target. */
  getOrder(planId: string): Promise<GroupOrder>;
  createOrder(input: OrderInput, idempotencyKey: string): Promise<string>;
  setOrderInterest(itemId: string, quantity: number, idempotencyKey: string): Promise<void>;
  decideOrder(
    planId: string,
    decision: OrderDecision,
    idempotencyKey: string,
  ): Promise<OrderState>;
  markOrderCollected(planId: string, idempotencyKey: string): Promise<void>;
  /** Marks read up to the newest message shown; the marker never moves back or past that. */
  markConversationRead(conversationId: string, upTo: string): Promise<void>;

  /** Hosting. Only the host of the Plan can call these; the database refuses anyone else. */
  listGuests(planId: string): Promise<Guest[]>;
  getHostSummary(planId: string): Promise<HostSummary>;
  checkInGuest(
    planId: string,
    userId: string,
    checkedIn: boolean,
    idempotencyKey: string,
  ): Promise<'going' | 'checked_in'>;
  endPlan(planId: string, idempotencyKey: string): Promise<void>;

  /** Web RSVP from a shared link: no account needed up front. */
  webRsvp(planId: string, input: WebRsvpInput, idempotencyKey: string): Promise<WebRsvpResult>;
  webRsvpCancel(cancelToken: string, idempotencyKey: string): Promise<void>;

  /** Notifications: the Inbox's Updates rows and this device's push token. */
  listNotifications(): Promise<AppNotification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  registerPushToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<void>;
  removePushToken(token: string): Promise<void>;

  /** Policies. New versions the member has not accepted; a blocking one gates the app. */
  getPendingPolicies(): Promise<PendingPolicy[]>;
  /** Accepts exactly the versions shown. Returns how many were recorded. */
  acceptPolicies(versions: { policy: PolicyName; version: string }[]): Promise<number>;

  /** Account. Settings exist with their defaults from the first read; consent is off by default. */
  getSettings(): Promise<UserSettings>;
  updateSettings(patch: SettingsPatch): Promise<UserSettings>;
  /** A copy of your data, emailed within 48 hours. Returns when it was asked for. */
  requestDataExport(idempotencyKey: string): Promise<string>;
  /** Delete for good: anonymises now and releases what others wait for. The caller signs out after. */
  deleteAccount(idempotencyKey: string): Promise<void>;

  /** Safety. Blocking is silent and mutual in effect; reports get a case reference. */
  blockUser(userId: string, idempotencyKey: string): Promise<void>;
  unblockUser(userId: string): Promise<void>;
  listBlocked(): Promise<BlockedPerson[]>;
  createReport(input: ReportInput, idempotencyKey: string): Promise<ReportReceipt>;
  /** The statement of reasons while the account is paused; null otherwise. */
  getSuspension(): Promise<Suspension | null>;
  createAppeal(actionId: string, statement: string, idempotencyKey: string): Promise<void>;
  /** Staff console (web). The database refuses anyone without the staff role. */
  staffQueue(): Promise<StaffQueueRow[]>;
  staffCase(reportId: string): Promise<StaffCase>;
  staffViewMessages(reportId: string, reason: string): Promise<ChatMessage[]>;
  staffDecide(
    input: {
      reportId: string;
      action: StaffAction;
      reason: string;
      rule: string | null;
      until: string | null;
    },
    idempotencyKey: string,
  ): Promise<void>;
  staffAppeals(): Promise<StaffAppeal[]>;
  staffAppealDecide(
    appealId: string,
    uphold: boolean,
    reason: string,
    idempotencyKey: string,
  ): Promise<void>;
  staffAudit(limit: number): Promise<AuditRow[]>;

  /** Feedback from a guest who checked in, once the Plan has ended. */
  getFeedback(planId: string): Promise<FeedbackState>;
  submitFeedback(
    planId: string,
    rating: number,
    comment: string | null,
    idempotencyKey: string,
  ): Promise<void>;

  listCities(): Promise<City[]>;
  /**
   * The city a person typed: the known row if one has that name in that country (case
   * ignored), otherwise a new one with the device's country and time zone. Works before sign-up.
   */
  ensureCity(input: { name: string; countryCode: string; timezone: string }): Promise<City>;
  /** `cityId: null` lists Plans everywhere (the member has not picked a city). */
  /** `cityIds: null` lists Plans everywhere; a list limits them to those cities. */
  listUpcomingPlans(query: {
    cityIds: string[] | null;
    from: Date;
    to: Date;
    format?: 'online';
    /** Explore: featured hosts first, then by start (ordered on the server, before the limit). */
    order?: 'featured';
  }): Promise<Plan[]>;
  getPlan(planId: string): Promise<PlanDetail>;
  getUpNext(now: Date): Promise<UpNext | null>;
  /** The viewer's own Plans, soonest first (upcoming) or latest first (past). */
  listMyPlans(query: { scope: MyPlansScope; now: Date }): Promise<MyPlan[]>;
  // State-changing calls take an idempotency key: one key per user action, reused on retry.
  joinPlan(planId: string, idempotencyKey: string): Promise<void>;
  /** Gives up a spot, a place in line, or an offered spot ("pass it on"). */
  cancelRsvp(planId: string, idempotencyKey: string): Promise<void>;
  joinWaitlist(planId: string, idempotencyKey: string): Promise<void>;
  confirmWaitlistOffer(planId: string, idempotencyKey: string): Promise<OfferOutcome>;
  /** Spots currently held for the viewer, soonest expiry first. */
  getWaitlistOffers(): Promise<WaitlistOffer[]>;
  claimBringItem(itemId: string, idempotencyKey: string): Promise<void>;
  /** A guest withdraws their own claim, until the Plan ends. */
  unclaimBringItem(itemId: string, idempotencyKey: string): Promise<void>;

  /** Host-side bring items: only the host, only while the Plan is live. */
  addBringItem(planId: string, item: BringItemInput, idempotencyKey: string): Promise<string>;
  updateBringItem(itemId: string, item: BringItemInput, idempotencyKey: string): Promise<void>;
  removeBringItem(itemId: string, idempotencyKey: string): Promise<void>;
}
