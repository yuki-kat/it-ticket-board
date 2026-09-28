import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge and deduplicate CSS class names, resolving TailwindCSS conflicts.
 * Combines clsx for conditional classes with tailwind-merge for proper overrides.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
