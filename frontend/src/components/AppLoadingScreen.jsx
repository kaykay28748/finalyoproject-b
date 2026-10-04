import { useEffect, useRef, useState } from "react";
import { loadPreferences } from "../services/preferencesStore";
import "./AppLoadingScreen.css";

export default function AppLoadingScreen({ message = "Getting your map ready", darkMode }) {
  const markCanvasRef = useRef(null);
  const [markReady, setMarkReady] = useState(false);
  const [isDark, setIsDark] = useState(() => (
    typeof darkMode === "boolean"
      ? darkMode
      : window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  ));

  useEffect(() => {
    const canvas = markCanvasRef.current;
    if (!canvas) return undefined;

    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      for (let index = 0; index < pixels.length; index += 4) {
        const sourceAlpha = pixels[index + 3] / 255;
        if (sourceAlpha === 0) continue;

        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = 1 - Math.min(red, green, blue) / 255;

        if (alpha < 0.025) {
          pixels[index + 3] = 0;
          continue;
        }

        pixels[index] = Math.max(0, Math.min(255, Math.round((red - (1 - alpha) * 255) / alpha)));
        pixels[index + 1] = Math.max(0, Math.min(255, Math.round((green - (1 - alpha) * 255) / alpha)));
        pixels[index + 2] = Math.max(0, Math.min(255, Math.round((blue - (1 - alpha) * 255) / alpha)));
        pixels[index + 3] = Math.round(sourceAlpha * alpha * 255);
      }

      context.putImageData(imageData, 0, 0);
      setMarkReady(true);
    };
    image.src = "/icon-192.png";

    return () => { image.onload = null; };
  }, []);

  useEffect(() => {
    if (typeof darkMode === "boolean") {
      setIsDark(darkMode);
      return undefined;
    }

    let cancelled = false;
    loadPreferences()
      .then((preferences) => {
        if (!cancelled && typeof preferences?.darkMode === "boolean") {
          setIsDark(preferences.darkMode);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [darkMode]);

  return (
    <main className={`app-loading-screen${isDark ? " app-loading-screen--dark" : ""}`} role="status" aria-live="polite">
      <div className="app-loading-content">
        <canvas ref={markCanvasRef} className={`app-loading-mark-art${markReady ? " is-ready" : ""}`} width="192" height="192" aria-hidden="true" />
        <div className="app-loading-route" aria-hidden="true">
          <span className="app-loading-route-track" />
          <span className="app-loading-route-start" />
          <span className="app-loading-route-end" />
          <span className="app-loading-route-marker" />
        </div>
        <p className="app-loading-brand">TransitGuide</p>
        <p className="app-loading-message">{message}<span className="app-loading-ellipsis" aria-hidden="true">…</span></p>
      </div>
    </main>
  );
}