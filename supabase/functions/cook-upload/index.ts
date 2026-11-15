// A member's photo for "Cooked it", before it becomes a post. The app resizes and re-encodes it
// on the phone; this function does not trust that. It takes the photo and its thumbnail as JPEG,
// strips every metadata segment (EXIF with GPS, XMP, IPTC, comments), checks the sizes,
// decodes it to be sure it is a picture, reserves the upload (30 a day), stores both files in the
// private `cook-photos` bucket under the member's folder and marks the upload stored for
// cook_create (migration 20261112003100).
import { createClient } from 'npm:@supabase/supabase-js@2';
import jpeg from 'npm:jpeg-js@0.4.4';
import { cleanJpeg, JpegError, type CleanJpeg } from '../_shared/jpeg.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_THUMB_BYTES = 300 * 1024;
const MAX_SIDE = 2048;
const MIN_SIDE = 320;
const MAX_THUMB_SIDE = 720;

/** Decodes the picture (bounded in size and memory) to be sure it is one, and the size it claims. */
function decodes(image: CleanJpeg): boolean {
  try {
    const decoded = jpeg.decode(image.bytes, {
      useTArray: true,
      formatAsRGBA: false,
      maxResolutionInMP: 5,
      maxMemoryUsageInMB: 96,
    });
    return decoded.width === image.width && decoded.height === image.height;
  } catch {
    return false;
  }
}

function fromBase64(value: unknown, limit: number): Uint8Array | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > Math.ceil(limit / 3) * 4 + 4
  ) {
    return null;
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? await supabase.auth.getUser(token) : null;
  const uid = user?.data.user?.id;
  if (!uid) return json({ error: 'not_authenticated' }, 401);

  let body: { photo?: unknown; thumb?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_input' }, 400);
  }
  const photoBytes = fromBase64(body.photo, MAX_BYTES);
  const thumbBytes = fromBase64(body.thumb, MAX_THUMB_BYTES);
  if (!photoBytes || !thumbBytes) return json({ error: 'invalid_input' }, 400);

  let photo;
  let thumb;
  try {
    photo = cleanJpeg(photoBytes);
    thumb = cleanJpeg(thumbBytes);
  } catch (error) {
    if (error instanceof JpegError) return json({ error: 'invalid_input' }, 400);
    throw error;
  }
  const long = Math.max(photo.width, photo.height);
  const short = Math.min(photo.width, photo.height);
  const thumbLong = Math.max(thumb.width, thumb.height);
  const sameShape =
    Math.abs(photo.width / photo.height - thumb.width / thumb.height) <
    0.02 * (photo.width / photo.height);
  if (
    photo.bytes.length > MAX_BYTES ||
    thumb.bytes.length > MAX_THUMB_BYTES ||
    long > MAX_SIDE ||
    short < MIN_SIDE ||
    thumbLong > MAX_THUMB_SIDE ||
    !sameShape ||
    !decodes(photo) ||
    !decodes(thumb)
  ) {
    return json({ error: 'invalid_input' }, 400);
  }

  // The path is reserved in the database before anything is stored, so a file can never exist
  // that nothing points at: a reservation never finished is cleaned up after a day.
  const id = crypto.randomUUID();
  const path = `${uid}/${id}.jpg`;
  const thumbPath = `${uid}/${id}.thumb.jpg`;
  const reserved = await supabase.rpc('cook_upload_reserve', {
    p_user_id: uid,
    p_path: path,
    p_width: photo.width,
    p_height: photo.height,
  });
  if (reserved.error) {
    const word = reserved.error.message;
    if (word === 'rate_limited') return json({ error: 'rate_limited' }, 429);
    if (word === 'suspended') return json({ error: 'suspended' }, 403);
    return json({ error: 'server' }, 500);
  }

  const bucket = supabase.storage.from('cook-photos');
  const options = { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' };
  const stored = await bucket.upload(path, photo.bytes, options);
  const storedThumb = stored.error
    ? null
    : await bucket.upload(thumbPath, thumb.bytes, options);
  const marked =
    stored.error || !storedThumb || storedThumb.error
      ? null
      : await supabase.rpc('cook_upload_stored', { p_path: path });
  if (!marked || marked.error) {
    await bucket.remove([path, thumbPath]);
    return json({ error: 'server' }, 500);
  }
  return json({ path, width: photo.width, height: photo.height });
});
