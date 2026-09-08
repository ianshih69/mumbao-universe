type NavigationItem = {
  label: string;
  href: string;
  internal: boolean;
  sort_order?: number;
};

export function withFacilitiesNavigation(items: readonly NavigationItem[]): NavigationItem[] {
  // Apply to both CMS and fallback menus without changing other entries or their order.
  const result = items.filter((item) => item.href !== "/facilities" && item.label !== "館內設施");
  const roomsIndex = result.findIndex((item) => item.label === "房型介紹");
  const bookingIndex = result.findIndex((item) => item.href === "/booking");
  const insertIndex = roomsIndex >= 0 ? roomsIndex + 1 : bookingIndex >= 0 ? bookingIndex : result.length;
  result.splice(insertIndex, 0, { label: "館內設施", href: "/facilities", internal: true });
  return result;
}
