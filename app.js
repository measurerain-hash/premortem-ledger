(function () {
    const el = (id) => document.getElementById(id);
    const polli = window.PolliClient;
    const { parseJson, normalize, applyVerdict, initialState } = window.Ledger;

    function getKey() {
        const c = document.querySelector("polli-connect");
        // Consent-screen key only: visitors never paste a secret key by hand.
        return (c && c.apiKey) || "";
    }
    function setStatus(text, cls) {
        const s = el("status");
        s.textContent = text || "";
        s.className = cls || "";
    }

    const SYSTEM = [
        "You run a premortem. The plan has already failed; write the failure, then name the assumptions that caused it.",
        "",
        "Return ONE JSON object, no markdown fence, no commentary:",
        "{",
        '  "title": "short title, max 60 chars",',
        '  "framing": "one sentence naming what the premortem assumes about the plan",',
        '  "story": "4-7 sentences, past tense, concrete. It is 3 months later and the plan failed. Name what was believed, what was actually true, and the moment it became visible.",',
        '  "assumptions": [',
        '    {"id":"a1","statement":"the belief the plan rests on, one sentence",',
        '     "early_signal":"the first observable evidence it is false, specific and measurable",',
        '     "cheap_test":"an action the reader can take this week to check it, starting with a verb",',
        '     "risk":"high|medium|low"}',
        "  ]",
        "}",
        "",
        "Rules:",
        "- 4 assumptions. At least one must be high risk, and at least one must be about people or coordination rather than technology.",
        "- Each assumption must be falsifiable. 'Communication could be better' is not; 'the two teams will agree on the schema in one meeting' is.",
        "- early_signal must be something a person could see or count, not a feeling.",
        "- cheap_test must be an action, not 'monitor closely' or 'keep an eye on it'. It has to be doable in a week without budget approval.",
        "- Do not restate the plan as an assumption. An assumption is what the plan takes for granted.",
        "- The story and the assumptions must agree: every assumption should be visible in the story.",
        "- No text before { and none after }.",
    ].join("\n");

    const EXAMPLES = [
        ["Ship onboarding in 3 weeks", "team of 2, no QA, existing auth service, no migration"],
        ["Launch paid tier next month", "one billing engineer, Stripe already integrated, no pricing research"],
        ["Migrate the database in one weekend", "12k rows, no downtime allowed, one person on call"],
    ];

    function renderExamples() {
        const box = el("examples");
        box.innerHTML = "";
        for (const [plan, context] of EXAMPLES) {
            const chip = document.createElement("div");
            chip.className = "chip";
            chip.textContent = plan;
            chip.addEventListener("click", () => {
                el("plan").value = plan;
                el("context").value = context;
            });
            box.appendChild(chip);
        }
    }

    let ledger = null;
    let state = null;

    function tagFor(id) {
        if (state.dead.has(id)) return { cls: "tag dead", text: "killed" };
        if (state.tested.has(id)) return { cls: "tag ok", text: "tested" };
        return { cls: "tag", text: "untested" };
    }

    function paint() {
        for (const card of document.querySelectorAll(".assump")) {
            const id = card.dataset.id;
            const tag = tagFor(id);
            const t = card.querySelector(".tag");
            t.className = tag.cls;
            t.textContent = tag.text;
            card.classList.toggle("dead", state.dead.has(id));
            card.classList.toggle("tested", state.tested.has(id) && !state.dead.has(id));
        }
        const total = state.allIds.length;
        const killed = state.killed.length;
        const tested = state.tested.size;
        el("score").innerHTML = "";
        const bits = [
            `Assumptions: <b>${total}</b>`,
            `Killed: <b>${killed}</b>`,
            `Tested: <b>${tested}</b>`,
            `Still standing: <b>${total - killed}</b>`,
        ];
        for (const bit of bits) {
            const span = document.createElement("span");
            span.innerHTML = bit;
            el("score").appendChild(span);
        }
    }

    function renderLedger() {
        el("ledgerTitle").textContent = ledger.title;
        el("ledgerLede").textContent = ledger.framing;
        el("story").innerHTML = "";
        const label = document.createElement("b");
        label.textContent = "How it failed: ";
        el("story").appendChild(label);
        el("story").appendChild(document.createTextNode(ledger.story));

        const box = el("assumptions");
        box.innerHTML = "";
        for (const a of ledger.assumptions) {
            const card = document.createElement("div");
            card.className = "assump";
            card.dataset.id = a.id;

            const h = document.createElement("h3");
            h.textContent = a.statement;
            const risk = document.createElement("span");
            risk.className = `risk ${a.risk}`;
            risk.textContent = a.risk;
            h.appendChild(risk);
            const tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = "untested";
            h.appendChild(tag);

            const signal = document.createElement("p");
            signal.className = "kv";
            signal.innerHTML = "<b>First sign it is false:</b> ";
            signal.appendChild(document.createTextNode(a.early_signal));

            const test = document.createElement("p");
            test.className = "kv";
            test.innerHTML = "<b>Test this week:</b> ";
            test.appendChild(document.createTextNode(a.cheap_test));

            const actions = document.createElement("div");
            actions.className = "actions";
            for (const [verdict, text] of [
                ["tested", "Mark tested"],
                ["killed", "Kill it"],
                ["reset", "Reset"],
            ]) {
                const b = document.createElement("button");
                b.type = "button";
                b.className = verdict === "killed" ? "" : "ghost";
                b.textContent = text;
                b.addEventListener("click", () => {
                    state = verdict === "reset"
                        ? {
                              ...state,
                              dead: new Set([...state.dead].filter((x) => x !== a.id)),
                              tested: new Set([...state.tested].filter((x) => x !== a.id)),
                          }
                        : applyVerdict(state, a.id, verdict);
                    if (verdict === "reset") {
                        state.killed = state.allIds.filter((x) => state.dead.has(x));
                        state.survived = state.allIds.filter((x) => !state.dead.has(x));
                    }
                    paint();
                });
                actions.appendChild(b);
            }

            card.append(h, signal, test, actions);
            box.appendChild(card);
        }
        paint();
    }

    async function run() {
        const apiKey = getKey();
        const plan = el("plan").value.trim();
        const context = el("context").value.trim();
        const horizon = el("horizon").value;
        if (!apiKey) { setStatus("Approve a Pollinations key first — press Connect below.", "err"); return; }
        if (plan.length < 15) { setStatus("Describe the plan in at least a sentence.", "err"); return; }

        el("go").disabled = true;
        el("again").disabled = true;
        setStatus("Writing the failure first, then the assumptions behind it…");
        try {
            const raw = await polli.chatCompletion(
                [
                    { role: "system", content: SYSTEM },
                    {
                        role: "user",
                        content: `Plan: ${plan}\nTime horizon: ${horizon}.${context ? `\nConstraints: ${context}` : ""}`,
                    },
                ],
                { apiKey, model: "openai/gpt-5-nano", maxTokens: 12000, reasoningEffort: "low" },
            );
            ledger = normalize(parseJson(raw));
            state = initialState(ledger);
            renderLedger();
            el("out").style.display = "block";
            el("again").style.display = "inline-block";
            setStatus("Done — one Pollinations request, billed to your Pollen.", "ok");
            el("out").scrollIntoView?.({ behavior: "smooth", block: "start" });
        } catch (err) {
            setStatus(err.message, "err");
        } finally {
            el("go").disabled = false;
            el("again").disabled = false;
        }
    }

    el("go").addEventListener("click", run);
    el("again").addEventListener("click", run);
    renderExamples();
})();
