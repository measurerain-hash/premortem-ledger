# Premortem Ledger

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

Paste a plan. A Pollinations model writes **how it failed**, then extracts the assumptions that
killed it — each with an early signal and a cheap test you can run this week. You decide which
assumptions survive contact with evidence.

**Live:** https://premortem-ledger.pollinations.app

## Why a premortem, not a checklist

A risk checklist lists things that could go wrong. A premortem starts from the failure and works
backwards: the plan already failed, so the assumptions it rested on are now visible. That ordering
matters — people defend a plan when asked "what could go wrong" and explain it when told it is
already dead.

The ledger is the part that makes it actionable. Each assumption gets:

- **an early signal** — the first observable evidence it is false, something you can see or count;
- **a cheap test** — an action, this week, no budget approval;
- **a risk level** — high, medium, low.

Then you mark each one **tested** or **killed**. Killing is permanent: a falsified assumption cannot
be revived by later evidence, and the app enforces that rather than trusting you to remember.

## How it works

One chat completion per premortem, returning a single JSON object:

```json
{
  "title": "...",
  "framing": "...",
  "story": "it is three months later and the plan failed...",
  "assumptions": [
    { "id": "a1", "statement": "...", "early_signal": "...",
      "cheap_test": "...", "risk": "high" }
  ]
}
```

`ledger.js` validates the reply before anything renders, and the checks target the ways a premortem
goes useless rather than schema shape:

- fewer than 3 or more than 6 assumptions;
- a statement, signal or test that is missing;
- duplicate or repeated assumptions;
- a premortem with **no high-risk** assumption;
- more than half the "tests" only observe (`keep an eye on`, `monitor`, `watch`) instead of acting;
- a story too short to carry a real failure.

The passive-test check is a blocklist rather than a whitelist on purpose. A whitelist of action
verbs rejected honest tests like *"poll 20 users"* and *"hold a kickoff"*, which is worse than
letting one weak test through.

## Model choice, measured

`openai/gpt-5-nano` with `reasoning_effort: "low"` and a 12k cap. On the same prompt, a 6k cap and
default effort returned `output_token_limit_exceeded` for longer plans; `low` finishes all three
sample plans with no failures.

`prompt.test.js` runs three real plans against the real API when `POLLI_KEY` is set.

## Tests

```bash
npm test              # 13 unit tests on parsing, validation and ledger state
npm run test:ui       # 6 tests that render app.js in jsdom and click the real buttons
POLLI_KEY=... npm run test:prompt   # 3 real plans against the real API
```

## Bring Your Own Pollen (BYOP)

Visitors do not paste a secret. The page uses the official `<polli-connect>` widget:

1. Press **Connect** and approve a scoped key (`text` models, 5 Pollen, 7 days).
2. Each premortem is one chat completion billed to the visitor's own Pollen.
3. The grant is revocable from the Pollinations dashboard.

Reference: [BRING_YOUR_OWN_POLLEN.md](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md)

## What it is not

The failure story is generated on request by a language model. It is a hypothesis about how the plan
could fail, not a forecast. An assumption that survives has only survived the evidence you actually
have — the interface says so where the score is shown.

## Run locally

Static files, no build step:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```
