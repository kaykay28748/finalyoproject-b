// src/components/ui/Logo.jsx
// Reusable logo component using PWA icons from public folder

export default function Logo({ size = "md", showText = true, className = "" }) {
  const dimensions = {
    sm: 24,
    md: 32,
    lg: 48,
    xl: 64
  };

  const textSizes = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-2xl",
    xl: "text-3xl"
  };

  const logoSize = dimensions[size] || dimensions.md;
  
  // Use icon-192 for small/medium, icon-512 for large displays
  const logoSrc = logoSize >= 48 ? "/icon-512.png" : "/icon-192.png";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img 
        src={logoSrc}
        alt="TransitGuide" 
        width={logoSize}
        height={logoSize}
        className="object-contain"
      />
      {showText && (
        <span className={`font-syne font-bold ${textSizes[size]} text-gray-900 dark:text-white`}>
          TransitGuide
        </span>
      )}
    </div>
  );
}