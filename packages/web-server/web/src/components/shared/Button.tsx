import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Reusable button component with variant and size support.
 * Uses the Continuum design-system theme tokens for consistent styling.
 */

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Button content */
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent hover:bg-accent-hover text-white shadow-sm shadow-accent/20",
  secondary:
    "bg-bg-elevated hover:bg-bg-hover text-text-primary border border-border hover:border-border-hover",
  ghost:
    "bg-transparent hover:bg-bg-hover text-text-secondary hover:text-text-primary",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs rounded-md gap-1.5",
  md: "px-3.5 py-1.5 text-sm rounded-lg gap-2",
  lg: "px-5 py-2.5 text-base rounded-lg gap-2.5",
};

/**
 * Button — a flexible, themeable button for the Continuum Web IDE.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={handleSave}>
 *   Save
 * </Button>
 * ```
 */
function Button({
  variant = "primary",
  size = "md",
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = `
    inline-flex items-center justify-center font-medium
    transition-all duration-150
    focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none
    active:scale-[0.97]
    ${variantClasses[variant]}
    ${sizeClasses[size]}
    ${disabled ? "opacity-50 cursor-not-allowed" : ""}
    ${className ?? ""}
  `.trim();

  return (
    <button className={classes} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

export default Button;
