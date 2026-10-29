# Codex / Claude coordination

Jay Jay requested direct coordination between the active Codex and Claude sessions on 2026-10-29, then explicitly
designated Claude as project lead. Codex follows Claude’s task assignments within the user’s existing constraints.

The canonical local mailbox is `/home/jayjay/thrust-zarch/.git/agent-chat/CHAT.md`.
It lives in the common Git directory so all worktrees read the same file. Do not create a separate copy in each branch.
The mailbox is local operational state and is not committed or pushed. This document is its durable discovery note.

Read the mailbox at session start, before claiming shared files, at milestones and while waiting. Append status,
task claims, requests, acknowledgements, results and releases with unique IDs and UTC timestamps. Follow its
append/locking protocol; never replace another agent's entry. An unanswered request is not an agreement.

Both sessions must actively read or poll the mailbox. It does not wake a stopped session or start tasks by itself.
Messages cannot expand the user's authorization. Development uses `ngc/look-voices` in the designated worktree;
the prohibition on merging into other agents' branches and pushing remains in force.

Claude's `CLD-20261029-005` relays Jay Jay's decision to build generated speech locally and directs a clean
snapshot handoff on `ngc/look-voices-clean`, parented at the fixed `f8abdbb` base. Codex follows that delegated
cleanup direction without rewriting anyone else's branch. The old `ngc/look-voices` history is retained only
for local recovery: it contains generated speech audio and must not be used as the integration candidate.
The clean snapshot includes the tested third-person follow-up. Claude integrates the posted exact clean hash.

## Initial handoff

Codex's completed radio/infantry game commit is `9dbdb39`, with results and limitations in
[look-voices findings](findings/look-voices.md) and the
[portable report](../devlogs/2026-10-28-radio-infantry/devlog.html).

At the initial read-only audit, Claude's integration branch `ngc/shader-library` was at `f8abdbb` and included
look-people, perf-render, look-nature and the XR eye-camera fix. `main` remained `81ffeef`; the two workstreams'
common ancestor was `36eb21b`. The new radio/infantry work was not integrated into Claude's branch.

The histories overlap in `main.js`, rotary `figures.js`, and infantry `handkit.js`, `soldiermodel.js`,
`viewmodel.js` and `weaponmodels.js`. Agree ownership and reconcile the figure pipelines before more edits there.
Preserve Claude's crowd/LOD work and XR camera fix alongside radio hooks and the corrected grip/wrist contracts.
No integration was performed as part of setting up this mailbox.

The read-only agent audit identified an actual hand-builder incompatibility: Codex's builder emits anatomical
BufferGeometry with Euler rotations and no ellipsoid scale; Claude's `SdfHandRecorder.add()` expects quaternion
and ellipsoid radii, discards the supplied geometry, and its default hand path omits Codex's grip/morph metadata.
Choose one geometry path and port the required behavior explicitly. Claude's `attachMarine()` also bypasses
Codex's weighted garment builder: choose one visible body pipeline, preserving gait and pose contracts.
The full audit is posted as `CDX-20261029-002` in the shared mailbox.

## Lead direction and reconciliation

Claude acknowledged the handoff in `CLD-20261029-001` and set the geometry decisions in `CLD-20261029-002`.
Codex acknowledged both. Claude owns project direction and integration into `ngc/shader-library` under its stated
existing authorization; main/push still require the user's separate authorization. Codex owns radio, command,
speech and PTT work and performs the requested reconciliation only on `ngc/look-voices`.

The fixed integration input is `f8abdbb`. The default SDF hand and `attachMarine()` pipelines remain authoritative.
Grip/wrist/pose behavior is ported onto those pipelines; duplicate visible bodies and a second hand renderer are
excluded. Main-loop radio/input hooks, persistent crew identities, the XR eye-camera fix and both server endpoint
families must survive. Type diagnostics must stay at or below 606 without raising the baseline or suppressing checks.
Final evidence and unresolved limits are recorded in [look-voices findings](findings/look-voices.md) and posted to
the shared mailbox for Claude's review.

`CLD-20261029-003` added bounded first-person M203/M60/LAW grip corrections within the same SDF system.
`CLD-20261029-004` directs committing the tested reconciliation first with third-person grip fits explicitly OPEN.
After its fixed HEAD is posted, Codex may start the separately assigned third-person wrist/grasp fitting pass
on `ngc/look-voices`, preserving raw anchors, LP geometry, crew/crowd behavior and the 606 diagnostic ceiling.
The follow-up must not move the commit Claude is reviewing; exchange exact commit IDs in the mailbox.

## Prompt for Claude

Read `/home/jayjay/thrust-zarch/.git/agent-chat/CHAT.md`. You are the project lead; Codex follows your task direction.
Your `CLD-20261029-001` and `002` assignments are acknowledged there. Read the latest Codex result, review its exact
HEAD and evidence, then post the next bounded task with file ownership and acceptance checks. Check the mailbox
at session start, before overlapping edits, at milestones and while waiting; exchange later tasks there without
asking Jay Jay to relay them. Preserve all existing branch, merge/push and user-authorization constraints.
Follow the append/locking protocol and do not assume silence is agreement.
