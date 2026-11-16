
import React, { useState, useRef, useEffect } from 'react';
import { UIElement } from '../types';

interface Props {
  element: UIElement;
  isSelected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onUpdate: (id: string, updates: Partial<UIElement>) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  isDraggingGroup: boolean;
  isCandidate?: boolean; // New prop for candidate elements
  onToggleCandidate?: (id: string) => void; // Handler for toggling candidates
}

const DraggableElement: React.FC<Props> = ({ 
  element, 
  isSelected, 
  onSelect, 
  onUpdate, 
  containerRef,
  isCandidate,
  onToggleCandidate
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const startPos = useRef({ x: 0, y: 0, elX: 0, elY: 0, elW: 0, elH: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return; 

    // Special behavior for candidates (review mode)
    if (isCandidate && onToggleCandidate) {
      onToggleCandidate(element.id);
      return;
    }

    onSelect(element.id, e.ctrlKey || e.shiftKey || e.metaKey);
    setIsDragging(true);

    if (containerRef.current) {
      startPos.current = {
        x: e.clientX,
        y: e.clientY,
        elX: element.x,
        elY: element.y,
        elW: element.width,
        elH: element.height
      };
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      elX: element.x,
      elY: element.y,
      elW: element.width,
      elH: element.height
    };
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - startPos.current.x) / rect.width) * 100;
      const dy = ((e.clientY - startPos.current.y) / rect.height) * 100;

      if (isDragging) {
        onUpdate(element.id, { 
          x: Math.max(0, Math.min(100 - element.width, startPos.current.elX + dx)),
          y: Math.max(0, Math.min(100 - element.height, startPos.current.elY + dy))
        });
      }

      if (isResizing) {
        onUpdate(element.id, { 
          width: Math.max(2, Math.min(100 - element.x, startPos.current.elW + dx)),
          height: Math.max(2, Math.min(100 - element.y, startPos.current.elH + dy))
        });
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, isResizing, element, onUpdate, containerRef]);

  // Determine styles based on state
  // "outline 2px solid blue" for selected
  const outlineStyle = isSelected 
    ? '2px solid #2563eb' 
    : (isCandidate ? '2px dashed #10b981' : 'none');
  
  // Use transparent background if we have an image, otherwise fallback
  const bgColor = element.imageData 
    ? 'transparent' 
    : (isCandidate 
        ? (isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.05)') 
        : (element.color || (isSelected ? 'rgba(37, 99, 235, 0.05)' : 'rgba(255, 255, 255, 0.1)')));

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute cursor-move transition-all duration-75 group ${
        isSelected ? 'z-50' : (isCandidate ? 'z-40' : 'hover:outline hover:outline-1 hover:outline-blue-300 z-10')
      }`}
      style={{
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.width}%`,
        height: `${element.height}%`,
        backgroundColor: bgColor,
        outline: outlineStyle,
        outlineOffset: '-1px', // Pull outline inside slightly
        borderRadius: '4px',
      }}
    >
      {/* The Actual Captured Image Element */}
      {element.imageData && (
        <img 
          src={element.imageData} 
          alt={element.label}
          className="w-full h-full object-fill pointer-events-none select-none block"
        />
      )}

      {/* Label Tag (Hidden if it's a real image deconstruction to keep it clean, unless selected) */}
      {!isCandidate && isSelected && (
        <div className="absolute -top-6 left-0 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap pointer-events-none z-[60]">
          {element.label}
        </div>
      )}
      
      {/* Candidate Label */}
      {isCandidate && (
        <div className={`absolute -top-6 left-0 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none ${isSelected ? 'bg-green-600' : 'bg-green-400 opacity-80'}`}>
          {isSelected ? <><i className="fas fa-check mr-1"></i>Detect</> : 'Found'} {element.label}
        </div>
      )}

      {/* Placeholder Text if no image */}
      {!element.imageData && (
        <div className="w-full h-full flex items-center justify-center p-1 overflow-hidden pointer-events-none select-none">
          {element.text && <span className="text-[10px] text-slate-700 truncate">{element.text}</span>}
          {!element.text && element.type === 'image' && <i className="fas fa-image text-slate-300"></i>}
        </div>
      )}

      {/* Resize Handle (only for actual selected items, not candidates) */}
      {isSelected && !isCandidate && (
        <div 
          onMouseDown={handleResizeStart}
          className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize rounded-tl-sm z-[60] flex items-center justify-center"
        >
          <div className="w-1 h-1 bg-white rounded-full"></div>
        </div>
      )}
    </div>
  );
};

export default DraggableElement;
