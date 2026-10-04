export default function AuthRouteMotion() {
  const routePath = "M 64 218 C 126 214, 115 163, 190 164 S 257 171, 282 130 S 337 78, 395 105 S 468 135, 510 91 S 557 76, 590 72";

  return (
    <div className="auth-route-motion" aria-hidden="true">
      <svg viewBox="0 0 640 280" focusable="false">
        <path className="auth-route-street" d="M 18 172 C 92 158, 112 111, 178 104 S 258 123, 317 76 S 404 42, 474 56 S 563 35, 626 24" />
        <path className="auth-route-street" d="M 28 254 C 91 218, 139 235, 198 207 S 269 188, 324 214 S 406 237, 467 199 S 552 175, 620 190" />
        <path className="auth-route-street" d="M 90 42 C 130 78, 157 89, 203 81 S 274 42, 313 19" />
        <path className="auth-route-street" d="M 350 270 C 372 224, 384 184, 428 166 S 517 152, 596 128" />
        <path
          className="auth-route-line"
          pathLength="1"
          d={routePath}
        />
        <circle className="auth-route-marker-halo" cx="64" cy="218" r="12" />
        <circle className="auth-route-marker" cx="64" cy="218" r="4" />
        <g transform="translate(590 72)">
          <circle className="auth-route-marker-halo" r="13" />
          <path className="auth-route-marker" d="M 0 7 C -2 3 -7 -2 -7 -6 A 7 7 0 1 1 7 -6 C 7 -2 2 3 0 7 Z" />
          <circle cx="0" cy="-6" r="2.2" fill="#0f5570" />
        </g>
        <g className="auth-route-traveler">
          <animateMotion
            dur="8s"
            repeatCount="indefinite"
            rotate="0"
            path={routePath}
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0;0"
            keyTimes="0;0.08;0.82;0.94;1"
            dur="8s"
            repeatCount="indefinite"
          />
          <g transform="translate(0 -12) scale(1.35)">
            <circle className="auth-route-person-head" cx="0" cy="-8" r="3.5" />
            <path className="auth-route-person" d="M 0 -3 L -1 6 M -1 -1 L -7 3 M -1 -1 L 5 2" />
            <g className="auth-route-leg auth-route-leg--back">
              <path className="auth-route-person" d="M -1 6 L -6 13" />
            </g>
            <g className="auth-route-leg">
              <path className="auth-route-person" d="M -1 6 L 5 12" />
            </g>
          </g>
        </g>
        <g className="auth-route-traveler-static" transform="translate(336 107) scale(1.35)">
          <circle className="auth-route-person-head" cx="0" cy="-8" r="3.5" />
          <path className="auth-route-person" d="M 0 -3 L -1 6 M -1 -1 L -7 3 M -1 -1 L 5 2 M -1 6 L -6 13 M -1 6 L 5 12" />
        </g>
      </svg>
    </div>
  );
}