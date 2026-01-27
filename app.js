// ---------- Utilities ----------
function linesToList(text) {
  return text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizePair(a, b) {
  return (a < b) ? `${a}||${b}` : `${b}||${a}`;
}

// Deterministic PRNG if seed provided (Mulberry32)
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
}

function makeRng(seedStr) {
  if (!seedStr) return Math.random;
  // hash string -> uint32
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return mulberry32(h >>> 0);
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function allWithinTeamPairs(team) {
  const pairs = [];
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      pairs.push(normalizePair(team[i], team[j]));
    }
  }
  return pairs;
}

// ---------- History ----------
const HISTORY_KEY = "badminton_pair_history_v1";

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(parsed.pairs || []);
  } catch {
    return new Set();
  }
}

function saveHistory(set) {
  const pairs = Array.from(set);
  localStorage.setItem(HISTORY_KEY, JSON.stringify({ pairs }, null, 2));
}

// ---------- Team generation ----------
function generateMixed(players, teamSize, rng) {
  const list = [...players];
  shuffle(list, rng);
  if (list.length % teamSize !== 0) {
    throw new Error(`Player count (${list.length}) must be divisible by team size (${teamSize}).`);
  }
  const teams = [];
  for (let i = 0; i < list.length; i += teamSize) {
    teams.push(list.slice(i, i + teamSize));
  }
  return teams;
}

function generatePoolsHidden(poolA, poolB, rng) {
  if (poolA.length !== poolB.length) {
    throw new Error(`Pool sizes must match. A=${poolA.length}, B=${poolB.length}.`);
  }
  const a = shuffle([...poolA], rng);
  const b = shuffle([...poolB], rng);
  const teams = [];
  for (let i = 0; i < a.length; i++) {
    teams.push([a[i], b[i]]);
  }
  return teams;
}

function teamsRepeatAnyPair(teams, historySet) {
  for (const t of teams) {
    const pairs = allWithinTeamPairs(t);
    for (const p of pairs) {
      if (historySet.has(p)) return true;
    }
  }
  return false;
}

function addTeamsToHistory(teams, historySet) {
  for (const t of teams) {
    for (const p of allWithinTeamPairs(t)) historySet.add(p);
  }
}

// ---------- UI ----------
const modeEl = document.getElementById("mode");
const mixedBlock = document.getElementById("mixedBlock");
const poolsBlock = document.getElementById("poolsBlock");
const playersMixedEl = document.getElementById("playersMixed");
const teamSizeEl = document.getElementById("teamSize");
const poolAEl = document.getElementById("poolA");
const poolBEl = document.getElementById("poolB");
const avoidRepeatsEl = document.getElementById("avoidRepeats");
const seedEl = document.getElementById("seed");
const statusEl = document.getElementById("status");
const teamsEl = document.getElementById("teams");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function renderTeams(teams) {
  teamsEl.innerHTML = "";
  teams.forEach((team, idx) => {
    const box = document.createElement("div");
    box.className = "team";
    const title = document.createElement("strong");
    title.textContent = `Team ${String(idx + 1).padStart(2, "0")}`;
    const pills = document.createElement("div");
    pills.className = "pills";
    team.forEach(name => {
      const p = document.createElement("span");
      p.className = "pill";
      p.textContent = name;
      pills.appendChild(p);
    });
    box.appendChild(title);
    box.appendChild(pills);
    teamsEl.appendChild(box);
  });
}

function currentTeamsText() {
  const boxes = [...teamsEl.querySelectorAll(".team")];
  return boxes.map(b => {
    const title = b.querySelector("strong")?.textContent || "";
    const names = [...b.querySelectorAll(".pill")].map(x => x.textContent).join(" & ");
    return `${title}: ${names}`;
  }).join("\n");
}

modeEl.addEventListener("change", () => {
  const m = modeEl.value;
  mixedBlock.classList.toggle("hidden", m !== "mixed");
  poolsBlock.classList.toggle("hidden", m !== "pools_hidden");
});

document.getElementById("generate").addEventListener("click", () => {
  try {
    const mode = modeEl.value;
    const rng = makeRng(seedEl.value.trim());
    const avoid = avoidRepeatsEl.checked;
    const history = avoid ? loadHistory() : new Set();
    const MAX_TRIES = 2000;

    let teams = null;

    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      if (mode === "mixed") {
        const players = linesToList(playersMixedEl.value);
        const teamSize = parseInt(teamSizeEl.value, 10);
        teams = generateMixed(players, teamSize, rng);
      } else {
        // pools_hidden
        const poolA = linesToList(poolAEl.value);
        const poolB = linesToList(poolBEl.value);
        teams = generatePoolsHidden(poolA, poolB, rng);
      }

      if (!avoid || !teamsRepeatAnyPair(teams, history)) {
        setStatus(avoid ? `Generated (no repeat pairs).` : `Generated.`);
        break;
      }
      teams = null;
    }

    if (!teams) {
      throw new Error("Could not generate without repeating pairs. Try disabling 'Avoid repeat pairs' or clear history.");
    }

    renderTeams(teams);

    if (avoid) {
      addTeamsToHistory(teams, history);
      saveHistory(history);
    }
  } catch (e) {
    setStatus(String(e.message || e));
    teamsEl.innerHTML = "";
  }
});

document.getElementById("copy").addEventListener("click", async () => {
  const text = currentTeamsText();
  if (!text) return setStatus("Nothing to copy yet.");
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.");
  } catch {
    setStatus("Copy failed (browser blocked).");
  }
});

document.getElementById("csv").addEventListener("click", () => {
  const boxes = [...teamsEl.querySelectorAll(".team")];
  if (!boxes.length) return setStatus("Nothing to export yet.");

  const rows = [["Team", "Players"]];
  boxes.forEach(b => {
    const team = b.querySelector("strong")?.textContent || "";
    const players = [...b.querySelectorAll(".pill")].map(x => x.textContent).join(" & ");
    rows.push([team, players]);
  });

  const csv = rows.map(r => r.map(x => `"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "teams.csv";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("CSV exported.");
});

document.getElementById("clearHistory").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  setStatus("Repeat history cleared.");
});

document.getElementById("reset").addEventListener("click", () => {
  playersMixedEl.value = "";
  poolAEl.value = "";
  poolBEl.value = "";
  seedEl.value = "";
  teamsEl.innerHTML = "";
  setStatus("Reset.");
});

document.getElementById("loadSample").addEventListener("click", () => {
  // Your sample data
  const A = ["Vishal","Chandu","Sasi","Shibin","Kurian","Karthik","Sanath","Chary","Raviteja","Siddharth"];
  const B = ["Martin","Illango","Praveen","Vikas","Ram","Vivek","Guru","Ajay","Vijay","Vineeth"];

  playersMixedEl.value = [...A, ...B].join("\n");
  poolAEl.value = A.join("\n");
  poolBEl.value = B.join("\n");
  setStatus("Sample loaded.");
});
