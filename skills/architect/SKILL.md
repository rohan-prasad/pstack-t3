---
name: architect
description: "Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock in the wrong shape."
disable-model-invocation: true
---

# Architect

In T3 Code, read [the T3 Code adapter](../pstack-t3/SKILL.md) in full before you follow this skill, once per session and again after a compaction. It maps the Cursor names in pstack to T3 Code. A delegated child reads [the child adapter](../pstack-t3/child.md) in its place.

Before writing code, trace every system the change touches, then sketch two different shapes for it (types, signatures, module boundaries) and pick the one where each piece of state has one owner, each task has one way to do it, and callers need to know least. Redesign instead of patching if workarounds repeat.

For a large or contested design, run the **arena** skill instead of sketching alone.
