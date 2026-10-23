import { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "green" | "amber" | "red" | "blue";
}

const variantClasses = {
  default: "bg-zinc-700 text-zinc-300",
  green: "bg-emerald-900/50 text-emerald-400",
  amber: "bg-amber-900/50 text-amber-400",
  red: "bg-red-900/50 text-red-400",
  blue: "bg-blue-900/50 text-blue-400",
};

export function Badge({ variant = "default", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
