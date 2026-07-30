import { useState, useCallback, useEffect, useRef } from 'react';
import './FloatingButtonGroup.css';

const FloatingButtonGroup = ({ buttons }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [openPopoverIndex, setOpenPopoverIndex] = useState(null);
  const containerRef = useRef(null);

  const closePopover = useCallback(() => {
    setOpenPopoverIndex(null);
  }, []);

  const handleClick = useCallback((button, index) => {
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
    <div className="floating-glass-container" ref={containerRef} role="toolbar" aria-label="Map controls">
      {buttons.map((button, index) => (
        <div
          key={index}
          className="floating-glass-item"
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

          {hoveredIndex === index && openPopoverIndex !== index && (
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
