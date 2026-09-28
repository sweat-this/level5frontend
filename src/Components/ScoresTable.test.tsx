import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import ScoresTable from "./ScoresTable";
import highscoreColumns, { MOBILE_VISIBLE_FIELDS } from "./highscoreColumns";
import type { Highscores } from "../lib/backend-v1-public/types";

const highscoresQueryMock = vi.fn();
vi.mock("../lib/backend-v1-public/hooks/useHighscores", () => ({
  default: () => highscoresQueryMock(),
}));

let capturedColumnVisibilityModel:
  Record<string, boolean | undefined> | undefined;
vi.mock("./DataTable", () => ({
  default: (props: {
    columnVisibilityModel?: Record<string, boolean | undefined>;
  }) => {
    capturedColumnVisibilityModel = props.columnVisibilityModel;
    return <div data-testid="data-table-stub" />;
  },
}));

const SAMPLE_DATA: Highscores = {
  content: [],
  totalElements: 0,
  number: 0,
  size: 50,
  numberOfElements: 0,
  totalPages: 1,
  first: true,
  last: true,
  sort: null,
};

// jsdom has no matchMedia - the standard MUI-testing polyfill, controllable per test so
// useMediaQuery(theme.breakpoints.down("sm")) resolves deterministically either way.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("ScoresTable", () => {
  beforeEach(() => {
    highscoresQueryMock.mockReturnValue({
      data: SAMPLE_DATA,
      isError: false,
      isPending: false,
    });
    capturedColumnVisibilityModel = undefined;
  });

  it("hides secondary columns below the sm breakpoint, keeping identity + primary scoring visible", () => {
    stubMatchMedia(true);

    render(<ScoresTable />);

    expect(capturedColumnVisibilityModel).toBeDefined();
    const mobileVisibleFields: readonly string[] = MOBILE_VISIBLE_FIELDS;
    for (const column of highscoreColumns) {
      expect(capturedColumnVisibilityModel?.[column.field]).toBe(
        mobileVisibleFields.includes(column.field),
      );
    }
  });

  it("shows every column at sm and above", () => {
    stubMatchMedia(false);

    render(<ScoresTable />);

    for (const column of highscoreColumns) {
      expect(capturedColumnVisibilityModel?.[column.field]).toBe(true);
    }
  });
});
