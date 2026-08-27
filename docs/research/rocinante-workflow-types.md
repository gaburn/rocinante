# Rocinante Workflow Types Research

Status: decision-ready (2026-08-27)

## Conclusion

Port Stella's workflow domain core, not its Canvas and not Rocinante's
`SessionSource` abstraction. Rocinante already has Express/React, agent
discovery, process launch, resumable Copilot PTYs, and local session
observation. Add a server-owned workflow engine containing the bounded mode
catalog, state transitions, validation, and atomic JSON persistence. Adapt it
to existing PTY dispatch and ordinary REST rendering.[^rocinante-pty]

Do not add a general DAG editor, user-authored phase schema, plugin system, or
another session-provider type.

## Bounded catalog

- Full: Research -> Prototype -> Plan -> Implement -> Formal Review -> Finalize -> PR.
- Simple: Research -> Implement -> optional PR.
- Bug Fix: optional Intake -> Diagnose and Fix -> Formal Review -> Finalize -> PR.
- Architecture Health: Shape -> direct Implement OR Specification + Tasks + Implement -> Formal Review -> Finalize -> PR.
- Wayfinding: Wayfind -> Specification -> Tasks -> Implement -> Formal Review -> Finalize -> PR.

The catalog owns optional phases, Artifact requirements, Deliverable gates,
review behavior, Autopilot transitions, mode prompts, and the bounded choices
for Bug Fix and Architecture Health. Active phases are derived from catalog
data, not stored as an arbitrary graph.
The bounded paths and their gates are defined by Stella's mode catalog rather
than inferred from Canvas rendering.[^stella-modes]

## State and transitions

Stella persists schema-versioned JSON under
`~/.copilot/engineering-workflows/<workflowId>.json`. Rocinante must own a
separate versioned format, for example
`~/.rocinante/workflows/<workflowId>.json`; Stella schema v10 is not a public
contract. Writes serialize per workflow and replace via temporary-file rename.
Those persistence and transition semantics come from Stella's workflow
extension implementation.[^stella-extension]

The portable state includes stable identity, name, goal, mode state, target
session, Review Selection/Base, work items, findings, pending input, phase and
Step statuses, summaries, Artifact refs, activity, and timestamps.

Transitions remain distinct behind one mutation and guard boundary:

- Register output validates the active run and records summary, Artifacts, and
  optional findings.
- Approval is human-only and enforces Artifact, Deliverable, input, and finding
  gates.
- Mode Gate selects one catalogued continuation after prerequisite Approval.
- Input Request pauses automatic continuation, persists the question and
  choices, and returns the answer to the same running Step.

## Rocinante seam

Reuse repository validation, launch records, configured Copilot command,
`node-pty`, `/ws/terminal`, and `copilot --resume=<sessionId>`. Do not extend
`SessionSource`; it only models Copilot/Claude read ingestion. Move active run
ownership out of the WebSocket lifecycle so disconnect does not kill a
Step.[^rocinante-terminal][^rocinante-providers]

Add:

1. A workflow core with the five catalogs, strict restore, atomic persistence,
   and guarded transitions.
2. A Copilot-first adapter over existing launch/resume behavior.
3. Thin REST routes for list/create/detail/run-step/output/Approval/Mode
   Gate/Input Response.
4. Dashboard creation, path preview, progress, Artifact, gate, input, and
   linked Workflow Session views backed by server state.

Prove Simple Research -> Implement first, including disconnect survival,
Artifact registration, Approval, input pause/resume, restart restore, and
progress.

Deferred: arbitrary DAGs, Stella file interoperability, shared packages,
Claude execution, multi-host sync, ADO automation, Autopilot, parallel Formal
Review fan-out, and new infrastructure or dependencies.

## Sources

[^stella-modes]: [Stella workflow mode catalog](https://github.com/gaburn_microsoft/stella-workflow-manager/blob/main/.github/extensions/engineering-workflow/workflow-modes.mjs)
[^stella-extension]: [Stella workflow extension lifecycle and persistence](https://github.com/gaburn_microsoft/stella-workflow-manager/blob/main/.github/extensions/engineering-workflow/extension.mjs)
[^rocinante-pty]: [Rocinante PTY manager at the Implement Review Base](https://github.com/gaburn/rocinante/blob/662d2f318a202188e8bc78be4d810d44359f58e8/server/services/ptyManager.ts)
[^rocinante-terminal]: [Rocinante terminal route at the Implement Review Base](https://github.com/gaburn/rocinante/blob/662d2f318a202188e8bc78be4d810d44359f58e8/server/routes/terminal.ts)
[^rocinante-providers]: [Rocinante SessionSource contract at the Implement Review Base](https://github.com/gaburn/rocinante/blob/662d2f318a202188e8bc78be4d810d44359f58e8/server/services/providers/types.ts)
