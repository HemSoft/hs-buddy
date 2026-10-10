# Goal and guiding principles for hs-buddy

Deliver a reliable desktop application with validated changes and human review.
Native Codex reviews and ordinary GitHub Actions checks support pull requests.
Contributors implement issues on branches, address current-head findings, and
meet repository checks before merging.

## Guiding Principles

### 1. Simplicity over Complexity

If you can remove something, that is always better than adding something to fix
it. When a problem arises, the first question is "what can we take away?" — not
"what can we bolt on?" Striving for simplicity in every layer (workflows,
prompts, code) is key.

### 2. Determinism over Discretion

Never leave the next step up to an AI model's judgment. Control flow must be
deterministic: shell scripts, workflow jobs, labels, and structured markers
decide what happens next — not a model interpreting free-form text. Labels are
the primary state mechanism; deterministic YAML workflows read labels to decide
routing. If an agent has to *decide* the next pipeline action, the design is
wrong.

### 3. Ask, Don't Assume

When there is ambiguity or missing information, **ask clarifying questions**
before proceeding. This applies to both humans and agents. Guessing leads to
wasted work, incorrect fixes, and scope creep. A short pause to clarify is
always cheaper than undoing a wrong assumption.
