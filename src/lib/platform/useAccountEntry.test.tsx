import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useAccountEntry } from "./useAccountEntry";

const usePathnameMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

function Probe() {
  const entry = useAccountEntry();
  return (
    <div>
      <span data-testid="label">{entry.label}</span>
      <span data-testid="href">{entry.href}</span>
      <span data-testid="active">{String(entry.active)}</span>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useAccountEntry", () => {
  it("shows Sign In on /account/login without calling the presence endpoint", async () => {
    usePathnameMock.mockReturnValue("/account/login");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);

    expect(screen.getByTestId("label")).toHaveTextContent("Sign In");
    expect(screen.getByTestId("href")).toHaveTextContent("/account/login");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows Sign In on /account/register without calling the presence endpoint", () => {
    usePathnameMock.mockReturnValue("/account/register");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);

    expect(screen.getByTestId("label")).toHaveTextContent("Sign In");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows Account on a protected /account/* route without calling the presence endpoint", () => {
    usePathnameMock.mockReturnValue("/account/profile");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);

    expect(screen.getByTestId("label")).toHaveTextContent("Account");
    expect(screen.getByTestId("href")).toHaveTextContent("/account");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the entry active anywhere under /account", () => {
    usePathnameMock.mockReturnValue("/account/friends");
    vi.stubGlobal("fetch", vi.fn());

    render(<Probe />);

    expect(screen.getByTestId("active")).toHaveTextContent("true");
  });

  it("defaults to Sign In on a public route, then upgrades to Account once presence resolves true", async () => {
    usePathnameMock.mockReturnValue("/");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ signedIn: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);

    expect(screen.getByTestId("label")).toHaveTextContent("Sign In");
    await waitFor(() =>
      expect(screen.getByTestId("label")).toHaveTextContent("Account"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session-presence",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("stays Sign In on a public route when presence resolves false", async () => {
    usePathnameMock.mockReturnValue("/level5");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ signedIn: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByTestId("label")).toHaveTextContent("Sign In");
  });

  it("keeps the safe Sign In fallback when the presence check fails", async () => {
    usePathnameMock.mockReturnValue("/");
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByTestId("label")).toHaveTextContent("Sign In");
  });
});
