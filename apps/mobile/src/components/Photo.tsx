import { Image, type ImageProps } from 'expo-image';
import { StyleSheet, View } from 'react-native';

interface PhotoProps {
  source: NonNullable<ImageProps['source']> | null;
  contentPosition?: NonNullable<ImageProps['contentPosition']>;
  /** Describes the photo. Omit for decorative photos, which are hidden from assistive tech. */
  alt?: string | null;
}

/** Fills its parent with a cropped photo. */
export function Photo({ source, contentPosition, alt }: PhotoProps) {
  const image = (
    <Image
      source={source}
      contentFit="cover"
      {...(contentPosition ? { contentPosition } : {})}
      style={StyleSheet.absoluteFill}
      {...(alt ? { accessible: true, accessibilityLabel: alt, alt } : { accessible: false })}
    />
  );
  if (alt) return image;
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {image}
    </View>
  );
}
