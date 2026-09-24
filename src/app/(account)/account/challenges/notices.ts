/**
 * Fixed allow-list of ?notice= codes /account/challenges renders after a mutation redirect (issue
 * #9's "Fixed Notice Codes") - mirrors friends/notices.ts's convention. An arbitrary query-string
 * value is never rendered directly; only one of these exact codes maps to copy.
 */
export type ChallengeNoticeCode =
  "accepted" | "declined" | "cancelled" | "state-changed" | "outcome-unknown";

export interface ChallengeNoticeView {
  readonly severity: "success" | "info" | "warning";
  readonly message: string;
}

const NOTICE_VIEWS: Readonly<Record<ChallengeNoticeCode, ChallengeNoticeView>> =
  {
    accepted: { severity: "success", message: "Challenge accepted." },
    declined: { severity: "success", message: "Challenge declined." },
    cancelled: { severity: "success", message: "Challenge cancelled." },
    "state-changed": {
      severity: "info",
      message:
        "That didn't go through because something changed since this page loaded. Here's the latest.",
    },
    "outcome-unknown": {
      severity: "warning",
      message:
        "We couldn't confirm the result. The latest series state is shown below.",
    },
  };

function isChallengeNoticeCode(value: string): value is ChallengeNoticeCode {
  return Object.prototype.hasOwnProperty.call(NOTICE_VIEWS, value);
}

export function resolveChallengeNotice(
  raw: string | undefined,
): ChallengeNoticeView | undefined {
  if (!raw || !isChallengeNoticeCode(raw)) {
    return undefined;
  }
  return NOTICE_VIEWS[raw];
}
