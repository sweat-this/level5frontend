export interface PlatformDestination {
  readonly label: string;
  readonly href: string;
  readonly isActive: (pathname: string) => boolean;
}

// The platform's global navigation destinations (issue #21). Adding a game here is just one more
// entry - PlatformHeader/PlatformFooter render this list, no structural change needed.
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
  {
    label: "Secret Robot",
    href: "/secret-robot",
    isActive: (pathname) =>
      pathname === "/secret-robot" || pathname.startsWith("/secret-robot/"),
  },
];
