import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** Accessible name. Icons without one are decorative and hidden. */
  label?: string;
}

function Stroke({
  size = 18,
  strokeWidth = 2,
  color = 'currentColor',
  label,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {children}
    </svg>
  );
}

const stroke = (paths: ReactNode) =>
  function Icon(props: IconProps) {
    return <Stroke {...props}>{paths}</Stroke>;
  };

export const SproutIcon = stroke(
  <>
    <path d="M7 20h10" />
    <path d="M10 20c5.5-2.5.8-6.4 3-10" />
    <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
    <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
  </>,
);
export const ChevronRightIcon = stroke(<path d="m9 18 6-6-6-6" />);
export const ChevronLeftIcon = stroke(<path d="m15 18-6-6 6-6" />);
export const PinIcon = stroke(
  <>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </>,
);
export const BellIcon = stroke(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>,
);
export const PlusIcon = stroke(<path d="M12 5v14M5 12h14" />);
export const HomeIcon = stroke(
  <path d="M3 10.2 12 3l9 7.2V20a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" />,
);
export const CompassIcon = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5z" />
  </>,
);
export const CalendarIcon = stroke(
  <>
    <rect x="3" y="4" width="18" height="17" rx="3" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>,
);
export const ChatIcon = stroke(
  <path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" />,
);
export const UserIcon = stroke(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </>,
);
export const ShareIcon = stroke(
  <path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />,
);
export const CheckIcon = stroke(<path d="m5 12 5 5 9-10" />);
export const CloseIcon = stroke(<path d="M18 6 6 18M6 6l12 12" />);
export const MailIcon = stroke(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>,
);
export const AlertIcon = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h0" />
  </>,
);
export const OfflineIcon = stroke(
  <path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 3.5-2M15.5 10.5a10 10 0 0 1 3.5 2M8.5 16a5 5 0 0 1 7 0M12 20h0M3 3l18 18" />,
);

export function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.8 1.2 1.8 2.6 3.1 2.5 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.4-.9-2.4-3.9zM14 5.3c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 2.9 1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.6a4.8 4.8 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.6z"
      />
      <path
        fill="#34A853"
        d="M12 22.5c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10.5 10.5 0 0 0 12 22.5z"
      />
      <path fill="#FBBC05" d="M6.2 14.1a6.3 6.3 0 0 1 0-4.2V7.2H2.7a10.5 10.5 0 0 0 0 9.6z" />
      <path
        fill="#EA4335"
        d="M12 5.7c1.5 0 2.9.5 4 1.6l3-3A10.5 10.5 0 0 0 2.7 7.2l3.5 2.7C7 7.5 9.3 5.7 12 5.7z"
      />
    </svg>
  );
}

export function VerifiedIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="var(--color-accent)"
      role="img"
      aria-label="Verified host"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.9-3.1 3.2.3z" />
      <path
        d="m8.5 12 2.3 2.3 4.7-4.7"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Stylised neighbourhood map tile: deliberately not a real map or location. */
export function MapTile() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        flexShrink: 0,
        width: 56,
        height: 56,
        overflow: 'hidden',
        borderRadius: 16,
        background: 'var(--color-map)',
      }}
    >
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        style={{ position: 'absolute', inset: 0 }}
      >
        <path d="M-4 38 L60 18" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M18 -4 L30 60" stroke="#FFFFFF" strokeWidth="4" />
        <path d="M-4 12 L24 22" stroke="#FFFFFF" strokeWidth="3" />
        <circle cx="40" cy="42" r="7" fill="var(--color-map-park)" />
      </svg>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        style={{ position: 'absolute', left: 17, top: 13 }}
        fill="var(--color-ink)"
      >
        <path d="M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z" />
        <circle cx="12" cy="10" r="2.6" fill="#FFFFFF" />
      </svg>
    </span>
  );
}
