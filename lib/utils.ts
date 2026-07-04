import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * lib/utils.ts
 *
 * Merges Tailwind class lists safely: clsx() handles conditional classes,
 * twMerge() then resolves conflicts (e.g. a passed-in `bg-amber-700`
 * correctly overrides a component's default `bg-primary`) instead of both
 * classes being applied and the browser picking whichever comes last in
 * the stylesheet.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
