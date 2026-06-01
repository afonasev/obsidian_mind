---
name: "OPSX: Apply"
description: Implement tasks from an OpenSpec change (Experimental)
category: Workflow
tags: [workflow, artifacts, experimental]
---

Implement tasks from an OpenSpec change by grouping related tasks into waves and dispatching parallel subagents for independent groups.

**Input**: Optionally specify a change name (e.g., `/opsx:apply add-auth`). If omitted, check if it can be inferred from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run `openspec list --json` to get available changes and use the **AskUserQuestion tool** to let the user select

   Always announce: "Using change: <name>" and how to override (e.g., `/opsx:apply <other>`).

2. **Check status to understand the schema**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to understand:
   - `schemaName`: the workflow being used (e.g., "spec-driven")
   - Which artifact contains the tasks (typically "tasks" for spec-driven)

3. **Get apply instructions**
   ```bash
   openspec instructions apply --change "<name>" --json
   ```

   Returns `contextFiles`, progress, task list, dynamic instruction. Handle states:
   - `blocked` (missing artifacts) → suggest `/opsx:continue`
   - `all_done` → congratulate, suggest archive
   - otherwise → proceed

4. **Read context files**

   Read every file path listed under `contextFiles`. The main agent must hold the full picture: proposal, design, specs, and tasks.

5. **Plan execution waves** (the planning step that enables parallelism)

   Build a wave plan from the remaining tasks in `tasks.md`:

   a. **Identify groups.** Each top-level section (`## N. <title>`) is one *group*. Skip groups whose tasks are all `- [x]`.

   b. **Estimate files touched per group.** For each group, scan its task lines and list the concrete files mentioned (e.g., `package.json`, `src/domain/*`, `src-tauri/tauri.conf.json`). When a group only writes new files under a directory, note the directory; when it edits shared manifests (`package.json`, `bun.lock`, `Makefile`, `tsconfig.json`, `README.md`, `CLAUDE.md`), call them out explicitly.

   c. **Identify cross-group dependencies.** A group depends on another when:
   - Its tasks consume artifacts the other produces (e.g., store consumes domain types).
   - Its tasks edit a file the other creates.
   - The proposal/design says so.

   d. **Pack into waves.** A wave is a set of groups that can run in parallel. Rules:
   - All dependencies of every group in a wave must already be completed in a prior wave.
   - **No two groups in the same wave may write to the same file.** Shared manifests (`package.json`, `bun.lock`, lockfiles, configs) force groups onto separate waves.
   - **Max 5 groups per wave.** If more are eligible, pick the ones that unblock the most downstream work and defer the rest to the next wave.

   e. **Decide whether parallelism is worth it.** Spawning a subagent has real cost — it re-reads `CLAUDE.md`, `.claude/rules/*`, proposal/design/specs, and the files it touches. That overhead only pays off when ≥2 groups run truly in parallel and each group is non-trivial. Apply these gates:
   - **Gate A — per wave.** A wave uses subagents only if it has **≥2 groups**. Waves with a single group are executed inline by the main agent.
   - **Gate B — whole plan.** If, after packing, **no wave has ≥2 groups**, skip the subagent machinery entirely and implement all groups sequentially inline (old behaviour). Announce: "No parallel waves found — running sequentially."

   f. **Announce the plan** before executing:
   ```
   ## Execution Plan
   Wave 1 (parallel × N): <group titles>
   Wave 2 (parallel × M): <group titles>
   Wave 3 (sequential):   <group title>  — shares package.json with Wave 2
   ...
   ```

