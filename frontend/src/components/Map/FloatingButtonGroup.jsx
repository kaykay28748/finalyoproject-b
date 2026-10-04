import { useState, useCallback, useEffect, useRef } from 'react';
import './FloatingButtonGroup.css';

const FloatingButtonGroup = ({ buttons }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [openPopoverIndex, setOpenPopoverIndex] = useState(null);
  const [showSecondary, setShowSecondary] = useState(false);
  const containerRef = useRef(null);

  const closePopover = useCallback(() => {
    setOpenPopoverIndex(null);
  }, []);

  const visibleButtons = showSecondary
    ? buttons
    : buttons.filter((button) => !button.secondary);

  const hasSecondaryButtons = buttons.some((button) => button.secondary);

  const renderedButtons = hasSecondaryButtons
    ? [
        ...visibleButtons,
        {
          id: 'more-toggle',
          label: showSecondary ? 'Less' : 'More',
          onClick: () => setShowSecondary((prev) => !prev),
          variant: 'secondary',
          icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          ),
          toggle: true,
        },
      ]
    : visibleButtons;

  const handleClick = useCallback((button, index) => {
    if (button.toggle) {
      button.onClick?.();
      return;
    }
    if (button.popover) {
      setOpenPopoverIndex(prev => prev === index ? null : index);
    }
    button.onClick?.();
    if (window.navigator?.vibrate) {
      window.navigator.vibrate(10);
    }
  }, []);

  useEffect(() => {
    if (openPopoverIndex === null) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenPopoverIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openPopoverIndex]);

  return (
    <div className="floating-glass-container" data-map-tour-target="map-controls" ref={containerRef} role="toolbar" aria-label="Map controls">
      {renderedButtons.map((button, index) => (
        <div
          key={button.id ?? index}
          className={`floating-glass-item${button.variant ? ` floating-glass-item--${button.variant}` : ''}${button.active ? ' floating-glass-item--active' : ''}`}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          onClick={(e) => {
            e.stopPropagation();
            handleClick(button, index);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick(button, index);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={button.label}
          aria-pressed={button.active ?? undefined}
        >
          <span
            className={`floating-glass-icon${button.active ? ' floating-glass-icon--active' : ''}`}
          >
            {button.icon}
          </span>

          {hoveredIndex === index && openPopoverIndex !== index && !button.toggle && (
            <div className="floating-glass-tooltip" role="tooltip">
              <span className="tooltip-arrow" aria-hidden="true" />
              {button.label}
            </div>
          )}

          {openPopoverIndex === index && button.popover && (
            <div className="floating-glass-popover">
              {typeof button.popover === 'function'
                ? button.popover({ closePopover, isOpen: openPopoverIndex === index })
                : button.popover}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default FloatingButtonGroup;
