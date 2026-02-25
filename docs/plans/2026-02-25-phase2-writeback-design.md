# Phase 2 Write-Back Design

**Date**: 2026-02-25
**Status**: Approved
**Scope**: Obsidian changes write back to OmniFocus via JXA

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Detection method | Vault `modify` event | Works with all editing methods (click, keyboard), 500ms debounce |
| Architecture | Event-driven | Each change triggers immediate JXA call. Simple, instant feedback |
| Quick Add default | Current project context | Falls back to Inbox if not in a project file |
| Scope | Full Phase 2 | Checkbox, Quick Add, Flag, Due Date, Defer Date, Tags, Open in OF |

---

## Components

### 1. Checkbox Write-Back (`src/sync/change-detector.ts`)

- Listens to vault `modify` events on files inside sync folder
- 500ms debounce to avoid rapid-fire during edits
- Extracts checkbox states via regex: `- \[([ x])\] .+<!-- of:(\w+) -->`
- Compares against cached task states
- Calls `markComplete(id)` or `markIncomplete(id)` for changed tasks
- Updates cache after successful write
- Shows Notice on success/failure

### 2. JXA Write Scripts (`src/bridge/jxa-write-scripts.ts`)

| Function | OmniFocus Action |
|---|---|
| `buildMarkCompleteScript(taskId)` | `flattenedTasks.byId(id).markComplete()` |
| `buildMarkIncompleteScript(taskId)` | `flattenedTasks.byId(id).markIncomplete()` |
| `buildCreateTaskScript(name, opts)` | `new Task(name)` in project or inbox |
| `buildSetFlagScript(taskId, flagged)` | `task.flagged = bool` |
| `buildSetDueDateScript(taskId, date)` | `task.dueDate = new Date(...)` |
| `buildSetDeferDateScript(taskId, date)` | `task.deferDate = new Date(...)` |
| `buildAddTagScript(taskId, tagName)` | `task.addTag(tag)` |
| `buildRemoveTagScript(taskId, tagName)` | `task.removeTag(tag)` |

### 3. Quick Add Modal (`src/ui/quick-add-modal.ts`)

- Extends Obsidian `Modal`
- Fields: task name (required), project dropdown, due date, defer date, flag toggle, tags
- Project list populated from cache
- Default project: current file's `omnifocus-project-id` frontmatter, else Inbox
- On submit: builds JXA create script, runs it, triggers sync to update markdown

### 4. Task Action Commands (`src/commands/task-actions.ts`)

Commands operate on the task under the cursor (reads `<!-- of:taskId -->` from current line):
- "OmniFocus: Complete/Reopen Task"
- "OmniFocus: Toggle Flag"
- "OmniFocus: Set Due Date" (date input modal)
- "OmniFocus: Set Defer Date" (date input modal)
- "OmniFocus: Open in OmniFocus" (opens URL scheme)

### 5. Error Handling

- Each JXA write wrapped in try/catch
- Failure: Notice with error, no cache update
- OmniFocus not running: specific error message
- No partial state: cache only updated on success
