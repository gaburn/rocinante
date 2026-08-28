# Rocinante Workflow Types

Status: approved

## Problem

Rocinante discovers, groups, launches, resumes, and displays local agent
sessions but cannot carry one engineering goal through a durable guided
workflow. Stella's five modes require its Copilot Canvas.

## Solution

Rocinante becomes the Workflow Host, owns portable Workflow State, offers
Full, Simple, Bug Fix, Architecture Health, and Wayfinding modes, runs each
Workflow Instance through a server-owned Workflow Session, and exposes
progress, Artifacts, Approval, Mode Gates, and Input Requests in its web app.
The first delivery is a Simple Research -> Implement tracer bullet proving
disconnect-safe server ownership before advanced modes.

## Required behavior

- Create a workflow with name, goal, Repository Target, mode, and required
  classification; preview its bounded path before creation.
- Derive ordered phases, optional paths, unlocks, status, and next action from
  one catalog rather than an arbitrary stored graph.
- Run work in one configured Copilot Workflow Session and keep the active run
  alive across browser disconnect and reconnect.
- Register summaries and bounded Artifact refs. Local paths must remain under
  the Repository Target; external refs must use HTTPS; deduplicate and bound
  lists.
- Require explicit human Approval for review-ready implementation. Reject
  invalid, stale, duplicate, concurrent, or out-of-order transitions.
- Persist Input Requests and resume the same Step after an answer; do not model
  awaiting input as a separate Step status.
- Persist each Workflow Instance independently with serialized atomic writes,
  strict schema/version/identity/status/Artifact validation, restart recovery,
  and visible corruption errors.
- List and show workflows alongside unchanged workstreams. Backend state owns
  workflow identity and session binding; `localStorage` does not.
- Keep `SessionSource` unchanged. Reuse existing repository validation,
  Copilot launch/resume, Vitest, and route conventions.

## State and lifecycle

State includes stable ID, name, goal, mode, Repository Target, Workflow
Session ID, ordered phase and Step state, Artifacts, pending Input Request,
activity, and timestamps. Use one file per workflow under Rocinante app data.
Persist a running Step before dispatch so restart can resume incomplete
delivery. Keep an Input Request pending until its answer reaches the active
Workflow Session. Restore local Artifact references from canonical,
repository-contained syntax without requiring the referenced file to remain
present.

Statuses are `pending`, `running`, `awaiting review`, `complete`, and
`skipped`. Awaiting input is persisted on the active running Step. Only the
next eligible Step starts and only one Step may be active.

One workflow service owns all transition guards. Thin REST routes expose:

- `GET/POST /api/workflows`
- `GET /api/workflows/:id`
- run-step, register-output, approve, mode-gate, and input-response operations

Output must match workflow, phase, Step, and run. Approval accepts an Artifact.
A Mode Gate selects only a catalogued continuation.

## Delivery

1. Create and strictly restore a Simple Workflow Instance.
2. Run resilient Simple Research with disconnect survival, Input Request, and
   Artifact registration.
3. Complete Simple Implement with run-matched output and human Approval.
4. Add bounded Full, Bug Fix, Architecture Health, and Wayfinding slices using
   the same catalog and transition boundary.

## Verification

Use the existing Vitest and server route/service conventions. Test at the
workflow HTTP API with a temporary Rocinante data directory and injected fake
Workflow Session transport.

The black-box Simple scenario covers create, Research start/output, Implement
start/output, premature continuation rejection, Approval, and restart restore.
Additional tests cover disconnect/reconnect, same-run Input Request resume,
invalid and duplicate transitions, malformed/unsupported persisted state,
atomic replacement, Artifact containment/traversal/HTTPS/bounds, and catalog
progression for each mode as it lands.

## Tracker

Reuse Deliverable
[63794083](https://dev.azure.com/microsoft/OS/_workitems/edit/63794083) and its
approved Tasks:

- [63794120](https://dev.azure.com/microsoft/OS/_workitems/edit/63794120) -
  Create and restore a Simple Workflow Instance.
- [63794122](https://dev.azure.com/microsoft/OS/_workitems/edit/63794122) -
  Run a resilient Simple Research Step. Blocked by 63794120.
- [63794125](https://dev.azure.com/microsoft/OS/_workitems/edit/63794125) -
  Complete Simple Implement with human Approval. Blocked by 63794122.
- [63794128](https://dev.azure.com/microsoft/OS/_workitems/edit/63794128) -
  Add bounded Full mode. Blocked by 63794125.
- [63794129](https://dev.azure.com/microsoft/OS/_workitems/edit/63794129) -
  Add bounded Bug Fix mode. Blocked by 63794125.
- [63794130](https://dev.azure.com/microsoft/OS/_workitems/edit/63794130) -
  Add bounded Architecture Health mode. Blocked by 63794125.
- [63794131](https://dev.azure.com/microsoft/OS/_workitems/edit/63794131) -
  Add bounded Wayfinding mode. Blocked by 63794125.

Do not create another Deliverable. Do not change work-item states until
implementation begins.

## Out of scope

General DAGs, user-authored modes, plugins, Stella state migration, shared
packages, Claude/generic transport, cloud sync, multi-host editing, server-exit
survival, ADO automation inside Rocinante, first-slice Autopilot, parallel
review fan-out, and replacing workstreams.
