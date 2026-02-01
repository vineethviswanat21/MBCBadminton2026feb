function normalizeName(s) {
  return s.trim().replace(/\s+/g, " ");
}

function linesToList(text) {
  return text.split(/\r?\n/).map(normalizeName).filter(Boolean);
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

function buildForbiddenPairSet(cfg) {
  const set = new Set();
  for (const pair of (cfg?.forbiddenPairs ?? [])) {
    if (!pair || pair.length !== 2) continue;
    set.add(normalizePairKey(pair[0], pair[1]));
  }
  return set;
}

function isForbiddenPair(a, b, forbiddenSet) {
  return forbiddenSet.has(normalizePairKey(a, b));
}

// Old split behavior: first 5 teams in Set 1, remaining in Set 2
function splitIntoSets(teams) {
  const total = teams.length;
  const set1Count = Math.ceil(total / 2);

  return {
    set1: teams.slice(0, set1Count),
    set2: teams.slice(set1Count)
  };
}


// Retry generator until constraints satisfied (or fail)
function tryBuild(makeFn, attempts = 1500) {
  for (let i = 0; i < attempts; i++) {
    const res = makeFn();
    if (res.ok) return res;
  }
  return {
    ok: false,
    reason:
      "Error - 62"
  };
}

function buildTeams(inputNames, cfg, allowSingles) {
  const top = (cfg?.top10 ?? []).map(normalizeName);
  const bottom = (cfg?.bottom10 ?? []).map(normalizeName);
  const all = [...top, ...bottom].map(normalizeName);

  const forbiddenSet = buildForbiddenPairSet(cfg);

  // If user entered exactly the known roster (any order), enforce Top-Bottom pairing.
  // Otherwise, do free random pairing (still avoids forbidden pairs).
  const rosterMatch = setEqualsCaseInsensitive(inputNames, all);

  // Canonicalize entered names to known spellings when roster matches
  const canonMap = new Map();
  for (const n of all) canonMap.set(caseFold(n), n);
  const inputCanon = rosterMatch ? inputNames.map(n => canonMap.get(caseFold(n)) ?? n) : inputNames;

  if (rosterMatch) {
    const inTop = inputCanon.filter(n => top.some(t => caseFold(t) === caseFold(n)));
    const inBottom = inputCanon.filter(n => bottom.some(b => caseFold(b) === caseFold(n)));

    const attempt = tryBuild(() => {
      const T = shuffle([...inTop]);
      const B = shuffle([...inBottom]);

      const teams = [];
      const pairs = Math.min(T.length, B.length);

      for (let i = 0; i < pairs; i++) {
        const p1 = T[i];
        const p2 = B[i];
        if (isForbiddenPair(p1, p2, forbiddenSet)) return { ok: false };
        teams.push([p1, p2]);
      }

      const leftovers = T.slice(pairs).concat(B.slice(pairs));
      if (leftovers.length) {
        if (!allowSingles) return { ok: false };
        for (const l of leftovers) teams.push([l]);
      }

      return { ok: true, teams };
    });

    if (!attempt.ok) return { mode: "ERROR", error: attempt.reason };

    const split = splitIntoSets(attempt.teams);
    return { mode: "PAIRED", set1: split.set1, set2: split.set2 };
  }

  // Not a perfect roster match => free random pairing (still avoids forbidden pairs)
  const attempt = tryBuild(() => {
    const pool = shuffle([...inputCanon]);
    const teams = [];

    while (pool.length >= 2) {
      const p1 = pool.shift();
      const p2 = pool.shift();
      if (isForbiddenPair(p1, p2, forbiddenSet)) return { ok: false };
      teams.push([p1, p2]);
    }

    if (pool.length === 1 && allowSingles) teams.push([pool.shift()]);
    if (pool.length === 1 && !allowSingles) return { ok: false };

    return { ok: true, teams };
  });

  if (!attempt.ok) return { mode: "ERROR", error: attempt.reason };

  const split = splitIntoSets(attempt.teams);
  return { mode: "RANDOM", set1: split.set1, set2: split.set2 };
}

// ---------- UI ----------
const elNames = document.getElementById("names");
const elBtn = document.getElementById("randomizeBtn");
const elClear = document.getElementById("clearBtn");
const elTeams = document.getElementById("teams");
const elStatus = document.getElementById("status");
const elAllowSingles = document.getElementById("allowSingles");

let CFG = null;

async function loadCfg() {
  try {
    const res = await fetch("./config.json", { cache: "no-store" });
    if (!res.ok) throw new Error("missing config");
    CFG = await res.json();
    elStatus.textContent = "Paste names and click Randomizer.";
  } catch (e) {
    // Still works without the file (random pairing only)
    CFG = { top10: [], bottom10: [], forbiddenPairs: [] };
    elStatus.textContent = "Paste names and click Randomizer.";
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
    elStatus.textContent = result.error || "Unable to create teams. Try again.";
    return;
  }

  // No mention of configs in UI text:
  elStatus.textContent =
    result.mode === "PAIRED"
      ? "Teams created successfully."
      : "Teams created successfully.";

  elTeams.appendChild(renderSet("Set 1", result.set1));
  elTeams.appendChild(renderSet("Set 2", result.set2));
}

elBtn.addEventListener("click", () => {
  const input = linesToList(elNames.value);

  if (input.length < 2) {
    elStatus.textContent = "Please enter at least 2 names (one per line).";
    elTeams.innerHTML = "";
    return;
  }

  const result = buildTeams(input, CFG, elAllowSingles.checked);
  renderOutput(result);
});

elClear.addEventListener("click", () => {
  elNames.value = "";
  elTeams.innerHTML = "";
  elStatus.textContent = "Cleared.";
});

loadCfg();
