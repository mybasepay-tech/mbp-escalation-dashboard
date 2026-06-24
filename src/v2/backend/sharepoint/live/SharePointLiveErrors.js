// SharePointLiveErrors — typed errors for the REAL SharePoint client wrapper.
//
// These intentionally mirror the FakeSharePoint error `code` values ('throttled', 'conflict',
// 'notFound') so SharePointStore's existing retry/conflict/compensation logic behaves identically
// whether it is given the fake client or the live wrapper. No network, no SDK imports here — just
// error shapes. The live wrapper translates a transport's HTTP statuses (429/412/404) into these.

export class SharePointLiveError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'SharePointLiveError';
    this.code = code;
    this.status = status;
  }
}

/** 404 — item or list does not exist. */
export class NotFoundError extends SharePointLiveError {
  constructor(message = 'Item not found') { super(message, 'notFound', 404); this.name = 'NotFoundError'; }
}

/** 412 — ETag/precondition mismatch (optimistic-concurrency conflict). */
export class ConflictError extends SharePointLiveError {
  constructor(message = 'ETag precondition failed (item changed since read)') {
    super(message, 'conflict', 412); this.name = 'ConflictError';
  }
}

/** 429 — throttled; carries a retryAfterMs hint (from a Retry-After header at runtime). */
export class ThrottledError extends SharePointLiveError {
  constructor(message = 'Request throttled', retryAfterMs = 1000) {
    super(message, 'throttled', 429); this.name = 'ThrottledError'; this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Raised when the live wrapper is used without a runtime transport / auth wired in. This is the
 * fail-closed default — the committed code never connects on its own.
 */
export class LiveNotConfiguredError extends SharePointLiveError {
  constructor(message = 'SharePointLiveClient has no runtime transport. Provide an authenticated transport via git-ignored runtime config; see live/README.md.') {
    super(message, 'notConfigured', null); this.name = 'LiveNotConfiguredError';
  }
}
