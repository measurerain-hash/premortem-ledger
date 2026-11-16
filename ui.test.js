import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const LEDGER = {
    title: "Onboarding in three weeks",
    framing: "Assumes a two-person team and no QA.",
    story:
        "Three weeks later the flow was live and nobody finished it. The auth service accepted new tokens, but every returning user was asked to sign in again because the cookie was scoped to the old path. The team only tested on a fresh browser, so the first external user found it on day one and reported a login loop.",
    assumptions: [
        { id: "a1", statement: "The auth service needs no changes.", early_signal: "Returning users sign in twice.", cheap_test: "Run the flow with an existing cookie.", risk: "high" },
        { id: "a2", statement: "Two people cover build and QA.", early_signal: "Review waits over a day twice.", cheap_test: "Count review wait on the last five PRs.", risk: "high" },
        { id: "a3", statement: "The cookie survives the new route.", early_signal: "Scope differs between routes.", cheap_test: "Compare document.cookie on both routes.", risk: "medium" },
        { id: "a4", statement: "Everyone agrees what done means.", early_signal: "Two definitions at the demo.", cheap_test: "Ask each person to write the acceptance line.", risk: "low" },
    ],
};

function boot() {
    const dom = new JSDOM(readFileSync("index.html", "utf8"), {
        runScripts: "outside-only",
        url: "https://premortem.test/",
        pretendToBeVisual: true,
    });
    const { window } = dom;
    window.eval(readFileSync("ledger.js", "utf8"));
    window.PolliClient = { chatCompletion: async () => JSON.stringify(LEDGER) };
    window.sessionStorage.setItem("polli_byop_key", "sk_test");
    window.eval(readFileSync("app.js", "utf8"));
    // run() requires a sentence-length plan; every test uses the same one.
    window.document.getElementById("plan").value =
        "Ship onboarding in three weeks";
    return window;
}
const tick = () => new Promise((r) => setTimeout(r, 25));

test("renders the story and one card per assumption", async () => {
    const w = boot();
    w.document.getElementById("plan").value = "Ship onboarding in three weeks";
    w.document.getElementById("go").click();
    await tick();
    assert.equal(w.document.querySelectorAll(".assump").length, 4);
    assert.match(w.document.getElementById("story").textContent, /How it failed/);
    assert.equal(w.document.getElementById("out").style.display, "block");
});

test("killing an assumption marks it and updates the score", async () => {
    const w = boot();
    w.document.getElementById("go").click();
    await tick();

    const card = w.document.querySelector('.assump[data-id="a1"]');
    const kill = [...card.querySelectorAll("button")].find((b) => b.textContent === "Kill it");
    kill.click();
    await tick();

    assert.match(card.className, /dead/);
    assert.match(card.querySelector(".tag").textContent, /killed/);
    assert.match(w.document.getElementById("score").textContent, /Killed: 1/);
});

test("a killed assumption cannot be revived as tested", async () => {
    const w = boot();
    w.document.getElementById("go").click();
    await tick();

    const card = w.document.querySelector('.assump[data-id="a1"]');
    const buttons = [...card.querySelectorAll("button")];
    buttons.find((b) => b.textContent === "Kill it").click();
    await tick();
    buttons.find((b) => b.textContent === "Mark tested").click();
    await tick();

    assert.match(card.querySelector(".tag").textContent, /killed/);
});

test("reset clears a kill", async () => {
    const w = boot();
    w.document.getElementById("go").click();
    await tick();
    const card = w.document.querySelector('.assump[data-id="a1"]');
    const buttons = () => [...card.querySelectorAll("button")];
    buttons().find((b) => b.textContent === "Kill it").click();
    await tick();
    buttons().find((b) => b.textContent === "Reset").click();
    await tick();
    assert.doesNotMatch(card.className, /dead/);
    assert.match(w.document.getElementById("score").textContent, /Killed: 0/);
});

test("shows a readable error for a non-JSON reply", async () => {
    const w = boot();
    w.PolliClient.chatCompletion = async () => "no json here";
    w.document.getElementById("go").click();
    await tick();
    assert.match(w.document.getElementById("status").textContent, /did not return JSON/);
});

test("blocks a plan that is too short", async () => {
    const w = boot();
    w.document.getElementById("plan").value = "ship it";
    w.document.getElementById("go").click();
    await tick();
    assert.match(w.document.getElementById("status").textContent, /at least a sentence/);
});
