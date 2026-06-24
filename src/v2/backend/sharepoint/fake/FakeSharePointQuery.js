// FakeSharePointQuery — tiny, local query helpers for the simulator.
//
// Builds a predicate from a simple equality filter over indexed fields and applies stable,
// field-based sorting. No network, no parsing of real CAML/OData — just enough to exercise the
// adapter's read paths (filter-by-indexed-field, ordering) deterministically.

/**
 * Build a predicate from a plain `{col: value}` equality filter. All clauses must match (AND).
 * A value of `undefined` is ignored so callers can pass sparse filters.
 */
export function buildPredicate(filter = {}) {
  const clauses = Object.entries(filter).filter(([, v]) => v !== undefined);
  return (fields) => clauses.every(([k, v]) => fields[k] === v);
}

/** Stable sort by a field ascending (string compare); preserves input order on ties. */
export function sortByFieldAsc(items, field) {
  return [...items].sort((a, b) => String(a.fields[field] ?? '').localeCompare(String(b.fields[field] ?? '')));
}
