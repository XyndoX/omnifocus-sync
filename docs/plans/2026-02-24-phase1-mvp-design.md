# Phase 1 MVP Design — OmniFocus Obsidian Bridge

**Date**: 2026-02-24
**Status**: Approved
**Scope**: One-way read from OmniFocus, rendered as markdown in Obsidian

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| JXA approach | Nested `evaluateJavascript()` | Richer Omni Automation API access (perspectives, content nodes). Supports future phases. |
| Task storage | One file per project + Inbox.md | Natural Obsidian structure, frontmatter per file, easy navigation |
| Query strategy | `.whose()` filters | Filter at OmniFocus level for performance. JS fallback if type-conversion bugs arise. |
| Architecture | Layered bridge (SyncEngine + JXARunner + Cache + Renderer + IDMapper) | Each layer independently testable, directly supports Phases 2-5 |
| Settings | SettingTab + Status Bar | Polished MVP with sync folder config, connection test, last-sync indicator |

---

## Project Structure

```
src/
  main.ts                  # Plugin entry, onload/onunload, commands
  settings.ts              # SettingTab UI
  types.ts                 # OFTask, OFProject, OFTag, SyncResult, PluginSettings
  bridge/
    jxa-runner.ts          # Temp file osascript execution wrapper
    jxa-scripts.ts         # evaluateJavascript() script templates
  sync/
    sync-engine.ts         # Orchestrates pull + render cycle
  data/
    cache-manager.ts       # JSON cache read/write
    id-mapper.ts           # OF-ID <-> vault path mapping
  renderer/
    markdown-renderer.ts   # OF data -> markdown project files
manifest.json
package.json
tsconfig.json
esbuild.config.mjs
styles.css
```

---

## TypeScript Interfaces

```typescript
interface OFTask {
  id: string;
  name: string;
  note: string | null;
  completed: boolean;
  completionDate: string | null;
  dueDate: string | null;
  deferDate: string | null;
  flagged: boolean;
  estimatedMinutes: number | null;
  taskStatus: string;
  projectId: string | null;
  projectName: string | null;
  tags: { id: string; name: string }[];
  added: string | null;
  modified: string | null;
}

interface OFProject {
  id: string;
  name: string;
  note: string | null;
  status: "active" | "onHold" | "completed" | "dropped";
  dueDate: string | null;
  deferDate: string | null;
  sequential: boolean;
  folderName: string | null;
  tasks: OFTask[];
}

interface OFTag {
  id: string;
  name: string;
  parentName: string | null;
  active: boolean;
}

interface SyncResult {
  projects: OFProject[];
  inboxTasks: OFTask[];
  tags: OFTag[];
  syncedAt: string;
}

interface PluginSettings {
  syncFolderPath: string;       // Default: "OmniFocus"
  tagPrefix: string;            // Default: "of"
  showDueDate: boolean;         // Default: true
  showTags: boolean;            // Default: true
  showEstimate: boolean;        // Default: true
  showOFLink: boolean;          // Default: false
}
```

---

## JXA Bridge

### Execution Pattern

1. Build Omni Automation script (inner script)
2. Wrap in `evaluateJavascript()` JXA shell
3. Write JXA to temp file in OS temp dir
4. Execute: `child_process.execFile('osascript', ['-l', 'JavaScript', tmpFile])`
5. Parse stdout as JSON
6. Delete temp file in finally block
7. Timeout: 90 seconds. Buffer: 10MB.

### JXA Shell Template

```javascript
(() => {
  const app = Application('OmniFocus');
  app.includeStandardAdditions = true;
  const result = app.evaluateJavascript(`<omni_automation_script>`);
  return result;
})()
```

### Omni Automation Scripts

**Read active tasks**:
```javascript
(() => {
  const doc = document;
  const tasks = doc.flattenedTasks.filter(t => t.taskStatus !== Task.Status.Dropped);
  return JSON.stringify(tasks.map(t => ({
    id: t.id.primaryKey,
    name: t.name,
    note: t.note || null,
    completed: t.completed,
    completionDate: t.completionDate ? t.completionDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    deferDate: t.deferDate ? t.deferDate.toISOString() : null,
    flagged: t.flagged,
    estimatedMinutes: t.estimatedMinutes || null,
    taskStatus: t.taskStatus.toString(),
    projectId: t.containingProject ? t.containingProject.id.primaryKey : null,
    projectName: t.containingProject ? t.containingProject.name : null,
    tags: t.tags.map(tag => ({ id: tag.id.primaryKey, name: tag.name })),
    added: t.added ? t.added.toISOString() : null,
    modified: t.modificationDate ? t.modificationDate.toISOString() : null
  })));
})()
```

**Read active projects**:
```javascript
(() => {
  const doc = document;
  const projects = doc.flattenedProjects.filter(p =>
    p.status === Project.Status.Active || p.status === Project.Status.OnHold
  );
  return JSON.stringify(projects.map(p => ({
    id: p.id.primaryKey,
    name: p.name,
    note: p.note || null,
    status: p.status === Project.Status.Active ? "active" :
            p.status === Project.Status.OnHold ? "onHold" :
            p.status === Project.Status.Completed ? "completed" : "dropped",
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    deferDate: p.deferDate ? p.deferDate.toISOString() : null,
    sequential: p.sequential,
    folderName: p.parentFolder ? p.parentFolder.name : null
  })));
})()
```

