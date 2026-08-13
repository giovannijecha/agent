/** Closed semantic foreground classes for transient application feedback. */
export type NoticeLevel = "info" | "warning";

/** Closed visual destinations for one transient application notice. */
export type NoticePlacement = "composer" | "context";

/** Content-free identity used to reject expiry events for replaced notices. */
export type NoticeToken = Readonly<{ kind: "noticeToken" }>;

/** Creates one immutable identity whose object reference is the generation. */
export function createNoticeToken(): NoticeToken {
  return Object.freeze({ kind: "noticeToken" as const });
}
