// Real API run. Skipped unless POLLI_KEY is set.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalize, parseJson } from "./ledger.mjs";

const KEY = process.env.POLLI_KEY || "";
const app = readFileSync("app.js", "utf8");
const match = app.match(/const SYSTEM = \[([\s\S]*?)\]\.join\("\\n"\);/);
const SYSTEM = Function(`return [${match[1]}].join("\\n")`)();

const PLANS = [
    ["Ship onboarding in 3 weeks", "team of 2, no QA, existing auth service, no migration", "2 weeks"],
    ["Launch a paid tier next month", "one billing engineer, Stripe already integrated, no pricing research", "3 months"],
    ["Migrate the database in one weekend", "12k rows, no downtime allowed, one person on call", "2 weeks"],
];

test("the prompt returns a usable ledger for every plan", { skip: !KEY, timeout: 400_000 }, async () => {
    for (const [plan, context, horizon] of PLANS) {
        const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
            body: JSON.stringify({
                model: "openai/gpt-5-nano",
                messages: [
                    { role: "system", content: SYSTEM },
                    { role: "user", content: `Plan: ${plan}\nTime horizon: ${horizon}.\nConstraints: ${context}` },
                ],
                max_tokens: 12000,
                reasoning_effort: "low",
            }),
        });
        if (res.status !== 200) assert.fail(`${plan}: HTTP ${res.status} ${await res.text()}`);
        const data = await res.json();
        const l = normalize(parseJson(data.choices[0].message.content));
        assert.equal(l.assumptions.length, 4, `${plan}: assumptions`);
        assert.ok(l.assumptions.some((a) => a.risk === "high"), `${plan}: no high risk`);
        console.log(`  ${plan}: "${l.title}" (${l.assumptions.filter((a) => a.risk === "high").length} high)`);
    }
});
