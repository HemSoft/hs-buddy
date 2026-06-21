# lean-ctx Usage

This repository prefers lean-ctx MCP tools for substantive agent sessions.

## Session Start

- Load continuity with `ctx_session(action: "load")` or inspect status with
  `ctx_session(action: "status")`.
- Recall relevant repository knowledge with
  `ctx_knowledge(action: "recall", query: "<task/repo/topic>")`.
- Use `ctx_overview(path: "<repo-root>", task: "<task>")` for non-trivial
  repository work.

## Tool Mapping

| Use this        | Instead of                    | Why                                |
| --------------- | ----------------------------- | ---------------------------------- |
| `ctx_read`      | `cat`, `view`, `Read`         | Cached reads and compression modes |
| `ctx_search`    | `grep`, `rg`, `Select-String` | Compact, token-efficient matches   |
| `ctx_shell`     | `bash`, `powershell`          | Pattern-compressed command output  |
| `ctx_tree`      | `ls`, `dir`, `find`, `glob`   | Compact directory maps             |
| `ctx_knowledge` | ad hoc notes                  | Persistent repository knowledge    |

## During Work

- Record resumable state with
  `ctx_session(action: "task" | "finding" | "decision", value: "...")`.
- Keep entries concise and tied to the current repository or worktree.
- If lean-ctx is unavailable or scoped too narrowly for a required file, use the
  narrowest direct tool fallback and record the limitation.

## Closeout

- Save meaningful continuity with `ctx_session(action: "save")`.
- Promote stable, verified repository facts with `ctx_knowledge(action:
"remember", category: "<category>", key: "<slug>", value: "...")`.
- Do not store secrets, transient command noise, or speculation.
