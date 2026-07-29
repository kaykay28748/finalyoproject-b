import { useRef, useEffect, useCallback, useState } from "react";

const PEEK_HEIGHT = typeof window !== "undefined" && window.innerWidth >= 1024 ? 140 : 120;

export function useDragSheet({ expanded, onExpandedChange, disableDrag, onDragProgress, onNavPanelClose }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);
  const dragStartExpanded = useRef(false);
  const sheetRef = useRef(null);
  const expandedRef = useRef(expanded);

  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  const recalcPositions = useCallback(() => {
    const el = sheetRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    return { peekY: h - PEEK_HEIGHT, expandedY: 0 };
  }, []);

  const snapTo = useCallback((targetY) => {
    const el = sheetRef.current;
    if (!el) return;
    el.classList.add("legend-sheet--snapping");
    const isDesktop = window.innerWidth >= 1024;
    el.style.transform = isDesktop ? `translateX(-50%) translateY(${targetY}px)` : `translateY(${targetY}px)`;
    const onEnd = () => {
      el.classList.remove("legend-sheet--snapping");
      el.removeEventListener("transitionend", onEnd);
    };
    el.addEventListener("transitionend", onEnd);
    if (onDragProgress) {
      const pos = recalcPositions();
      if (pos) {
        const progress = pos.peekY > 0 ? 1 - (targetY / pos.peekY) : 0;
        onDragProgress(progress);
      }
    }
  }, [onDragProgress, recalcPositions]);

  const handleDragStart = useCallback((e) => {
    if (disableDrag) return;
    if (e.target.closest('button, a, input, select, textarea')) return;

    e.stopPropagation();
    if (e.type === "touchstart" && e.cancelable) e.preventDefault();

    const el = sheetRef.current;
    if (!el) return;

    el.classList.remove("legend-sheet--snapping");
    el.style.transition = "none";

    const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    dragCurrentY.current = clientY;
    dragStartExpanded.current = expandedRef.current;
    setIsDragging(true);
    el.classList.add("dragging");
  }, [disableDrag]);

  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();

    const clientY = e.type.includes("touch") ? e.touches[0].clientY : e.clientY;
    dragCurrentY.current = clientY;
    const deltaY = clientY - dragStartY.current;

    const pos = recalcPositions();
    if (!pos) return;
    const targetY = Math.max(pos.expandedY, Math.min(pos.peekY, dragStartExpanded.current ? deltaY : pos.peekY + deltaY));

    const isDesktop = window.innerWidth >= 1024;
    const el = sheetRef.current;
    if (el) {
      el.style.transform = isDesktop ? `translateX(-50%) translateY(${targetY}px)` : `translateY(${targetY}px)`;
      if (onDragProgress) {
        const progress = pos.peekY > 0 ? 1 - (targetY / pos.peekY) : 0;
        onDragProgress(progress);
      }
    }
  }, [isDragging, recalcPositions, onDragProgress]);

  const handleDragEnd = useCallback((e) => {
    if (!isDragging) return;
    e?.stopPropagation();

    const el = sheetRef.current;
    if (el) el.classList.remove("dragging");
    setIsDragging(false);

    const pos = recalcPositions();
    if (!pos) return;

    const currentY = parseFloat(el?.style.transform?.match(/translateY\(([-\d.]+)px\)/)?.[1] ?? "0");
    const midpoint = pos.peekY / 2;
    const shouldExpand = currentY < midpoint;

    if (shouldExpand !== expandedRef.current) {
      onExpandedChange?.(shouldExpand);
      if (shouldExpand && onNavPanelClose) onNavPanelClose();
      requestAnimationFrame(() => {
        const newPos = recalcPositions();
        if (newPos) snapTo(shouldExpand ? newPos.expandedY : newPos.peekY);
      });
    } else {
      snapTo(shouldExpand ? pos.expandedY : pos.peekY);
    }
  }, [isDragging, recalcPositions, snapTo, onExpandedChange, onNavPanelClose]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => handleDragMove(e);
    const onUp = (e) => handleDragEnd(e);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const toggleExpanded = useCallback(() => {
    const next = !expandedRef.current;
    onExpandedChange?.(next);
    requestAnimationFrame(() => {
      const pos = recalcPositions();
      if (pos) snapTo(next ? pos.expandedY : pos.peekY);
    });
  }, [onExpandedChange, recalcPositions, snapTo]);

  const initPosition = useCallback(() => {
    requestAnimationFrame(() => {
      const pos = recalcPositions();
      if (pos) snapTo(expandedRef.current ? pos.expandedY : pos.peekY);
    });
  }, [recalcPositions, snapTo]);

  return {
    sheetRef,
    isDragging,
    handleDragStart,
    handleDragEnd,
    handleDragMove,
    toggleExpanded,
    initPosition,
  };
}
