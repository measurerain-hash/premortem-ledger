import assert from "node:assert/strict";
import test from "node:test";
import { applyVerdict, initialState, normalize, parseJson } from "./ledger.mjs";

const good = {
    title: "Onboarding in three weeks",
    framing: "The premortem assumes a two-person team and no dedicated QA.",
    story:
        "Three weeks after launch the onboarding flow was live but nobody finished it. The auth service accepted the new tokens, yet every returning user was asked to sign in again because the session cookie was scoped to the old path. The team had tested the happy path on a fresh browser. The first external user hit it on day one and reported it as a login loop, which took two days to reproduce because nobody could see the cookie scope in the logs.",
    assumptions: [
        {
            id: "a1",
            statement: "The existing auth service can issue tokens scoped to the new route without changes.",
            early_signal: "A returning user is asked to sign in again after visiting the new flow.",
            cheap_test: "Run the flow in a browser that already has a session cookie and watch for a second login.",
            risk: "high",
        },
        {
            id: "a2",
            statement: "Two people can cover build, review and QA in three weeks.",
            early_signal: "Two consecutive sprints where review waits more than a day.",
            cheap_test: "Count review wait time for the last five pull requests.",
            risk: "high",
        },
        {
            id: "a3",
            statement: "The session cookie is scoped to a path that survives the new route.",
            early_signal: "Cookie scope in devtools differs between the old and new route.",
            cheap_test: "Compare document.cookie on both routes in devtools.",
            risk: "medium",
        },
        {
            id: "a4",
            statement: "The team agrees on what 'finished' means before the first demo.",
            early_signal: "The demo ends with two different definitions of done.",
            cheap_test: "Ask each person to write the acceptance sentence before the demo.",
            risk: "low",
        },
    ],
};

test("accepts a well-formed premortem", () => {
    const l = normalize(good);
    assert.equal(l.assumptions.length, 4);
    assert.equal(l.assumptions[0].risk, "high");
});

test("strips a fence and surrounding prose", () => {
    const raw = "Sure:\n```json\n" + JSON.stringify(good) + "\n```\ndone";
    assert.equal(normalize(parseJson(raw)).title, "Onboarding in three weeks");
});

test("reports a truncated reply clearly", () => {
    assert.throws(() => parseJson('{"assumptions":[{"id":"a1"'), /cut off/);
});

test("rejects a story too short to carry a failure", () => {
    assert.throws(() => normalize({ ...good, story: "It failed." }), /too short/);
});

test("rejects an assumption without a cheap test", () => {
    const bad = structuredClone(good);
    bad.assumptions[0].cheap_test = "";
    assert.throws(() => normalize(bad), /no cheap test/);
});

test("rejects a premortem with no high-risk assumption", () => {
    const bad = structuredClone(good);
    bad.assumptions.forEach((a) => { a.risk = "low"; });
    assert.throws(() => normalize(bad), /no high-risk/);
});

test("rejects the same assumption twice", () => {
    const bad = structuredClone(good);
    bad.assumptions[1].statement = bad.assumptions[0].statement;
    assert.throws(() => normalize(bad), /repeated the same assumption/);
});

test("rejects tests that only observe instead of acting", () => {
    const bad = structuredClone(good);
    bad.assumptions.forEach((a) => { a.cheap_test = "Keep an eye on it weekly."; });
    assert.throws(() => normalize(bad), /only observe/);
});

test("accepts honest action verbs that a whitelist would have missed", () => {
    const ok = structuredClone(good);
    ok.assumptions[0].cheap_test = "Poll 20 existing users about willingness to pay this week.";
    ok.assumptions[1].cheap_test = "Hold a 30-minute kickoff and publish one owners doc.";
    assert.equal(normalize(ok).assumptions.length, 4);
});

test("an unknown risk falls back to medium, not high", () => {
    const l = normalize({ ...good, assumptions: good.assumptions.map((a, i) => i === 0 ? { ...a, risk: "catastrophic" } : a) });
    assert.equal(l.assumptions[0].risk, "medium");
});

test("killing an assumption is permanent", () => {
    const l = normalize(good);
    let s = initialState(l);
    s = applyVerdict(s, "a1", "killed");
    assert.equal(s.dead.has("a1"), true);
    // A later "tested" must not revive it.
    s = applyVerdict(s, "a1", "tested");
    assert.equal(s.dead.has("a1"), true);
    assert.equal(s.survived.includes("a1"), false);
});

test("marking tested does not kill", () => {
    const l = normalize(good);
    let s = initialState(l);
    s = applyVerdict(s, "a2", "tested");
    assert.equal(s.dead.has("a2"), false);
    assert.equal(s.tested.has("a2"), true);
    assert.equal(s.killed.length, 0);
});

test("clamps runaway text", () => {
    const long = structuredClone(good);
    long.assumptions[0].statement = "x".repeat(1000);
    long.story = "y".repeat(9000);
    const l = normalize(long);
    assert.equal(l.assumptions[0].statement.length, 300);
    assert.equal(l.story.length, 2000);
});
