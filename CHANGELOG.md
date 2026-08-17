# Changelog

All notable changes to the Bad Case Rubrics Review Viewer.

## [2.0.0] — 2026-08-17

Breaking on three axes at once: input format, display, and taxonomy. Stored v1 review data is
unreadable and is not migrated.

### Spec

- **`specifications.md` rewritten**, not patched — the v1 document described a 37-column CSV world
  that no longer exists. Settled in a grilling session, 2026-08-17.

### Input

- **CSV → JSONL** for case data, specifically to escape Excel's 32,767-character cell limit.
- **Removed** every workaround for that limit: chunked columns (`_1`…`_4`), the join-base-then-`_N`
  rule, and terminal-chunk truncation detection.
- **Agent A / Agent B move to a separate optional CSV**, joined on `enc_chat_id`.
- **Case key is now `enc_chat_id`**; `case id` comes from the CSV and is display-only.
- One shared drop zone routing by extension; JSONL required, CSV optional and hot-swappable.
- Malformed JSONL lines become selectable placeholder cases rather than being dropped.

### Translations

- **`TRANSLATION_MAP` deleted.** Translations are now six `_translated` whole-object siblings at the
  top level of the same JSONL object, resolved by one generic rule.
- `messages_translated[]` matches by `message_id`; rubrics and judge reasons by array position.

### Display

- **New conversation renderer** replacing the `chat_history` and `post_user_prompt` panels. Turns
  come from `groupBy(message_id)` — exact, replacing v1's `TURN_PATTERN` regex over prose, which is
  deleted. Markup and class names follow `context.template.html`.
- `system` messages render as a collapsed preamble, or inline full-width when mid-conversation.
- Per-message 12-line clamp, manual `↓ turn N` jump, panel collapsed by default. No auto-scroll.
- **`user_prompt` and `model_response` still render as their own panels** and are compared against
  the problem turn, with a `differs from turn N` note on mismatch.
- **New Badcase Analysis section** below the Final box: `step1_precision_screening`
  (`root_cause_turn_index`, `analysis`) then `badcase_judge_reasons`.
- **`badcase_judge_reasons` grouped by `source`** (the judge model), deliberately *not* anchored to
  turns — two models write into one array.
- **Rubrics table grows to 9 columns**: `dimension`, `bad_response_meets` and `source` promoted out
  of the row expander, `importance` added. `importance` and `source` hidden behind one
  `⊞ extra columns` toggle. **Row expander removed.** Stacking threshold 1000px → 1280px.
- **~100 pipeline fields dropped entirely** — no JSON tree, no "other fields" section.

### Removed

- **All of `step4_rubric_alignment`** — the `aligned` / `severity` chips and the
  `misaligned_indices` row tint. Nothing replaces the alignment signal.
- `step3` header chips (`decision`, `failure_type`, `target_capability`).
- `current_task_summary`.
- Tool-trace and hidden-think cards from the template: the data contains neither.
- `is-upstream`, `judge-label`, `is-anchor-turn` and `is-recovered` turn markers.

### Taxonomy

- **`ERROR_CODES` 14 → 18.** `Unreasonable Rubric Weightage` P1→P0; `Homogenous / Undifferentiated
  Weightage` P2→P1; added `P0 Others`, `P1 Others`, `P2 Others`, `P1 Rubrics Redundancy (Overly
  Atomized)`; removed `P2 Weak Pitfall ("Others")`, now covered by `P2 Others`.
- **The case-level checkbox becomes a 5-code multi-select** — `Prompt: Time Sensitive`,
  `Prompt: Vague`, `Prompt/History: Contains Image`, `Prompt/History: Missing Context`, and
  `P0 Missing Language Requirement`, which is now in both lists and selectable in all three scopes.
- **Output sort rule:** the four `Prompt:` codes lead, then the eighteen in canonical order. **Scope
  no longer affects sort position.** Entry labels within a group are `CASE:` → `ALL:` → `R<n>:`.
- Output format, grouping, dedup and copy confirmations otherwise unchanged.

### Persistence

- **Namespace `brv:` → `brv2:`**, keyed by `enc_chat_id`. v1 entries are not read, not migrated, and
  not deleted; a `clear v1 data` action reclaims the space.
- `langReq: { on, note }` replaced by a `case: { codes, issues }` scope with the same shape as
  `set` and each member of `rows`.

### Unchanged

Adjudication mechanics, the output format, copy machinery, theming, keyboard shortcuts, the
vendored dependency set, and the offline / no-build-step delivery rules.

### Implementation

Built 2026-08-17. `index.html` rewritten against the v2 spec; `styles/app.css` rewritten;
`styles/tokens.css` and `vendor/` untouched.

- **Ingest** — `buildCase()` per JSONL line; one shared drop zone routing by extension, plus two
  always-visible file inputs. The CSV is hot-swappable in either order. Malformed lines, missing
  `enc_chat_id`, unresolvable `problem_turn_index`, absent `message_id`, `messages_translated`
  length mismatches, duplicate `enc_chat_id` and unmatched CSV rows all land in the load report.
- **Conversation** — `buildConversation()` groups by `message_id`; leading `system` messages become
  the collapsed preamble, later ones inline full-width cards. Template class names used verbatim.
- **Rubrics table** — nine columns behind one `⊞ extra columns` toggle; widths stored per column
  name and normalized to 100% over the visible subset, so hiding a column never rewrites a width.
- **Three scopes** — `case` / `set` / row index share one picker, one `{codes, issues}` shape and
  one re-render path; the `case` scope alone draws from `CASE_LEVEL_CODES`.
- **Removed with their features**: `TRANSLATION_MAP`, `TURN_PATTERN`, `buildChunkIndex`,
  `joinChunks`, `detectTruncation`, `OTHER_FIELDS` and the row expander.

**Decisions taken where the spec was silent or underspecified**

- **`messages_translated` is matched by `message_id` + `role` + ordinal within that pair**, not by
  `message_id` alone. The spec states a turn's user and assistant messages *share* the id, so the id
  alone cannot address a message; ordinal covers several assistant messages in one turn. Positional
  match is the fallback, then the original with a per-message badge.
- **`differs from turn N` compares in the panel's current language.** Comparing an English panel
  against the original thread reported a difference on every translated case.
- **File meta counts CSV rows, not cases** — `N matched, M unmatched` sums to the row total, which it
  does not if two cases share a duplicate `enc_chat_id`.
- **The rubrics table keeps a `中文 | ENG` toggle.** The spec's layout sketch omits it, but
  `step3_rubrics_generation_translated` exists and is matched by array position, so the requirement
  text is translatable and needs a control.
- **Duplicate `enc_chat_id` cases share review state**, since state is keyed by `enc_chat_id` by
  design. Both cases are kept and the load report says so explicitly.
- **Default widths for the two hidden columns** (`importance` 8, `source` 10) were chosen here; the
  spec fixes only the seven visible ones.

**Verification**

- `verify-output.js` rewritten for v2: 28 assertions over the taxonomy, the `Prompt:`-first sort
  rule, three-scope dedup, per-code grouping, the group↔code positional audit, and the copy
  confirmation wording. All green.
- Ingest exercised headlessly (weight bands, turn grouping, system placement, half turns, missing
  ids, parse failures, the translation resolver). All green.
- End-to-end smoke test in headless Chrome against a synthetic five-line JSONL and a three-row CSV:
  empty → loaded → error → navigation → review state surviving a case round trip. No console errors.
- **Not verified against a real export.** The `secret/` sample directory is blocked by a local
  permission rule, so every item in *Open items* remains open.
