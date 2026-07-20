import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

export type CategoryIconName = ComponentProps<typeof Ionicons>["name"];

export const CATEGORY_ICONS: Record<string, CategoryIconName> = {
  food: "restaurant-outline",
  travel: "car-outline",
  shopping: "bag-handle-outline",
  bills: "receipt-outline",
  transfer: "swap-horizontal-outline",
  entertainment: "film-outline",
  health: "heart-outline",
  other: "pricetag-outline",
};

export function categoryIcon(slug?: string | null): CategoryIconName {
  if (!slug) return "ellipse-outline";
  return CATEGORY_ICONS[slug] ?? "pricetag-outline";
}
