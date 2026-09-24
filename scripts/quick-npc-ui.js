const MODULE_ID = "adventurers-tome";
const CONTRACT = "adventurers-tome-quick-npc-ui";
const VERSION = 1;

const stats = {
  opens:0,
  nativeProviderOpens:0,
  fallbackOpens:0,
  previews:0,
  applies:0,
  backs:0,
  cancels:0,
  failures:0,
  lastError:""
};

function clean(value) {
  return String(value ?? "").trim();
}

function esc(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function api() {
  return game.modules.get(MODULE_ID)?.api || null;
}

function creationApi() {
  return api()?.npcCreation || null;
}

async function nativeProvider(options = {}) {
  const adapters = api()?.adapters;
  if (!adapters?.nativeQuickNpc) return null;

  const row = await adapters.nativeQuickNpc({
    ...options,
    source:options?.source || { documentName:"Actor", type:"npc" }
  });

  const provider = row?.result;
  if (!provider || provider.contract !== "adventurers-tome-native-quick-npc-provider") return null;
  if (Number(provider.version) !== 1 || typeof provider.open !== "function") return null;

  return Object.freeze({
    adapterId:String(row.adapterId || ""),
    providerId:clean(provider.providerId),
    label:clean(provider.label || "Native Quick NPC"),
    systemId:clean(provider.systemId || game.system?.id),
    libraryVersion:clean(provider.libraryVersion),
    groupLibraryVersion:clean(provider.groupLibraryVersion),
    capabilities:Object.freeze(Array.isArray(provider.capabilities) ? [...provider.capabilities] : []),
    open:provider.open,
    openGroups:typeof provider.openGroups === "function" ? provider.openGroups : null
  });
}

function inputValue(form, name) {
  const control = form?.elements?.namedItem?.(name) ?? form?.elements?.[name];
  if (!control) return undefined;
  if (control.type === "checkbox") return Boolean(control.checked);
  return control.value;
}

function fieldControl(field, currentValue) {
  const name = `field_${field.id}`;
  const value = currentValue === undefined ? field.default : currentValue;
  const required = field.required ? " required" : "";

  if (field.type === "boolean") {
    return `<label class="at-qnpc-checkbox"><input type="checkbox" name="${esc(name)}" ${value ? "checked" : ""}><span>${esc(field.label)}</span></label>`;
  }

  if (field.type === "select") {
    const options = (field.options || []).map((entry) =>
      `<option value="${esc(entry.value)}" ${String(value ?? "") === String(entry.value) ? "selected" : ""}>${esc(entry.label)}</option>`
    ).join("");
    return `<label><span>${esc(field.label)}</span><select name="${esc(name)}"${required}><option value="">—</option>${options}</select></label>`;
  }

  if (field.type === "html") {
    return `<label class="at-qnpc-wide"><span>${esc(field.label)}</span><textarea name="${esc(name)}" rows="4"${required}>${esc(value ?? "")}</textarea></label>`;
  }

  if (field.type === "number" || field.type === "integer") {
    const min = field.min == null ? "" : ` min="${esc(field.min)}"`;
    const max = field.max == null ? "" : ` max="${esc(field.max)}"`;
    const step = field.type === "integer" ? "1" : "any";
    return `<label><span>${esc(field.label)}</span><input type="number" step="${step}"${min}${max} name="${esc(name)}" value="${esc(value ?? "")}"${required}></label>`;
  }

  return `<label><span>${esc(field.label)}</span><input type="text" name="${esc(name)}" value="${esc(value ?? "")}"${required}></label>`;
}

function formHtml(schema, draft = {}) {
  const fields = (schema.fields || []).map((field) => fieldControl(field, draft.values?.[field.id])).join("");
  return `<form class="at-qnpc-form">
    <div class="at-qnpc-brand"><i class="fa-solid fa-user-plus"></i><span>ADVENTURER'S TOME · QUICK NPC</span></div>
    <div class="at-qnpc-intro">
      <div><strong>${esc(schema.label || "NPC")}</strong><small>${esc(schema.systemId)} · ${esc(schema.adapterId)}</small></div>
      <span class="at-qnpc-contract"><i class="fa-solid fa-shield-halved"></i> System-aware</span>
    </div>
    <label class="at-qnpc-name"><span>Name</span><input type="text" name="npcName" value="${esc(draft.name || "")}" placeholder="NPC name" required autofocus></label>
    <div class="at-qnpc-grid">${fields}</div>
    <div class="at-qnpc-safety"><i class="fa-solid fa-eye"></i><span><strong>Preview first.</strong> Nothing is created until you approve the plan.</span></div>
  </form>`;
}

function readDraft(schema, form) {
  const name = clean(inputValue(form, "npcName"));
  const values = {};
  for (const field of schema.fields || []) {
    values[field.id] = inputValue(form, `field_${field.id}`);
  }
  return { name, values };
}

function resolutionMeta(plan) {
  const action = clean(plan?.resolution?.action);
  if (action === "reuse-world") {
    return {
      icon:"fa-link",
      title:"Use Existing World Actor",
      detail:"An exact World Actor already exists. Tome will reuse it instead of creating a duplicate.",
      tone:"reuse"
    };
  }
  if (action === "import-compendium") {
    return {
      icon:"fa-box-archive",
      title:"Import Compendium Actor",
      detail:"An exact Compendium Actor exists. Tome will import a normal World Actor copy.",
      tone:"import"
    };
  }
  if (action === "create-new") {
    return {
      icon:"fa-user-plus",
      title:"Create New NPC",
      detail:"No exact canonical match was found. Tome will create a new World Actor.",
      tone:"create"
    };
  }
  return {
    icon:"fa-triangle-exclamation",
    title:"Choice Required",
    detail:"More than one exact candidate exists. Choose the intended canonical Actor before continuing.",
    tone:"blocked"
  };
}

function candidateRows(plan) {
  const rows = [
    ...(plan?.candidates?.world || []),
    ...(plan?.candidates?.compendium || [])
  ];
  if (!rows.length) return "";
  return `<div class="at-qnpc-candidates">${rows.map((candidate) => `
    <label>
      <input type="radio" name="candidateUuid" value="${esc(candidate.uuid)}">
      <span class="at-qnpc-candidate-icon"><i class="fa-solid ${candidate.kind === "world" ? "fa-earth-europe" : "fa-box-archive"}"></i></span>
      <span><strong>${esc(candidate.name)}</strong><small>${esc(candidate.kind === "world" ? "World Actor" : candidate.pack || "Compendium")}</small></span>
    </label>`).join("")}</div>`;
}

function fieldPreview(plan) {
  return (plan?.schema?.fields || []).map((field) => {
    const value = plan?.values?.[field.id];
    if (value === undefined || value === null || value === "" || value === false) return "";
    const text = field.type === "boolean" ? (value ? "Yes" : "No") : String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return `<div><span>${esc(field.label)}</span><strong>${esc(text || "—")}</strong></div>`;
  }).filter(Boolean).join("");
}

function reviewHtml(plan) {
  const meta = resolutionMeta(plan);
  const candidate = plan?.resolution?.candidate;
  const blocked = plan?.resolution?.action === "blocked";
  return `<form class="at-qnpc-review">
    <div class="at-qnpc-brand"><i class="fa-solid fa-user-check"></i><span>QUICK NPC · CREATION PLAN</span></div>
    <section class="at-qnpc-resolution ${esc(meta.tone)}">
      <i class="fa-solid ${esc(meta.icon)}"></i>
      <div><strong>${esc(meta.title)}</strong><p>${esc(meta.detail)}</p></div>
    </section>
    <section class="at-qnpc-review-identity">
      <img src="${esc(plan?.actorData?.img || "icons/svg/mystery-man.svg")}" alt="">
      <div><span>${esc(plan?.actorType || "npc")}</span><h2>${esc(plan?.name || "NPC")}</h2><small>${esc(plan?.systemId)} · ${esc(plan?.adapterId)}</small></div>
    </section>
    ${candidate ? `<section class="at-qnpc-match"><span>Canonical match</span><strong>${esc(candidate.name)}</strong><small>${esc(candidate.kind === "world" ? candidate.uuid : candidate.pack || candidate.uuid)}</small></section>` : ""}
    ${blocked ? candidateRows(plan) : ""}
    <section class="at-qnpc-field-preview">${fieldPreview(plan) || "<div><span>Details</span><strong>System defaults</strong></div>"}</section>
    <div class="at-qnpc-safety"><i class="fa-solid fa-fingerprint"></i><span>Plan signature locked. Apply will fail if the validated plan changes.</span></div>
  </form>`;
}

async function collect(schema, draft = {}) {
  return foundry.applications.api.DialogV2.wait({
    window:{ title:"Adventurer's Tome · Quick NPC", resizable:true },
    position:{ width:760, height:"auto" },
    content:formHtml(schema, draft),
    modal:false,
    rejectClose:false,
    buttons:[
      {
        action:"preview",
        label:"Preview Plan",
        icon:"fa-solid fa-magnifying-glass",
        default:true,
        callback:(_event, button) => ({ action:"preview", draft:readDraft(schema, button.form) })
      },
      {
        action:"cancel",
        label:"Cancel",
        callback:() => ({ action:"cancel" })
      }
    ]
  });
}

async function review(plan) {
  const blocked = plan?.resolution?.action === "blocked";
  const buttons = blocked
    ? [
        {
          action:"choose",
          label:"Use Selected",
          icon:"fa-solid fa-link",
          default:true,
          callback:(_event, button) => ({
            action:"choose",
            candidateUuid:clean(inputValue(button.form, "candidateUuid"))
          })
        },
        {
          action:"back",
          label:"Back",
          icon:"fa-solid fa-arrow-left",
          callback:() => ({ action:"back" })
        },
        {
          action:"cancel",
          label:"Cancel",
          callback:() => ({ action:"cancel" })
        }
      ]
    : [
        {
          action:"apply",
          label:plan?.resolution?.action === "reuse-world" ? "Use Actor" : "Apply",
          icon:"fa-solid fa-circle-check",
          default:true,
          callback:() => ({ action:"apply" })
        },
        {
          action:"back",
          label:"Back",
          icon:"fa-solid fa-arrow-left",
          callback:() => ({ action:"back" })
        },
        {
          action:"cancel",
          label:"Cancel",
          callback:() => ({ action:"cancel" })
        }
      ];

  return foundry.applications.api.DialogV2.wait({
    window:{ title:"Adventurer's Tome · Quick NPC Plan", resizable:true },
    position:{ width:760, height:"auto" },
    content:reviewHtml(plan),
    modal:false,
    rejectClose:false,
    buttons
  });
}

async function open(options = {}) {
  if (!game.user?.isGM) {
    ui.notifications.warn("Adventurer's Tome: Quick NPC is GM-only.");
    return null;
  }

  stats.opens += 1;

  if (options?.forceGeneric !== true) {
    try {
      const provider = await nativeProvider(options);
      if (provider) {
        stats.nativeProviderOpens += 1;
        return provider.open({
          initialQuery:clean(options.initialQuery || options.name),
          actorName:clean(options.name),
          closeAfterCreate:options.closeAfterCreate === true
        });
      }
    } catch (error) {
      stats.failures += 1;
      stats.lastError = String(error?.message || error);
      console.warn("Adventurer's Tome | Native Quick NPC provider failed; using generic fallback", error);
      ui.notifications.warn("Adventurer's Tome: Native Quick NPC was unavailable. Opening the generic creator instead.");
    }
  }

  stats.fallbackOpens += 1;

  const creation = creationApi();
  if (!creation?.schema || !creation?.plan || !creation?.apply) {
    ui.notifications.error("Adventurer's Tome: NPC Creation Contract is unavailable.");
    return null;
  }

  let schema;
  try {
    schema = await creation.schema(options);
  } catch (error) {
    stats.failures += 1;
    stats.lastError = String(error?.message || error);
    ui.notifications.error(`Adventurer's Tome: ${stats.lastError}`);
    return null;
  }

  let draft = {
    name:clean(options.name),
    values:{ ...(options.values || {}) }
  };

  while (true) {
    const collected = await collect(schema, draft);
    if (!collected || collected.action === "cancel") {
      stats.cancels += 1;
      return null;
    }

    draft = collected.draft;
    let plan;
    try {
      plan = await creation.plan({ ...options, ...draft });
      stats.previews += 1;
    } catch (error) {
      stats.failures += 1;
      stats.lastError = String(error?.message || error);
      ui.notifications.error(`Adventurer's Tome: ${stats.lastError}`);
      continue;
    }

    while (true) {
      const decision = await review(plan);
      if (!decision || decision.action === "cancel") {
        stats.cancels += 1;
        return null;
      }
      if (decision.action === "back") {
        stats.backs += 1;
        break;
      }
      if (decision.action === "choose") {
        if (!decision.candidateUuid) {
          ui.notifications.warn("Adventurer's Tome: Choose an Actor candidate first.");
          continue;
        }
        try {
          plan = await creation.plan({ ...options, ...draft, candidateUuid:decision.candidateUuid });
          stats.previews += 1;
          continue;
        } catch (error) {
          stats.failures += 1;
          stats.lastError = String(error?.message || error);
          ui.notifications.error(`Adventurer's Tome: ${stats.lastError}`);
          continue;
        }
      }
      if (decision.action === "apply") {
        try {
          const result = await creation.apply(plan);
          stats.applies += 1;
          const actor = result?.actorUuid ? await fromUuid(result.actorUuid) : null;
          const verb = result?.action === "reuse-world" ? "Using" : result?.action === "import-compendium" ? "Imported" : "Created";
          ui.notifications.info(`Adventurer's Tome: ${verb} ${result?.actorName || draft.name}.`);
          actor?.sheet?.render?.(true);
          return result;
        } catch (error) {
          stats.failures += 1;
          stats.lastError = String(error?.message || error);
          ui.notifications.error(`Adventurer's Tome: ${stats.lastError}`);
          return null;
        }
      }
    }
  }
}

async function providerInfo() {
  try {
    const provider = await nativeProvider();
    if (!provider) return null;
    return Object.freeze({
      adapterId:provider.adapterId,
      providerId:provider.providerId,
      label:provider.label,
      systemId:provider.systemId,
      libraryVersion:provider.libraryVersion,
      groupLibraryVersion:provider.groupLibraryVersion,
      capabilities:provider.capabilities
    });
  } catch (_error) {
    return null;
  }
}

function audit() {
  return Object.freeze({
    contract:CONTRACT,
    version:VERSION,
    gmOnly:true,
    healthy:stats.failures === 0,
    npcCreationContract:Boolean(creationApi()?.plan && creationApi()?.apply),
    nativeProviderCapability:Boolean(api()?.adapters?.nativeQuickNpc),
    stats:Object.freeze({ ...stats })
  });
}

const publicApi = Object.freeze({ contract:CONTRACT, version:VERSION, open, providerInfo, audit });

function attach() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return false;
  if (!module.api || typeof module.api !== "object") module.api = {};
  module.api.quickNpc = publicApi;
  return true;
}

Hooks.once("ready", () => {
  attach();
  console.info("Adventurer's Tome | Quick NPC UI v1 ready.");
});
