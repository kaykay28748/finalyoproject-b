export function getTrafficLabel() {
  const h = new Date().getUTCHours();
  const d = new Date().getDay();
  if (d === 0) return "Very light";
  if (d === 6) return "Light";
  if (h >= 8 && h <= 9) return "Busy";
  if (h >= 12 && h <= 13) return "Busy";
  if (h >= 16 && h <= 17) return "Busy";
  return "Moderate";
}
