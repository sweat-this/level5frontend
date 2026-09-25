import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlatformHeader from "./PlatformHeader";

const usePathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetchSignedOut(): void {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ signedIn: false }) }),
  );
}

describe("PlatformHeader", () => {
  it("renders a header landmark", () => {
    usePathnameMock.mockReturnValue("/");
    stubFetchSignedOut();
    render(<PlatformHeader />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("links to Sweat This (/), Level 5 (/level5), and Secret Robot (/secret-robot)", () => {
    usePathnameMock.mockReturnValue("/");
    stubFetchSignedOut();
    render(<PlatformHeader />);

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(primaryNav).getByRole("link", { name: "Sweat This" }),
    ).toHaveAttribute("href", "/");
    expect(
      within(primaryNav).getByRole("link", { name: "Level 5" }),
    ).toHaveAttribute("href", "/level5");
    expect(
      within(primaryNav).getByRole("link", { name: "Secret Robot" }),
    ).toHaveAttribute("href", "/secret-robot");
  });

  it("marks Sweat This active on /", () => {
    usePathnameMock.mockReturnValue("/");
    stubFetchSignedOut();
    render(<PlatformHeader />);

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(primaryNav).getByRole("link", { name: "Sweat This" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(primaryNav).getByRole("link", { name: "Level 5" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks Level 5 active on a /level5 descendant route", () => {
    usePathnameMock.mockReturnValue("/level5/characters");
    stubFetchSignedOut();
    render(<PlatformHeader />);

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(primaryNav).getByRole("link", { name: "Level 5" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("marks Secret Robot active on a /secret-robot descendant route", () => {
    usePathnameMock.mockReturnValue("/secret-robot/world");
    stubFetchSignedOut();
    render(<PlatformHeader />);

    const primaryNav = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(primaryNav).getByRole("link", { name: "Secret Robot" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("shows Sign In on the login page and marks it active", () => {
    usePathnameMock.mockReturnValue("/account/login");
    stubFetchSignedOut();
    render(<PlatformHeader />);

    const entries = screen.getAllByRole("link", { name: "Sign In" });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveAttribute("href", "/account/login");
    expect(entries[0]).toHaveAttribute("aria-current", "page");
  });

  it("shows Account on a protected account route", () => {
    usePathnameMock.mockReturnValue("/account/profile");
    stubFetchSignedOut();
    render(<PlatformHeader />);

    const entries = screen.getAllByRole("link", { name: "Account" });
    expect(entries[0]).toHaveAttribute("href", "/account");
    expect(entries[0]).toHaveAttribute("aria-current", "page");
  });

  it("opens the mobile menu, is keyboard-accessible, and closes after selecting a destination", async () => {
    usePathnameMock.mockReturnValue("/");
    stubFetchSignedOut();
    const user = userEvent.setup();
    render(<PlatformHeader />);

    expect(
      screen.queryByRole("navigation", { name: "Mobile" }),
    ).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    menuButton.focus();
    await user.keyboard("{Enter}");

    const mobileNav = await screen.findByRole("navigation", { name: "Mobile" });
    const level5Link = within(mobileNav).getByRole("link", { name: "Level 5" });
    await user.click(level5Link);

    // The Drawer's exit transition unmounts its content asynchronously (real setTimeout, not a
    // synchronous state flip) - waitFor lets that finish instead of asserting mid-transition.
    await waitFor(() =>
      expect(
        screen.queryByRole("navigation", { name: "Mobile" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("closes the mobile menu on Escape", async () => {
    usePathnameMock.mockReturnValue("/");
    stubFetchSignedOut();
    const user = userEvent.setup();
    render(<PlatformHeader />);

    await user.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    expect(
      await screen.findByRole("navigation", { name: "Mobile" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("navigation", { name: "Mobile" }),
      ).not.toBeInTheDocument(),
    );
  });
});
