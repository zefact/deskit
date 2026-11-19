import { useId } from "react";

/** アプリのマーク (design/deskit_icon.svg と同じ形を小さく描く) */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="logo">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b7bff" />
          <stop offset="0.55" stopColor="#5b7cfa" />
          <stop offset="1" stopColor="#2cc0f5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}-g)`} />
      <rect x="0.5" y="0.5" width="63" height="63" rx="14.5" fill="none" stroke="#fff" strokeOpacity="0.22" />
      <rect x="15" y="15" width="15" height="15" rx="4.2" fill="#fff" />
      <circle cx="41.5" cy="22.5" r="7.6" fill="#fff" fillOpacity="0.82" />
      <rect x="15" y="34" width="15" height="15" rx="4.2" fill="#fff" fillOpacity="0.62" />
      <path
        d="M41.5 34.2 L48.8 41.5 L41.5 48.8 L34.2 41.5 Z"
        fill="#fff"
        fillOpacity="0.9"
        stroke="#fff"
        strokeOpacity="0.9"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