6. **Execute waves**

   For each wave, in order:

   - If the wave has **1 group** (or Gate B short-circuited the whole plan to sequential), implement it **inline** in the main agent — no Agent tool call. Read whatever extra files you need, do the tasks, flip checkboxes. Skip to step 6c verification.
   - If the wave has **≥2 groups**, dispatch subagents in parallel (step 6a).

   a. **Dispatch subagents in parallel.** In a single message, call the Agent tool once per group in the wave (up to 5). Use `subagent_type: "general-purpose"`. Each prompt must be self-contained:

   ```
   You are implementing one section of an OpenSpec change.

   Change directory: openspec/changes/<change-name>/
   Your section in tasks.md: "## <N>. <title>"
   Tasks to complete (verbatim from tasks.md):
     - [ ] <N>.1 ...
     - [ ] <N>.2 ...

   Context you must read first:
     - openspec/changes/<change-name>/proposal.md
     - openspec/changes/<change-name>/design.md (if present)
     - <any spec files relevant to this section>
     - <any source files your tasks edit>

   Rules:
     - Do ONLY the tasks listed above. Do NOT touch tasks from other sections.
     - Follow project conventions in CLAUDE.md and .claude/rules/*.
     - Keep changes minimal and scoped. No drive-by refactors.
     - After completing each task, flip its checkbox in tasks.md: `- [ ]` → `- [x]`.
     - Do NOT commit. Do NOT push.
     - If a task is ambiguous or you hit a blocker, STOP. Do not guess. Return a summary that starts with "BLOCKED: <reason>" and lists which tasks remain `- [ ]`.

   Return a short summary: which tasks you completed, which files you changed, and any blockers.
   ```

   b. **After the wave finishes** (whether inline or via subagents), run a verification pass from the main agent:
   - `git status` and `git diff` to see what actually changed.
   - Re-read `tasks.md` and confirm that every checkbox claimed to be flipped is actually `- [x]`.
   - Cross-check: each new `- [x]` should correspond to a real change in the diff (or to a "no-op verified by inspection" note).
   - If a subagent returned `BLOCKED: ...`, surface that to the user immediately and pause — do not start the next wave.
   - If the diff shows unexpected files modified (outside the wave's groups), surface it and pause.

   c. **If verification passes**, proceed to the next wave. Briefly report wave completion to the user (one line per group).

7. **Single-task or trivial changes**

   If the remaining work is fewer than ~3 tasks or a single section, skip planning entirely and implement inline. The planning overhead isn't worth it.

8. **On completion or pause, show status**
   - Tasks completed this session
   - Overall progress: "N/M tasks complete"
   - If all done: suggest `/opsx:archive`
   - If paused: explain why and wait

**Output During Implementation**

```
## Implementing: <change-name> (schema: <schema-name>)

### Execution Plan
Wave 1 (parallel × 3): §10 Domain, §11 Persistence, §8 CI
Wave 2 (inline):        §12 Store          — solo wave, depends on §10, §11
Wave 3 (inline):        §3 Biome           — shares package.json
Wave 4 (inline):        §4 Vitest          — shares package.json
...

### Wave 1 — 3 subagents in parallel
✓ §10 Domain — 4 tasks, files: src/domain/*
✓ §11 Persistence — 6 tasks, files: src/persistence/*
✓ §8 CI — 5 tasks, files: .github/workflows/ci.yml
Verifying diff... ok. Tasks marked: 15/15 expected.

### Wave 2 — inline
...
```

**Output On Completion**

```
## Implementation Complete

**Change:** <change-name>
**Progress:** N/N tasks complete ✓

### Waves executed
- Wave 1 (×3): §10, §11, §8
- Wave 2 (×1): §12
- Wave 3 (×1): §3
...

All tasks complete. You can archive this change with `/opsx:archive`.
```

**Output On Pause**

```
## Implementation Paused

**Change:** <change-name>
**Progress:** N/M tasks complete
**Stopped after:** Wave <K>

### Blocker
<subagent's BLOCKED message, or main agent's verification failure>

### Affected tasks (still `- [ ]`)
- <N>.<i> ...

What would you like to do?
```

**Guardrails**
- Always read all `contextFiles` from the apply instructions output before planning.
- Planning is mandatory unless the remaining work is trivial (rule 7).
- **Subagents only when a wave has ≥2 groups.** Solo waves run inline. If no wave has ≥2 groups, the whole apply runs inline.
- Subagent prompts must be self-contained — they do not see this conversation.
- Never put two groups that write the same file into the same wave.
- Never exceed 5 parallel subagents in one wave.
- After every wave (inline or parallel): `git diff` + tasks.md cross-check. Do not skip verification.
- A subagent's summary describes what it *intended* to do; the diff is the truth.
- If a subagent returns `BLOCKED`, stop the whole apply — do not start the next wave.
- Subagents do not commit, push, or run `make check` / `bun run check`. Those are the user's call.
- If implementation reveals a design issue, pause and suggest artifact updates — work fluidly.

**Fluid Workflow Integration**

This skill supports the "actions on a change" model:

- **Can be invoked anytime**: before all artifacts are done (if tasks exist), after partial implementation, interleaved with other actions.
- **Allows artifact updates**: if implementation reveals design issues, suggest updating artifacts.
