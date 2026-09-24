export interface PlatformDestination {
  readonly label: string;
  readonly href: string;
  readonly isActive: (pathname: string) => boolean;
}

// The platform's global navigation destinations (issue #21). Secret Robot (/secret-robot) isn't
// listed - that route doesn't exist yet on current dev and belongs to issue #24; adding it later
// is just one more entry here, not a structural change to PlatformHeader/PlatformFooter.
export const PLATFORM_DESTINATIONS: readonly PlatformDestination[] = [
  {
    label: "Sweat This",
    href: "/",
    isActive: (pathname) => pathname === "/",
  },
  {
    label: "Level 5",
    href: "/level5",
    isActive: (pathname) =>
      pathname === "/level5" || pathname.startsWith("/level5/"),
  },
];
