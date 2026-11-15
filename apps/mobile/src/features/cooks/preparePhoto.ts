import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { PreparedPhoto } from '../../lib/backend/types';

/** Posts are 4:5 portraits: the photo 1600 px tall, the thumbnail 600. */
export const COOK_ASPECT = 4 / 5;
const PHOTO_HEIGHT = 1600;
const THUMB_HEIGHT = 600;

export type PickSource = 'camera' | 'library';
export type PickResult =
  { status: 'picked'; photo: PreparedPhoto } | { status: 'cancelled' } | { status: 'denied' };

/** The centred 4:5 crop of a picture of any shape. */
export function centreCrop(width: number, height: number) {
  if (width / height > COOK_ASPECT) {
    const cropWidth = Math.round(height * COOK_ASPECT);
    return {
      originX: Math.round((width - cropWidth) / 2),
      originY: 0,
      width: cropWidth,
      height,
    };
  }
  const cropHeight = Math.round(width / COOK_ASPECT);
  return {
    originX: 0,
    originY: Math.round((height - cropHeight) / 2),
    width,
    height: cropHeight,
  };
}

/**
 * Takes or chooses a photo, crops it to 4:5, and re-encodes it as JPEG at two sizes. Re-encoding
 * applies the rotation and leaves the metadata (location, device) behind; the server strips it
 * again regardless.
 */
export async function pickCookPhoto(source: PickSource): Promise<PickResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return { status: 'cancelled' };
  return { status: 'picked', photo: await preparePhoto(asset.uri, asset.width, asset.height) };
}

export async function preparePhoto(
  uri: string,
  width: number,
  height: number,
): Promise<PreparedPhoto> {
  const crop = centreCrop(width, height);
  const render = async (targetHeight: number, compress: number) => {
    const context = ImageManipulator.manipulate(uri).crop(crop);
    if (crop.height > targetHeight) context.resize({ height: targetHeight });
    const image = await context.renderAsync();
    return image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  };
  const photo = await render(PHOTO_HEIGHT, 0.82);
  const thumb = await render(THUMB_HEIGHT, 0.75);
  if (!photo.base64 || !thumb.base64) throw new Error('photo_encoding_failed');
  return {
    base64: photo.base64,
    thumbBase64: thumb.base64,
    width: photo.width,
    height: photo.height,
    previewUri: photo.uri,
  };
}
