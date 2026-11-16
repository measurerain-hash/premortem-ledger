// Test-facing ES module wrapper. ledger.js stays a classic script for the browser.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./ledger.js", import.meta.url), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const api = context.window.Ledger;

const clone = (value) => JSON.parse(JSON.stringify(value));

export const parseJson = (raw) => clone(api.parseJson(raw));
export const normalize = (data) => clone(api.normalize(data));
export const initialState = (ledger) => {
    const s = api.initialState(ledger);
    return { ...s, dead: new Set(s.dead), tested: new Set(s.tested) };
};
export const applyVerdict = (state, id, verdict) => {
    const r = api.applyVerdict(
        { ...state, dead: new Set(state.dead), tested: new Set(state.tested) },
        id,
        verdict,
    );
    return { ...r, dead: new Set(r.dead), tested: new Set(r.tested) };
};
