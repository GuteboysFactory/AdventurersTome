const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-nlp-provider";
const VERSION = 1;
const PROVIDER = "compromise";
const PROVIDER_VERSION = "14.17.0";

const LEADING_BOUNDARY_TAGS = new Set([
  "Verb","Auxiliary","Copula","Modal","Preposition","Determiner","QuestionWord","Conjunction"
]);
const TRAILING_BOUNDARY_TAGS = new Set([
  "Auxiliary","Copula","Modal","Preposition","Determiner","QuestionWord","Conjunction"
]);

let calls = 0;
let refinements = 0;
let failures = 0;
let lastError = "";

function clean(value) {
  return String(value ?? "").trim();
}

function nlpRuntime() {
  return typeof globalThis.nlp === "function" ? globalThis.nlp : null;
}

function tagSet(term) {
  const raw = term?.tags;
  if (Array.isArray(raw)) return new Set(raw.map(String));
  if (raw && typeof raw === "object") return new Set(Object.keys(raw).filter((key) => raw[key]));
  return new Set();
}

function termText(term) {
  return clean(term?.text ?? term?.normal ?? "");
}

function analyze(text) {
  calls += 1;
  const input = clean(text);
  if (!input) return { input, terms:[], provider:PROVIDER, providerVersion:PROVIDER_VERSION };

  const nlp = nlpRuntime();
  if (!nlp) {
    return {
      input,
      terms:[],
      provider:PROVIDER,
      providerVersion:PROVIDER_VERSION,
      unavailable:true
    };
  }

  try {
    const json = nlp(input).json({ tags:true, normal:true, offset:true }) || [];
    const terms = [];
    for (const sentence of json) {
      for (const term of sentence?.terms || []) {
        const tags = [...tagSet(term)];
        terms.push({
          text:termText(term),
          normal:clean(term?.normal),
          tags,
          offset:term?.offset ? {
            start:Number(term.offset.start || 0),
            length:Number(term.offset.length || 0)
          } : null
        });
      }
    }
    return {
      input,
      terms,
      provider:PROVIDER,
      providerVersion:PROVIDER_VERSION,
      unavailable:false
    };
  } catch (error) {
    failures += 1;
    lastError = String(error?.message || error);
    return {
      input,
      terms:[],
      provider:PROVIDER,
      providerVersion:PROVIDER_VERSION,
      unavailable:false,
      error:lastError
    };
  }
}

function hasAnyTag(term, tags) {
  const set = new Set(term?.tags || []);
  for (const tag of tags) if (set.has(tag)) return true;
  return false;
}

function refineBoundary(value) {
  const input = clean(value);
  const analysis = analyze(input);
  const terms = analysis.terms || [];

  if (!input || analysis.unavailable || analysis.error || !terms.length) {
    return {
      input,
      text:input,
      changed:false,
      provider:PROVIDER,
      providerVersion:PROVIDER_VERSION,
      signals:analysis.unavailable ? ["provider-unavailable"] : analysis.error ? ["provider-error"] : []
    };
  }

  let start = 0;
  let end = terms.length;
  const signals = [];

  while (start < end - 1 && hasAnyTag(terms[start], LEADING_BOUNDARY_TAGS)) {
    signals.push(`trim-leading:${terms[start].text}:${terms[start].tags.join("+")}`);
    start += 1;
  }

  while (end - start > 1 && hasAnyTag(terms[end - 1], TRAILING_BOUNDARY_TAGS)) {
    signals.push(`trim-trailing:${terms[end - 1].text}:${terms[end - 1].tags.join("+")}`);
    end -= 1;
  }

  const kept = terms.slice(start, end);
  const output = clean(kept.map((term) => term.text).join(" "));
  const changed = Boolean(output && output !== input);

  if (changed) refinements += 1;

  return {
    input,
    text:output || input,
    changed,
    provider:PROVIDER,
    providerVersion:PROVIDER_VERSION,
    signals,
    terms
  };
}

function typeHints(value) {
  const analysis = analyze(value);
  const hints = {
    character:0,
    location:0,
    faction:0
  };
  const signals = [];

  for (const term of analysis.terms || []) {
    const tags = new Set(term.tags || []);
    if (tags.has("Person")) {
      hints.character = Math.max(hints.character, 0.82);
      signals.push("compromise:#Person");
    }
    if (tags.has("Place") || tags.has("City") || tags.has("Country") || tags.has("Region")) {
      hints.location = Math.max(hints.location, 0.82);
      signals.push("compromise:#Place");
    }
    if (tags.has("Organization") || tags.has("Company")) {
      hints.faction = Math.max(hints.faction, 0.74);
      signals.push("compromise:#Organization");
    }
  }

  return {
    provider:PROVIDER,
    providerVersion:PROVIDER_VERSION,
    hints,
    signals:[...new Set(signals)]
  };
}

function audit() {
  return {
    contract:CONTRACT,
    version:VERSION,
    healthy:failures === 0 && Boolean(nlpRuntime()),
    provider:PROVIDER,
    providerVersion:PROVIDER_VERSION,
    runtimeAvailable:Boolean(nlpRuntime()),
    localOnly:true,
    networkRequired:false,
    advisoryOnly:true,
    identityAuthority:false,
    writeAuthority:false,
    license:"MIT",
    calls,
    refinements,
    failures,
    lastError
  };
}

const publicApi = Object.freeze({
  contract:CONTRACT,
  version:VERSION,
  provider:PROVIDER,
  providerVersion:PROVIDER_VERSION,
  localOnly:true,
  advisoryOnly:true,
  analyze,
  refineBoundary,
  typeHints,
  audit
});

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.nlpProvider = publicApi;
  return true;
}

Hooks.once("ready", () => {
  attach();
  console.info(`Adventurer's Tome | NLP Provider ready: ${PROVIDER} ${PROVIDER_VERSION} (local advisory layer).`);
});

Hooks.on("renderApplicationV2", () => {
  if (game.modules.get(MODULE_ID)?.api?.nlpProvider !== publicApi) attach();
});
