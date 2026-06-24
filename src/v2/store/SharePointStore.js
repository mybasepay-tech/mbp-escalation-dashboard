// SharePointStore — DESIGN-ONLY adapter stub (NOT connected).
//
// This is a placeholder for a *future* EscalationStore adapter backed by SharePoint List v2
// (see docs/SHAREPOINT_V2_BACKEND_READINESS.md and the design-only schema at
// backend/sharepoint/schema.sharepoint-v2.json). It exists so the shape of the future
// adapter is visible and so the store contract harness has a concrete class to assert is
// "design-only" — NOT to perform any live work.
//
// HARD RULES (enforced by tests/safety.test.js, scripts/validate.js, and the contract tests):
//   * No network calls — this file performs no HTTP I/O and uses no browser request APIs.
//   * No SDK imports — no Microsoft Graph client, no SharePoint client, no Azure client.
//   * No credentials, environment variables, tenant/client IDs, secrets, or live URLs.
//   * Every operation throws a clear design-only error. MockStore is the only real backend.
//
// When a controlled build is eventually approved (gated by D3/D6/D7 and the dry-run
// checklist), this stub becomes a real adapter that translates the EscalationStore contract
// to SharePoint list items using the `mapsTo` metadata in the schema. Until then it stays
// inert.

import { EscalationStore } from './EscalationStore.js';

/** The single message every design-only operation throws. Exported for tests. */
export const DESIGN_ONLY_MESSAGE =
  'SharePointStore is design-only and not connected. Use MockStore for local MVP.';

export class SharePointStore extends EscalationStore {
  /**
   * Construction is allowed (so the contract harness and docs can reference the class), but
   * NOTHING live happens here: no client is created, no config is read, no secret is stored.
   * @param {object} [opts] - reserved for a future { siteRef, listMap } shape; ignored now.
   */
  constructor(opts = {}) {
    super();
    // Intentionally do not retain `opts` — there is no live config in the design-only stub.
    void opts;
    /** Marker so callers/tests can detect the stub without instantiating behavior. */
    this.designOnly = true;
  }

  /** Throw the standard design-only error, naming the future SharePoint mapping. */
  #notConnected(method, mapping) {
    throw new Error(`${DESIGN_ONLY_MESSAGE} (${method} -> ${mapping})`);
  }

  // ----- Tickets ----- (future: Escalations_v2_Tickets)
  async getTicket(_id) { this.#notConnected('getTicket', 'Escalations_v2_Tickets item by TicketKey'); }
  async listTickets(_filter = {}) { this.#notConnected('listTickets', 'Escalations_v2_Tickets indexed view query'); }
  async createTicket(_input) { this.#notConnected('createTicket', 'Escalations_v2_Tickets item create + Activity append'); }

  // ----- Assignment & lifecycle ----- (future: patch Tickets + append Escalations_v2_Activity)
  async assignDepartment(_id, _deptId, _opts) { this.#notConnected('assignDepartment', 'Tickets.AssignedDeptKey + Activity(assignment_change)'); }
  async assignPerson(_id, _userId, _opts) { this.#notConnected('assignPerson', 'Tickets.AssigneeKey + Activity(assignment_change)'); }
  async clearAssignee(_id, _opts) { this.#notConnected('clearAssignee', 'Tickets.AssigneeKey=null + Activity(assignment_change)'); }
  async setStatus(_id, _status, _opts) { this.#notConnected('setStatus', 'Tickets.Status + Activity(status_change)'); }
  async setPriority(_id, _priority, _opts) { this.#notConnected('setPriority', 'Tickets.Priority + Activity(priority_change)'); }

  // ----- Tags ----- (future: Escalations_v2_TicketTags link list — D12, soft-delete)
  async addTag(_id, _tagId, _opts) { this.#notConnected('addTag', 'Escalations_v2_TicketTags upsert active link + Activity(field_change)'); }
  async removeTag(_id, _tagId, _opts) { this.#notConnected('removeTag', 'Escalations_v2_TicketTags soft-delete link + Activity(field_change)'); }

  // ----- Activity, comments, notes ----- (three separate lists)
  async listActivity(_id) { this.#notConnected('listActivity', 'Escalations_v2_Activity by EscalationKey, asc'); }
  async listComments(_id) { this.#notConnected('listComments', 'Escalations_v2_Comments by EscalationKey, asc'); }
  async listNotes(_id) { this.#notConnected('listNotes', 'Escalations_v2_InternalNotes by EscalationKey, asc'); }
  async addComment(_id, _input) { this.#notConnected('addComment', 'Escalations_v2_Comments create + Activity(comment)'); }
  async addNote(_id, _input) { this.#notConnected('addNote', 'Escalations_v2_InternalNotes create + Activity(note)'); }

  // ----- Views ----- (future: indexed SharePoint views)
  async departmentQueue(_deptId, _opts) { this.#notConnected('departmentQueue', 'Tickets "Open by Department" view'); }
  async myAssignedTickets(_userId, _opts) { this.#notConnected('myAssignedTickets', 'Tickets "My Assigned" view'); }

  // ----- Reference data -----
  async listDepartments() { this.#notConnected('listDepartments', 'Escalations_v2_Departments'); }
  async listUsers() { this.#notConnected('listUsers', 'Escalations_v2_Users / Person columns'); }
  async listTags() { this.#notConnected('listTags', 'Escalations_v2_Tags dictionary'); }
}