**Read tags**:
```javascript
(() => {
  const doc = document;
  const tags = doc.flattenedTags;
  return JSON.stringify(tags.map(t => ({
    id: t.id.primaryKey,
    name: t.name,
    parentName: t.parent ? t.parent.name : null,
    active: t.active
  })));
})()
```

**Connection test**:
```javascript
(() => {
  return JSON.stringify({ version: app.version, name: app.name });
})()
```

---

## Sync Engine

### Sync Flow

1. Show Notice: "Syncing with OmniFocus..."
2. Run JXA: fetch tasks, projects, tags (can batch into single script)
3. Parse JSON into typed objects
4. Group tasks by projectId (no project -> inbox)
5. Assemble SyncResult
6. Write cache.json
7. Update id-map.json
8. For each project: generate/overwrite markdown file
9. Generate/overwrite Inbox.md for tasks without project
10. Update status bar: "OF: synced just now"
11. Show Notice: "Synced 42 tasks across 8 projects"

### Error Handling

- OmniFocus not running: Notice "OmniFocus is not running. Please open it and try again."
- osascript timeout: Notice "Sync timed out. OmniFocus may have too many tasks. Try again."
- JSON parse failure: Notice "Failed to read OmniFocus data. Check console for details." + console.error with raw output
- No partial writes: if JXA fails, no markdown files are touched

---

## Cache

Stored at: `<vault>/.obsidian/plugins/omnifocus-bridge/cache.json`

```json
{
  "syncedAt": "2025-03-15T10:30:00Z",
  "projects": [...],
  "inboxTasks": [...],
  "tags": [...]
}
```

Phase 1 uses it for: status bar timestamp, knowing last sync state.
Phase 3 uses it for: diff-based incremental sync.

---

## ID Mapper

Stored at: `<vault>/.obsidian/plugins/omnifocus-bridge/id-map.json`

```json
{
  "tasks": {
    "ofTaskId123": "OmniFocus/Website Redesign.md"
  },
  "projects": {
    "ofProjectId789": "OmniFocus/Website Redesign.md"
  }
}
```

Phase 1 uses it for: written during render (preparation for Phase 2).
Phase 2 uses it for: mapping checkbox toggles back to OF task IDs.

---

## Markdown Rendering

### Project File (`OmniFocus/<ProjectName>.md`)

```markdown
---
omnifocus-project-id: "pRoJeCt123"
omnifocus-status: "active"
omnifocus-last-sync: "2025-03-15T10:30:00Z"
---

# Website Redesign

- [ ] Wireframes erstellen 📅 2025-03-18 🏷️ #of/Design <!-- of:task123 -->
- [ ] Content-Audit durchführen 🏷️ #of/Content <!-- of:task456 -->
- [x] Kickoff-Meeting ✅ 2025-03-10 <!-- of:task789 -->
```

### Inbox File (`OmniFocus/Inbox.md`)

```markdown
---
omnifocus-last-sync: "2025-03-15T10:30:00Z"
---

# Inbox

- [ ] Einkaufsliste erstellen 🏷️ #of/Privat <!-- of:taskABC -->
```

### Rendering Rules

- Active tasks first, completed tasks at bottom
- Within active: flagged first, then sorted by due date (earliest first), then alphabetical
- Emoji metadata: 📅 due date, 🏷️ tags, ⏱️ estimate, 🚩 flagged, ✅ completion date
- Tags rendered as `#<prefix>/<tag-name>` (prefix from settings)
- Task IDs as HTML comments `<!-- of:<id> -->` (invisible in reading mode)
- Frontmatter includes project metadata for Dataview queries

---

## Settings Tab

Fields:
- **Sync Folder**: text input, default `OmniFocus`
- **Tag Prefix**: text input, default `of`
- **Show Due Date**: toggle, default on
- **Show Tags**: toggle, default on
- **Show Estimate**: toggle, default on
- **Show OF Link**: toggle, default off
- **Test Connection**: button -> runs version check, shows result in Notice
- **Sync Now**: button -> triggers full sync

---

## Status Bar

Right side of Obsidian status bar:
- `OF: synced just now`
- `OF: synced 5m ago`
- `OF: syncing...`
- `OF: error` (red, with tooltip showing error message)

Click on status bar item -> triggers sync.

---

## Commands

| Command | ID | Action |
|---|---|---|
| OmniFocus: Sync Now | `omnifocus-sync-now` | Full one-way sync |
| OmniFocus: Open Sync Folder | `omnifocus-open-folder` | Reveals sync folder in file explorer |

---

## Platform Handling

- Phase 1 only supports macOS Desktop
- On plugin load: check `process.platform === 'darwin'`
- If not macOS: show Notice "OmniFocus Bridge requires macOS Desktop", disable sync
- Mobile: Obsidian Mobile does not have `child_process`, plugin gracefully does nothing

---

## Research References

Patterns adopted from reference implementations:
- **omnifocus-mcp**: Temp file execution pattern, `safe()` defensive property access, 90s timeout, structured TypeScript types
- **omni-obsidious**: `evaluateJavascript()` nested JXA pattern, `content.rootNode.apply()` for perspectives, deep links, incremental file updates, task completion flow
- **obsidian-omnifocus**: Obsidian plugin scaffold (esbuild, manifest.json, Plugin class), command registration, Notice for feedback, Jest test mocking patterns
