import type { SVGProps } from "react";

/**
 * Every icon in the app lives here, as inline SVG using currentColor —
 * never emoji. Emoji render as platform-colored pictographs that ignore
 * text color and vary across devices/fonts; these always match their
 * surrounding text and theme.
 */
type IconProps = SVGProps<SVGSVGElement>;

const LINE_PROPS = {
  viewBox: "0 0 24 24",
  width: "1em",
  height: "1em",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const SOLID_PROPS = {
  viewBox: "0 0 24 24",
  width: "1em",
  height: "1em",
  fill: "currentColor",
  stroke: "none",
  "aria-hidden": true,
};

export function IconLock(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeHalf(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M15 14h3" />
    </svg>
  );
}

export function IconHandshake(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M2 12h4l3-3 3 3 3-3 3 3h4" />
      <path d="M7 12l2.5 2.5a1.6 1.6 0 0 0 2.3 0l.2-.2a1.6 1.6 0 0 0 0-2.3" />
      <path d="M17 12l-2.5 2.5" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.2c2.6.4 4.5 2.6 4.5 5.3" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.8 1.8 0 0 0 .36 1.98l.06.06a2.2 2.2 0 1 1-3.1 3.1l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V20.2a2.2 2.2 0 1 1-4.4 0v-.1a1.8 1.8 0 0 0-1.18-1.65 1.8 1.8 0 0 0-1.98.36l-.06.06a2.2 2.2 0 1 1-3.1-3.1l.06-.06a1.8 1.8 0 0 0 .36-1.98 1.8 1.8 0 0 0-1.65-1.09H2.8a2.2 2.2 0 1 1 0-4.4h.1a1.8 1.8 0 0 0 1.65-1.18 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2.2 2.2 0 1 1 3.1-3.1l.06.06a1.8 1.8 0 0 0 1.98.36h.09A1.8 1.8 0 0 0 10.4 2.8V2.7a2.2 2.2 0 1 1 4.4 0v.1a1.8 1.8 0 0 0 1.09 1.65h.09a1.8 1.8 0 0 0 1.98-.36l.06-.06a2.2 2.2 0 1 1 3.1 3.1l-.06.06a1.8 1.8 0 0 0-.36 1.98v.09c.28.76.9 1.32 1.65 1.4h.1a2.2 2.2 0 1 1 0 4.4h-.1a1.8 1.8 0 0 0-1.65 1.09Z" />
    </svg>
  );
}

export function IconFileText(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 12h5M9.5 15.5h5M9.5 8.5h2" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function IconArrowDown(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

export function IconCircleFilled(props: IconProps) {
  return (
    <svg {...SOLID_PROPS} {...props}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export function IconSquareFilled(props: IconProps) {
  return (
    <svg {...SOLID_PROPS} {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

export function IconDiamondFilled(props: IconProps) {
  return (
    <svg {...SOLID_PROPS} {...props}>
      <path d="M12 4l8 8-8 8-8-8Z" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.75" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <path d="M12 4 21.5 20.5H2.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconAlertCircle(props: IconProps) {
  return (
    <svg {...LINE_PROPS} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v6" />
      <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
