// components/ui/Icon.jsx
// Heroicon SVG components with proper color support

export const IconMap = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
    />
  </svg>
);

export const IconAccessibility = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM9 7a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1zM8 11a2 2 0 1 0-4 0 2 2 0 0 0 4 0zm12 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0z"
    />
  </svg>
);

export const IconMoon = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z"
    />
  </svg>
);

export const IconBolt = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
    />
  </svg>
);

export const IconWalk = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 5.25a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-2.25 5.25v5.25m0 0v3.75m0-3.75 3.75 3.75m-3.75-3.75-3.75 3.75M9 6.75l1.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  </svg>
);

export const IconCar = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.25 18.75a1.5 1.5 0 0 1-3 0m15 0a1.5 1.5 0 0 1-3 0M3 9.375h18M5.25 14.25h13.5M6 14.25h12m-9.75 0h7.5M4.5 9.375L5.25 18h13.5l.75-8.625M4.5 9.375L6 6.75h12l1.5 2.625"
    />
  </svg>
);

export const IconRuler = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 3.75v13.5h16.5V3.75H3.75Zm0 0L12 12m-8.25-8.25L12 12m0 0 8.25-8.25M12 12l8.25 8.25M12 12l-8.25 8.25"
    />
  </svg>
);

export const IconShare = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
  ...rest
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
    {...rest}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
    />
  </svg>
);

export const IconWarning = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "#ef4444",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
    />
  </svg>
);

export const IconInfo = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "#3b82f6",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
    />
  </svg>
);

export const IconSun = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
    />
  </svg>
);

export const IconMoonNav = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z"
    />
  </svg>
);

export const IconSwap = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
    />
  </svg>
);

export const IconSearch = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
    />
  </svg>
);

export const IconDirections = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.158-.69.158-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.158.69-.158 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
    />
  </svg>
);

export const IconLogout = ({ className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// ============================================
// NEW: Report Icon for accessibility issues
// ============================================
export const IconReport = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 3l18 18"
    />
  </svg>
);

export const IconBicycle = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.25 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-4.5 9.75 1.5-3.75 2.25 1.5 2.25-3M7.5 18a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Zm9 0a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"
    />
  </svg>
);

export const IconJog = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 5.25a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 12.75 2.25-3 3 1.5M6.75 9l2.25 1.5 1.5-3 3 1.5v6l3 1.5M9 15.75l-2.25 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  </svg>
);

export const IconFlame = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.6a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z"
    />
  </svg>
);

export const IconMountain = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.519l2.38-1.024M21 12l-3.75 6H3l3-6 3.75 6 3-6 3.75 6 3-6Z"
    />
  </svg>
);

export const IconSteps = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 3.75 6 5.25l2.25 2.25L6 9.75l2.25 2.25L6 14.25l2.25 2.25L6 18.75M16.5 3.75l1.5 1.5-2.25 2.25 2.25 2.25-2.25 2.25 2.25 2.25-2.25 2.25 2.25 2.25"
    />
  </svg>
);

export const IconRoad = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.5 21V3m15 18V3M12 21V3M3 18h18M3 9h18"
    />
  </svg>
);

export const IconChartBar = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
    />
  </svg>
);

export const IconArrowsRightLeft = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
    />
  </svg>
);

export const IconSpeakerWave = ({
  className = "w-5 h-5",
  strokeWidth = 1.5,
  color = "currentColor",
  ...rest
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={strokeWidth}
    stroke={color}
    className={className}
    {...rest}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
    />
  </svg>
);