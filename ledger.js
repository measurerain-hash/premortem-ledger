// Parsing and state for the premortem ledger, kept free of the DOM so it can be
// tested in Node. app.js owns rendering.

const RISKS = new Set(["high", "medium", "low"]);

/** Pull the first balanced JSON object out of a reply that may be fenced. */
function parseJson(raw) {
    let text = String(raw).trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const start = text.indexOf("{");
    if (start === -1) throw new Error("The model did not return JSON.");
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return JSON.parse(text.slice(start, i + 1));
        }
    }
    throw new Error("The model's JSON was cut off — try again.");
}

/**
 * Validate a premortem before anything renders. An assumption ledger that
 * repeats the plan back, or whose "test" is just "monitor it", is worthless,
 * so the checks target those failure modes rather than schema shape alone.
 */
function normalize(data) {
    const story = String(data?.story || "").trim();
    if (story.length < 60) {
        throw new Error("The failure story is too short to be useful.");
    }

    const raw = Array.isArray(data?.assumptions) ? data.assumptions : [];
    if (raw.length < 3 || raw.length > 6) {
        throw new Error("The model returned the wrong number of assumptions.");
    }

    const assumptions = raw.map((a, i) => {
        const statement = String(a?.statement || "").trim().slice(0, 300);
        const signal = String(a?.early_signal || "").trim().slice(0, 240);
        const test = String(a?.cheap_test || "").trim().slice(0, 240);
        const risk = String(a?.risk || "").toLowerCase();
        if (!statement) throw new Error(`Assumption ${i + 1} has no statement.`);
        if (!signal) throw new Error(`Assumption ${i + 1} has no early signal.`);
        if (!test) throw new Error(`Assumption ${i + 1} has no cheap test.`);
        return {
            id: String(a?.id || `a${i + 1}`).trim(),
            statement,
            early_signal: signal,
            cheap_test: test,
            risk: RISKS.has(risk) ? risk : "medium",
        };
    });

    const ids = assumptions.map((a) => a.id);
    if (new Set(ids).size !== ids.length) {
        throw new Error("The model returned duplicate assumption ids.");
    }
    if (new Set(assumptions.map((a) => a.statement.toLowerCase())).size !== assumptions.length) {
        throw new Error("The model repeated the same assumption twice.");
    }

    // A "test" that only observes is not a test. Reject passive monitoring by
    // what it never names: an action verb. Whitelisting a few verbs rejected
    // honest tests like "poll 20 users" and "hold a kickoff", so the check is
    // inverted. This still catches "keep an eye on it" and "monitor closely".
    const PASSIVE = /^(keep an eye|monitor|watch|track|observe|be aware|pay attention|stay alert)\b/i;
    const assumptions_with_actions = assumptions.filter(
        (a) => !PASSIVE.test(a.cheap_test.trim()),
    );
    if (assumptions_with_actions.length < Math.ceil(assumptions.length / 2)) {
        throw new Error("Most cheap tests only observe; at least half must be actions.");
    }

    if (!assumptions.some((a) => a.risk === "high")) {
        throw new Error("A premortem with no high-risk assumption is not a premortem.");
    }

    return {
        title: String(data?.title || "Premortem").slice(0, 90),
        framing: String(data?.framing || "").slice(0, 300),
        story: story.slice(0, 2000),
        assumptions,
    };
}

/** Cumulative ledger state: a killed assumption cannot come back. */
function applyVerdict(state, id, verdict) {
    const dead = new Set(state.dead);
    const tested = new Set(state.tested);
    if (verdict === "killed") {
        dead.add(id);
        tested.delete(id);
    } else if (verdict === "tested") {
        if (dead.has(id)) return state; // killing is permanent
        tested.add(id);
    }
    return {
        allIds: state.allIds,
        dead,
        tested,
        killed: state.allIds.filter((x) => dead.has(x)),
        survived: state.allIds.filter((x) => !dead.has(x)),
    };
}

function initialState(ledger) {
    return {
        allIds: ledger.assumptions.map((a) => a.id),
        dead: new Set(),
        tested: new Set(),
        killed: [],
        survived: ledger.assumptions.map((a) => a.id),
    };
}

if (typeof window !== "undefined") {
    window.Ledger = { parseJson, normalize, applyVerdict, initialState };
}
