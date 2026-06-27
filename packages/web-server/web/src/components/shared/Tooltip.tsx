import { useRef, useState, type ReactNode } from "react";

/**
 * Tooltip component that displays informational text on hover.
 * Supports configurable position and show-delay.
 */

type TooltipPosition = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** The element that triggers the tooltip on hover */
  children: ReactNode;
  /** Text content displayed inside the tooltip */
  content: string;
  /** Where the tooltip appears relative to the trigger */
  position?: TooltipPosition;
  /** Milliseconds to wait before showing the tooltip */
  delay?: number;
}

const positionClasses: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

/**
 * Tooltip — a lightweight hover tooltip for contextual help.
 *
 * @example
 * ```tsx
 * <Tooltip content="Save your changes" position="top">
 *   <Button variant="primary">Save</Button>
 * </Tooltip>
 * ```
 */
function Tooltip({
  children,
  content,
  position = "top",
  delay = 300,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  }

  function handleMouseLeave() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      <span
        className={`bg-bg-elevated text-text-primary pointer-events-none absolute z-[60] whitespace-nowrap rounded-md px-2 py-1 text-xs shadow-lg shadow-black/30 transition-opacity duration-150 ${positionClasses[position]} ${visible ? "opacity-100" : "opacity-0"} `}
        role="tooltip"
      >
        {content}
      </span>
    </div>
  );
}

export default Tooltip;
