/**
 * Fixed allow-list of ?notice= codes /account/friends renders after a mutation redirect (issue
 * #8 section 20). An arbitrary query-string value is never rendered directly - only one of these
 * exact codes maps to copy, so a manipulated notice value degrades to "no notice" rather than
 * reflecting attacker-controlled text into the page.
 */
export type FriendNoticeCode =
  | "request-sent"
  | "request-accepted"
  | "request-declined"
  | "request-cancelled"
  | "friend-removed"
  | "state-changed";

export interface FriendNoticeView {
  readonly severity: "success" | "info";
  readonly message: string;
}

const NOTICE_VIEWS: Readonly<Record<FriendNoticeCode, FriendNoticeView>> = {
  "request-sent": { severity: "success", message: "Friend request sent." },
  "request-accepted": {
    severity: "success",
    message: "Friend request accepted.",
  },
  "request-declined": {
    severity: "success",
    message: "Friend request declined.",
  },
  "request-cancelled": {
    severity: "success",
    message: "Friend request cancelled.",
  },
  "friend-removed": { severity: "success", message: "Friend removed." },
  "state-changed": {
    severity: "info",
    message:
      "That didn't go through because something changed since this page loaded. Here's the latest.",
  },
};

function isFriendNoticeCode(value: string): value is FriendNoticeCode {
  return Object.prototype.hasOwnProperty.call(NOTICE_VIEWS, value);
}

export function resolveFriendNotice(
  raw: string | undefined,
): FriendNoticeView | undefined {
  if (!raw || !isFriendNoticeCode(raw)) {
    return undefined;
  }
  return NOTICE_VIEWS[raw];
}
