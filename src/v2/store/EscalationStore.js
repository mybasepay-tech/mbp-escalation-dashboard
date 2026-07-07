// EscalationStore — the data-access seam (docs/ARCHITECTURE.md §3.2).
//
// The UI and app logic depend ONLY on this contract, never on a concrete backend. The MVP
// ships `MockStore` (in-memory). Later, swappable adapters can implement the same contract
// (e.g. an API-backed or Dataverse-backed store) WITHOUT changing callers.
//
// IMPORTANT (Loop 3 safety): there is intentionally NO live-backend implementation here.
// No Microsoft Graph, no SharePoint, no network. This file is an abstract contract only.

export class EscalationStore {
  // ----- Tickets -----
  /** @returns {Promise<import('../domain/models.js').Ticket|null>} */
  async getTicket(_id) { throw new Error('not implemented'); }
  /** @returns {Promise<import('../domain/models.js').Ticket[]>} */
  async listTickets(_filter = {}) { throw new Error('not implemented'); }
  /** @returns {Promise<import('../domain/models.js').Ticket>} */
  async createTicket(_input) { throw new Error('not implemented'); }

  // ----- Assignment & lifecycle (each records activity) -----
  async assignDepartment(_id, _deptId, _opts) { throw new Error('not implemented'); }
  async assignPerson(_id, _userId, _opts) { throw new Error('not implemented'); }
  async clearAssignee(_id, _opts) { throw new Error('not implemented'); }
  async setStatus(_id, _status, _opts) { throw new Error('not implemented'); }
  async setPriority(_id, _priority, _opts) { throw new Error('not implemented'); }
  async addTag(_id, _tagId, _opts) { throw new Error('not implemented'); }
  async removeTag(_id, _tagId, _opts) { throw new Error('not implemented'); }
  /** Set/clear the optional amount of money involved (records activity). */
  async setAmount(_id, _amount, _opts) { throw new Error('not implemented'); }

  // ----- Activity, comments, notes (three separate streams) -----
  /** @returns {Promise<import('../domain/models.js').ActivityEvent[]>} */
  async listActivity(_id) { throw new Error('not implemented'); }
  /** Public comments (member/requester-facing). @returns {Promise<import('../domain/models.js').Comment[]>} */
  async listComments(_id) { throw new Error('not implemented'); }
  /** Internal notes (visibility metadata for future permissions). @returns {Promise<import('../domain/models.js').Note[]>} */
  async listNotes(_id) { throw new Error('not implemented'); }
  async addComment(_id, _input) { throw new Error('not implemented'); }
  async addNote(_id, _input) { throw new Error('not implemented'); }

  // ----- Attachments (metadata-first — no file bytes, no document library in MVP) -----
  /** Active (non-deleted) attachment metadata for a ticket. @returns {Promise<import('../domain/models.js').Attachment[]>} */
  async listAttachments(_id) { throw new Error('not implemented'); }
  /** Add attachment METADATA (fileName + optional fileUrl placeholder etc.); records activity. */
  async addAttachment(_id, _input) { throw new Error('not implemented'); }
  /** Soft-delete an attachment (metadata preserved); records activity. */
  async removeAttachment(_id, _attachmentId, _opts) { throw new Error('not implemented'); }

  // ----- Views -----
  /** Department queue: ALL tickets for a department, including person-assigned ones. */
  async departmentQueue(_deptId, _opts) { throw new Error('not implemented'); }
  /** My Assigned Tickets: only tickets assigned to the given person. */
  async myAssignedTickets(_userId, _opts) { throw new Error('not implemented'); }

  // ----- Reference data -----
  async listDepartments() { throw new Error('not implemented'); }
  async listUsers() { throw new Error('not implemented'); }
  async listTags() { throw new Error('not implemented'); }
}
