---
quick_id: 260701-2km
slug: implement-airtable-to-be-t1-ready-using-
status: complete
---

# Implement Airtable T1 Readiness

## Goal

Make Airtable T1-ready while keeping ownership scoped to Airtable handlers, descriptors, readiness/catalog generated surfaces, write evidence, and focused tests.

## Scope

- Add Airtable T1a read handlers for base schema, field choices, record, record activity, records, and workspaces.
- Keep Airtable comment/cell mutations guarded fail-closed until live mutation-body UAT exists.
- Mark Airtable descriptors and generated catalog rows handler-backed.
- Add Airtable write activation evidence for guarded writes.
- Wire Airtable into capability catalog/search, readiness/report tooling, origin classification, path guard, port contract, and targeted tests.

## Validation Plan

- Syntax-check Airtable handler copies and touched verifier scripts.
- Run Airtable-only readiness/evidence and handler smoke checks.
- Run the T1 readiness gate.
- Run broad handler/readiness tests and record unrelated parallel-work blockers without editing out-of-scope apps.
