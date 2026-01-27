import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hidden groups (backend only)
const GROUP_A = ["Vishal","Chandu","Sasi","Shibin","Kurian","Karthik","Sanath","Chary","Raviteja","Siddharth"];
const GROUP_B = ["Martin","Illango","Praveen","Vikas","Ram","Vivek","Guru","Ajay","Vijay","Vineeth"];

// ---- Block rules (order independent) ----
function keyPair(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const BLOCKED_PAIRS = new Set([
  keyPair("Vineeth", "Kurian"),
  keyPair("Martin", "Chary"),
  keyPair("Guru", "Siddharth"),
  keyPair("Vijay", "Vivek"),
  keyPair("Praveen", "Chandu"),
]);

function isBlocked(a, b) {
  return BLOCKED_PAIRS.has(keyPair(a, b));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// In-memory decks (no repeats until exhausted)
let deckA = [];
let deckB = [];

function resetDeck() {
  deckA = shuffle(GROUP_A);
  deckB = shuffle(GROUP_B);
}
resetDeck();

/**
 * Returns ONE new pair each call, avoiding blocked combos.
 * If remaining decks cannot produce a valid pair due to block rules,
 * it reshuffles and returns 409 asking user to click again.
 */
app.get("/api/next-pair", (req, res) => {
  if (deckA.length === 0 || deckB.length === 0) resetDeck();

  // We'll try to pick an A, then find a compatible B from remaining deckB
  const triedA = [];

  while (deckA.length > 0) {
    const a = deckA.pop();
    triedA.push(a);

    // Find any B that isn't blocked with this A
    let foundIndex = -1;
    for (let i = deckB.length - 1; i >= 0; i--) {
      const b = deckB[i];
      if (!isBlocked(a, b)) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== -1) {
      const b = deckB.splice(foundIndex, 1)[0];

      // Put unused triedA back into deckA (shuffle a bit to keep randomness)
      const unusedA = triedA.slice(0, -1);
      if (unusedA.length) deckA.push(...shuffle(unusedA));

      return res.json({
        team: [a, b],
        remaining: Math.min(deckA.length, deckB.length),
      });
    }

    // If no valid B exists for this A, continue with next A
  }

  // No valid pairing possible with remaining deck state — reshuffle
  resetDeck();

  // Feasibility check after reshuffle
  const feasible = deckA.some(a => deckB.some(b => !isBlocked(a, b)));
  if (!feasible) {
    return res.status(422).json({
      error: "No valid pairings possible with the blocked pairs provided as they played last tournament. Please relax the blocked rules.",
    });
  }

  return res.status(409).json({
    error: "Blocked pairs prevented a valid next team from the remaining names. Deck reshuffled — click Next Team again.",
  });
});

app.post("/api/reset", (req, res) => {
  resetDeck();
  res.json({ ok: true, remaining: Math.min(deckA.length, deckB.length) });
});

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
