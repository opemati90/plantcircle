import { Image } from 'expo-image';

/**
 * Drops every photo the phone holds, after a block, leaving a Circle or a change of account, so a
 * post photo the member may no longer see is not shown from the cache.
 */
export async function forgetCookPhotos(): Promise<void> {
  await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()]);
}
