# ADR 0009: Rocinante owns portable workflow state

Status: accepted

## Decision

Rocinante owns the first portable Workflow State schema and ports Stella's
tested behavior. It does not read or write Stella schema-v10 files and does
not publish a shared package initially.

## Rationale

Directly sharing Stella state couples Rocinante to Canvas-origin metadata. A
shared package adds release coordination before the host boundary is proven.
Rocinante needs a versioned, strict, machine-independent state contract under
its own server lifecycle.

