/**
 * The public web address links point to (shared Plans, Circle invites). Set
 * EXPO_PUBLIC_WEB_URL once the web app has its host; the default is the planned domain.
 */
const raw: unknown = process.env.EXPO_PUBLIC_WEB_URL;
export const WEB_ORIGIN = (
  typeof raw === 'string' && raw.trim() ? raw.trim() : 'https://plantcircle.app'
).replace(/\/$/, '');

export const planLink = (planId: string) => `${WEB_ORIGIN}/p/${planId}`;
export const circleInviteLink = (circleId: string) => `${WEB_ORIGIN}/c/${circleId}`;
