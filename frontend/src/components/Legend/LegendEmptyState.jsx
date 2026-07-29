export default function LegendEmptyState({ routeActive }) {
  return (
    <div className="legend-empty-route">
      <div className="empty-route-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </div>
      {routeActive ? (
        <>
          <h3 className="empty-route-title">Restoring your route</h3>
          <p className="empty-route-text">Loading the road network and recalculating your route...</p>
        </>
      ) : (
        <>
          <h3 className="empty-route-title">Search for a destination</h3>
          <p className="empty-route-text">Tap the search bar to find places on campus and get step-by-step directions.</p>
        </>
      )}
    </div>
  );
}
