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

// Retry until it satisfies constraints, else fail
function tryBuild(makeFn, attempts = 1200) {
  for (let i = 0; i < attempts; i++) {
    const res = makeFn();
    if (res.ok) return res;
  }
  return {
    ok: false,
    reason:
      "Could not generate valid teams with the given constraints (forbidden pairs). Try Randomizer again or adjust forbidden pairs."
  };
}

/**
 * Split rule REQUIRED by you:
 * - Set 1: 3 AB teams + 2 CC teams
 * - Set 2: 4 AB teams + 1 CC team
 * Total teams = 10
 */
function splitIntoTwoSets(abTeams, cTeams) {
  const set1 = [];
  const set2 = [];

  // AB split: 3 in set1, 4 in set2
  set1.push(...abTeams.slice(0, 3));
  set2.push(...abTeams.slice(3, 7));

  // C split: 2 in set1, 1 in set2
  set1.push(...cTeams.slice(0, 2));
  set2.push(...cTeams.slice(2, 3));

  return { set1, set2 };
}

function buildTeamsWithRules(inputNames, config, allowSingles) {
  const groupA = (config?.groupA ?? []).map(normalizeName);
  const groupB = (config?.groupB ?? []).map(normalizeName);
  const groupC = (config?.groupC ?? []).map(normalizeName);

  const configAll = [...groupA, ...groupB, ...groupC].map(normalizeName);
  const forbiddenPairsSet = buildForbiddenPairSet(config);

  const isConfigMatch = setEqualsCaseInsensitive(inputNames, configAll);

  // Canonicalize to config names when matched
  const canonMap = new Map();
  for (const n of configAll) canonMap.set(caseFold(n), n);
  const inputCanon = inputNames.map(n => canonMap.get(caseFold(n)) ?? n);

  if (!isConfigMatch) {
    // Fallback: free random pairing (still avoid forbidden pairs)
    const attempt = tryBuild(() => {
      const pool = shuffle([...inputNames]);
      const teams = [];

      while (pool.length >= 2) {
        const p1 = pool.shift();
        const p2 = pool.shift();
        if (isForbiddenPair(p1, p2, forbiddenPairsSet)) return { ok: false };
        teams.push([p1, p2]);
      }

      if (pool.length === 1 && allowSingles) teams.push([pool.shift()]);
      if (pool.length === 1 && !allowSingles) return { ok: false };

      return { ok: true, teams };
    });

    if (!attempt.ok) return { mode: "ERROR", error: attempt.reason };

    // Keep old display behavior: Set 1 first 5, Set 2 remaining (fallback mode only)
    return {
      mode: "FREE_RANDOM",
      set1: attempt.teams.slice(0, 5),
      set2: attempt.teams.slice(5)
    };
  }

  // Config match: STRICT RULES
  const inA = inputCanon.filter(n => groupA.some(a => caseFold(a) === caseFold(n)));
  const inB = inputCanon.filter(n => groupB.some(b => caseFold(b) === caseFold(n)));
  const inC = inputCanon.filter(n => groupC.some(c => caseFold(c) === caseFold(n)));

  // We expect: A=7, B=7, C=6
  // AB => 7 teams, CC => 3 teams
  const attempt = tryBuild(() => {
    const A = shuffle([...inA]);
    const B = shuffle([...inB]);
    const C = shuffle([...inC]);

    // Build AB teams (A with B only)
    const abTeams = [];
    const abPairs = Math.min(A.length, B.length);

    for (let i = 0; i < abPairs; i++) {
      const p1 = A[i];
      const p2 = B[i];
      if (isForbiddenPair(p1, p2, forbiddenPairsSet)) return { ok: false };
      abTeams.push([p1, p2]);
    }

    // If leftover in A or B, only allow singles (but your counts match, so usually none)
    const leftoversAB = A.slice(abPairs).concat(B.slice(abPairs));
    if (leftoversAB.length) {
      if (!allowSingles) return { ok: false };
      for (const l of leftoversAB) abTeams.push([l]);
    }

    // Build CC teams (within C only)
    const cTeams = [];
    const cPool = [...C];

    while (cPool.length >= 2) {
      const p1 = cPool.shift();
      const p2 = cPool.shift();
      if (isForbiddenPair(p1, p2, forbiddenPairsSet)) return { ok: false };
      cTeams.push([p1, p2]);
    }

    if (cPool.length === 1) {
      if (!allowSingles) return { ok: false };
      cTeams.push([cPool.shift()]);
    }

    // We need EXACT split sizes for your scenario:
    // Set1: 3 AB + 2 C
    // Set2: 4 AB + 1 C
    // If CC team count isn't 3 (due to odd C), it may break the exact split.
    if (abTeams.length < 7 || cTeams.length < 3) return { ok: false };

    const { set1, set2 } = splitIntoTwoSets(abTeams, cTeams);
    return { ok: true, set1, set2 };
  });

  if (!attempt.ok) return { mode: "ERROR", error: attempt.reason };

  return { mode: "CONFIG_MATCH", set1: attempt.set1, set2: attempt.set2 };
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
    elStatus.textContent = "Config loaded. Paste names and click Randomizer.";
  } catch (e) {
    CONFIG = { groupA: [], groupB: [], groupC: [], forbiddenPairs: [] };
    elStatus.textContent =
      "Config not loaded (missing config.json). Randomizer will use free random pairing.";
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

  if (result.mode === "CONFIG_MATCH") {
    elStatus.textContent =
      "Rules applied: A-B teams (7) + C-C teams (3). Split: Set 1 = 3 AB + 2 C, Set 2 = 4 AB + 1 C.";
  } else {
    elStatus.textContent =
      "Free random pairing (config not matched) + forbidden pairs. Split: first 5 teams in Set 1, rest in Set 2.";
  }

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

  const result = buildTeamsWithRules(input, CONFIG, elAllowSingles.checked);
  renderOutput(result);
});

elClear.addEventListener("click", () => {
  elNames.value = "";
  elTeams.innerHTML = "";
  elStatus.textContent = "Cleared.";
});

loadConfig();
