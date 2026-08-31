# Rocinante Workflow Decisions

Status: approved

1. Rocinante is the sole Workflow Host and owns portable Workflow State. It
   ports behavior, not Stella's private persisted files.
2. The server owns active runs; closing the browser does not stop a Step or
   discard state.
3. Input Request suspends and resumes the same Step.
4. Output, Approval, Mode Gates, and Input Requests remain distinct operations
   behind one transition boundary. Approval cannot substitute for output.
5. Modes remain opinionated and bounded; there is no general graph or
   user-authored schema.
6. Start with Simple Research -> Implement and prove persistence, dispatch,
   Artifacts, Approval, and reconnect before conditional paths, review fan-out,
   Autopilot, or ADO automation.

