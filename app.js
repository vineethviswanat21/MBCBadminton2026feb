// ---------- Helpers ----------
function normalizeName(s) {
  return s.trim().replace(/\s+/g, " ");
}

function linesToList(text) {
  return text
    .split(/\r?\n/)
    .map(normalizeName)
    .filter(Boolean);
}

function shuffle(arr) {
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function caseFold(s) {
  return s.toLocaleLowerCase();
}

function setEqualsCaseInsensitive(aList, bList) {
  const a = aList.map(caseFold).sort();
  const b = bList.map(caseFold).sort();
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// If input matches config set, pair A with B only.
// Otherwise pair anyone with anyone.
function buildTeams(inputNames, config, allowSingles) {
  const groupA = (config?.groupA ?? []).map(normalizeName);
  const groupB = (config?.groupB ?? []).map(normalizeName);

  const configAll = [...groupA, ...groupB].map(normalizeName);

  const isConfigMatch = setEqualsCaseInsensitive(inputNames, configAll);

  if (isConfigMatch) {
    // Map input names to their canonical form from config to avoid minor spacing/case differences.
    const canonMap = new Map();
    for (const n of configAll) canonMap.set(caseFold(n), n);

    const inputCanon = inputNames.map(n => canonMap.get(caseFold(n)) ?? n);

    const inputA = inputCanon.filter(n => groupA.some(a => caseFold(a) === caseFold(n)));
    const inputB = inputCanon.filter(n => groupB.some(b => caseFold(b) === caseFold(n)));

    shuffle(inputA);
    shuffle(inputB);

    const teams = [];
    const pairs = Math.min(inputA.length, inputB.length);
    for (let i = 0; i < pairs; i++) {
      teams.push([inputA[i], inputB[i]]);
    }

    // In theory lengths should be equal. But if config is uneven, handle leftovers.
    const leftovers = inputA.slice(pairs).concat(inputB.slice(pairs));
    if (leftovers.length) {
      if (allowSingles) {
        for (const l of leftovers) teams.push([l]);
      } else {
        // drop leftovers
      }
    }

    return { teams, mode: "CONFIG_MATCH" };
  }

  // Fallback: random pair any names
  const pool = [...inputNames];
  shuffle(pool);

  const teams = [];
  while (pool.length >= 2) {
    teams.push([pool.shift(), pool.shift()]);
  }
  if (pool.length === 1 && allowSingles) teams.push([pool.shift()]);

  return { teams, mode: "FREE_RANDOM" };
}

// ---------- UI ----------
const elNames = document.getElementById("names");
const elBtn = document.getElementById("randomizeBtn");
const elClear = document.getElementById("clearBtn");
const elTeams = document.getElementById("teams");
const elStatus = document.getElementById("status");
const elAllowSingles = document.getElementById("allowSingles");

let CONFIG = null;

async function loadConfig() {
  try {
    const res = await fetch("./config.json", { cache: "no-store" });
    if (!res.ok) throw new Error("config.json not found");
    CONFIG = await res.json();
    elStatus.textContent = "Paste names and click Randomizer.";
  } catch (e) {
    CONFIG = { groupA: [], groupB: [] };
    elStatus.textContent =
      "Config not loaded (missing config.json). Randomizer will use free random pairing.";
  }
}

function renderTeams(teams, mode) {
  elTeams.innerHTML = "";
  if (!teams.length) {
    elTeams.innerHTML = `<div class="status">No teams generated.</div>`;
    return;
  }

  const modeLabel =
    mode === "CONFIG_MATCH"
      ? "Grouped across A & B (config matched)"
      : "Free random pairing (config not matched)";

  elStatus.textContent = modeLabel;

  teams.forEach((t, idx) => {
    const div = document.createElement("div");
    div.className = "team";

    const left = document.createElement("div");
    left.className = "left";
    const title = document.createElement("div");
    title.innerHTML = `<span class="code">Team ${idx + 1}</span>`;
    const names = document.createElement("div");
    names.textContent = t.join(" + ");
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = t.length === 1 ? "Single" : "Doubles";
    left.appendChild(title);
    left.appendChild(names);
    left.appendChild(tag);

    div.appendChild(left);
    elTeams.appendChild(div);
  });
}

elBtn.addEventListener("click", () => {
  const input = linesToList(elNames.value);
  if (input.length < 2) {
    elStatus.textContent = "Please enter at least 2 names (one per line).";
    elTeams.innerHTML = "";
    return;
  }

  const { teams, mode } = buildTeams(input, CONFIG, elAllowSingles.checked);
  renderTeams(teams, mode);
});

elClear.addEventListener("click", () => {
  elNames.value = "";
  elTeams.innerHTML = "";
  elStatus.textContent = "Cleared.";
});

loadConfig();
