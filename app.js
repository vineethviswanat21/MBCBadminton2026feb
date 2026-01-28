function normalizeName(s) {
  return s.trim().replace(/\s+/g, " ");
}

function linesToList(text) {
  return text
    .split(/\r?\n/)
    .map(normalizeName)
    .filter(Boolean);
}

function caseFold(s) {
  return s.toLocaleLowerCase();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function setEqualsCaseInsensitive(aList, bList) {
  const a = aList.map(caseFold).sort();
  const b = bList.map(caseFold).sort();
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function normalizePairKey(a, b) {
  const aa = caseFold(a);
  const bb = caseFold(b);
  return aa < bb ? `${aa}||${bb}` : `${bb}||${aa}`;
}

function buildForbiddenPairSet(config) {
  const set = new Set();
  for (const pair of (config?.forbiddenPairs ?? [])) {
    if (!pair || pair.length !== 2) continue;
    set.add(normalizePairKey(pair[0], pair[1]));
  }
  return set;
}

function isForbiddenPair(a, b, forbiddenPairsSet) {
  return forbiddenPairsSet.has(normalizePairKey(a, b));
}

// Hard-coded: split into Set A (first 5 teams) and Set B (rest)
function splitTeams(teams) {
  const SET_A_COUNT = 5;
  return {
    setA: teams.slice(0, SET_A_COUNT),
    setB: teams.slice(SET_A_COUNT)
  };
}

// Retry generator until constraints satisfied (or fail)
function tryBuildTeams(makeTeamsFn, attempts = 500) {
  for (let i = 0; i < attempts; i++) {
    const res = makeTeamsFn();
    if (res.ok) return res;
  }
  return { ok: false, teams: [], reason: "Could not generate teams - Internal Error ." };
}

function buildTeams(inputNames, config, allowSingles) {
  const groupA = (config?.groupA ?? []).map(normalizeName);
  const groupB = (config?.groupB ?? []).map(normalizeName);
  const configAll = [...groupA, ...groupB].map(normalizeName);

  const forbiddenPairsSet = buildForbiddenPairSet(config);

  const isConfigMatch = setEqualsCaseInsensitive(inputNames, configAll);

  // Canonicalize to config names when matched (handles case/spacing)
  const canonMap = new Map();
  for (const n of configAll) canonMap.set(caseFold(n), n);
  const inputCanon = inputNames.map(n => canonMap.get(caseFold(n)) ?? n);

  if (isConfigMatch) {
    const inputA = inputCanon.filter(n => groupA.some(a => caseFold(a) === caseFold(n)));
    const inputB = inputCanon.filter(n => groupB.some(b => caseFold(b) === caseFold(n)));

    const attempt = tryBuildTeams(() => {
      const a = shuffle([...inputA]);
      const b = shuffle([...inputB]);

      const teams = [];
      const pairs = Math.min(a.length, b.length);

      for (let i = 0; i < pairs; i++) {
        const p1 = a[i];
        const p2 = b[i];

        if (isForbiddenPair(p1, p2, forbiddenPairsSet)) return { ok: false };
        teams.push([p1, p2]);
      }

      const leftovers = a.slice(pairs).concat(b.slice(pairs));
      if (leftovers.length && allowSingles) {
        for (const l of leftovers) teams.push([l]);
      }

      return { ok: true, teams };
    });

    if (!attempt.ok) return { mode: "ERROR", error: attempt.reason, teams: [] };

    const split = splitTeams(attempt.teams);
    return { mode: "CONFIG_MATCH", teams: attempt.teams, split };
  }

  // Free random pairing (still avoid forbidden pairs)
  const attempt = tryBuildTeams(() => {
    const pool = shuffle([...inputNames]);
    const teams = [];

    while (pool.length >= 2) {
      const p1 = pool.shift();
      const p2 = pool.shift();

      if (isForbiddenPair(p1, p2, forbiddenPairsSet)) return { ok: false };
      teams.push([p1, p2]);
    }

    if (pool.length === 1 && allowSingles) teams.push([pool.shift()]);
    return { ok: true, teams };
  });

  if (!attempt.ok) return { mode: "ERROR", error: attempt.reason, teams: [] };

  const split = splitTeams(attempt.teams);
  return { mode: "FREE_RANDOM", teams: attempt.teams, split };
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
    if (!res.ok) throw new Error("Internal error ");
    CONFIG = await res.json();
    elStatus.textContent = " Paste names and click Randomizer.";
  } catch (e) {
    CONFIG = { groupA: [], groupB: [], forbiddenPairs: [] };
    elStatus.textContent =
      "Config not loaded (missing config.json). Randomizer will start random pairing.";
  }
}

function renderSet(title, teams) {
  const wrap = document.createElement("div");
  wrap.style.marginTop = "10px";

  const h = document.createElement("h3");
  h.textContent = title;
  h.style.margin = "8px 0";

  wrap.appendChild(h);

  if (!teams.length) {
    const empty = document.createElement("div");
    empty.className = "status";
    empty.textContent = "No teams in this set.";
    wrap.appendChild(empty);
    return wrap;
  }

  teams.forEach((t, idx) => {
    const div = document.createElement("div");
    div.className = "team";

    const left = document.createElement("div");
    left.className = "left";

    const titleLine = document.createElement("div");
    titleLine.innerHTML = `<span class="code">Team ${idx + 1}</span>`;

    const names = document.createElement("div");
    names.textContent = t.join(" + ");

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = t.length === 1 ? "Single" : "Doubles";

    left.appendChild(titleLine);
    left.appendChild(names);
    left.appendChild(tag);

    div.appendChild(left);
    wrap.appendChild(div);
  });

  return wrap;
}

function renderOutput(result) {
  elTeams.innerHTML = "";

  if (result.mode === "ERROR") {
    elStatus.textContent = result.error || "Error generating teams.";
    return;
  }

  elStatus.textContent =
    result.mode === "CONFIG_MATCH"
      ? "Completed "
      : "Free random pairing applied";

  const { setA, setB } = result.split;

  elTeams.appendChild(renderSet("Set A (first 5 teams)", setA));
  elTeams.appendChild(renderSet("Set B (remaining teams)", setB));
}

elBtn.addEventListener("click", () => {
  const input = linesToList(elNames.value);

  if (input.length < 2) {
    elStatus.textContent = "Please enter at least 2 names (one per line).";
    elTeams.innerHTML = "";
    return;
  }

  const result = buildTeams(input, CONFIG, elAllowSingles.checked);
  renderOutput(result);
});

elClear.addEventListener("click", () => {
  elNames.value = "";
  elTeams.innerHTML = "";
  elStatus.textContent = "Cleared.";
});

loadConfig();
