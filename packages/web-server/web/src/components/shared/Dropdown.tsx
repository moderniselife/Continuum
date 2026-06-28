import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Dropdown component with a trigger element and a floating panel.
 * Closes on outside click via mousedown listener.
 */

interface DropdownProps {
  /** Element that toggles the dropdown */
  trigger: ReactNode;
  /** Dropdown panel content (typically DropdownItem elements) */
  children: ReactNode;
  /** Horizontal alignment of the panel relative to the trigger */
  align?: "left" | "right";
  /** Additional classes for the container */
  className?: string;
}

const alignClasses: Record<"left" | "right", string> = {
  left: "left-0",
  right: "right-0",
};

/**
 * Dropdown — a trigger-activated floating panel.
 *
 * @example
 * ```tsx
 * <Dropdown trigger={<Button variant="ghost">Menu</Button>}>
 *   <DropdownItem onClick={handleEdit}>Edit</DropdownItem>
 *   <DropdownItem onClick={handleDelete}>Delete</DropdownItem>
 * </Dropdown>
 * ```
 */
function Dropdown({
  trigger,
  children,
  align = "left",
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside the container
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className ?? ""}`}
    >
      <div onClick={() => setIsOpen((prev) => !prev)}>{trigger}</div>

      {isOpen && (
        <div
          className={`bg-bg-elevated border-border animate-fade-in absolute z-50 min-w-[180px] rounded-lg border py-1 shadow-xl shadow-black/40 ${alignClasses[align]} `}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * DropdownItem — individual selectable row
 * ───────────────────────────────────────────── */

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  /** Marks the item as the currently active selection */
  active?: boolean;
  className?: string;
}

/**
 * DropdownItem — a single selectable row inside a Dropdown panel.
 */
export function DropdownItem({
  children,
  onClick,
  active,
  className,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hover:bg-bg-hover w-full cursor-pointer px-3 py-1.5 text-left text-sm transition-all duration-150 ${active ? "bg-bg-active text-accent" : ""} ${className ?? ""} `}
    >
      {children}
    </button>
  );
}

export default Dropdown;
