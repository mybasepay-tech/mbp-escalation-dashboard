// FakeSharePointErrors — typed errors for the local SharePoint simulator.
//
// 100% local. No network, no SDKs. These mirror the *kinds* of failures a real SharePoint /
// Graph list API surfaces (404 not-found, 412 precondition/ETag conflict, 429 throttling) so
// the adapter can be written and tested against realistic error shapes without any live call.

export class FakeSharePointError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'FakeSharePointError';
    this.code = code;
    this.status = status;
  }
}

/** 404 — item or list does not exist. */
export class NotFoundError extends FakeSharePointError {
  constructor(message = 'Item not found') { super(message, 'notFound', 404); this.name = 'NotFoundError'; }
}

/** 412 — ETag/precondition mismatch (optimistic-concurrency conflict). */
export class ConflictError extends FakeSharePointError {
  constructor(message = 'ETag precondition failed (item changed since read)') {
    super(message, 'conflict', 412); this.name = 'ConflictError';
  }
}

/** 429 — throttled; carries a retryAfterMs hint like real SharePoint. */
export class ThrottledError extends FakeSharePointError {
  constructor(message = 'Request throttled', retryAfterMs = 1) {
    super(message, 'throttled', 429); this.name = 'ThrottledError'; this.retryAfterMs = retryAfterMs;
  }
}
