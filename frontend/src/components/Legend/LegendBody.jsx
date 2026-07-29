export default function LegendBody({ children }) {
  return (
    <div className="legend-body" onWheel={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
