// parseCsv — minimal, strict, zero-dependency CSV parser for LOCAL export analysis
// (Loop 34). OFFLINE ONLY: pure function over a string; no I/O, no network.
//
// Handles the spreadsheet-export dialect: optional UTF-8 BOM, CRLF/LF line endings,
// RFC-4180 quoting (embedded commas, quotes doubled as "", embedded newlines inside
// quoted cells — Status Updates blobs are multiline).

/**
 * @param {string} text raw CSV text
 * @returns {{ headers: string[], rows: Record<string,string>[], parseWarnings: string[] }}
 */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;

  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => { endField(); records.push(record); record = []; };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c; // embedded commas/newlines preserved verbatim
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { endField(); continue; }
    if (c === '\r') { if (src[i + 1] === '\n') i++; endRecord(); continue; }
    if (c === '\n') { endRecord(); continue; }
    field += c;
  }
  if (field !== '' || record.length > 0) endRecord(); // final record without trailing newline

  const parseWarnings = [];
  if (inQuotes) parseWarnings.push('unterminated quoted field at end of input');
  if (records.length === 0) return { headers: [], rows: [], parseWarnings: ['empty input'] };

  const headers = records[0].map((h) => String(h).trim());
  const rows = [];
  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    if (cells.length === 1 && cells[0] === '') continue; // blank line
    if (cells.length !== headers.length) {
      parseWarnings.push(`row ${r}: ${cells.length} cell(s) for ${headers.length} header(s)`);
    }
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows, parseWarnings };
}

export default parseCsv;
