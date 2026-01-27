import json
import os
import random
import sys
from typing import List, Tuple, Dict, Set, Optional

Pair = Tuple[str, str]

def normalize_pair(a: str, b: str) -> Pair:
    return (a, b) if a < b else (b, a)

def load_json(path: str, default):
    if not path:
        return default
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path: str, data) -> None:
    if not path:
        return
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def load_pair_history(history_file: str) -> Set[Pair]:
    data = load_json(history_file, default={"pairs": []})
    pairs = set()
    for item in data.get("pairs", []):
        if isinstance(item, list) and len(item) == 2:
            pairs.add(normalize_pair(item[0], item[1]))
    return pairs

def append_pair_history(history_file: str, new_pairs: List[Pair]) -> None:
    data = load_json(history_file, default={"pairs": []})
    existing = {tuple(x) for x in data.get("pairs", []) if isinstance(x, list) and len(x) == 2}
    for a, b in new_pairs:
        existing.add((a, b))
    data["pairs"] = [list(x) for x in sorted(existing)]
    save_json(history_file, data)

def generate_teams_mixed(players: List[str], team_size: int) -> List[List[str]]:
    players = players[:]
    random.shuffle(players)
    teams = [players[i:i+team_size] for i in range(0, len(players), team_size)]
    if any(len(t) != team_size for t in teams):
        raise ValueError(f"Player count {len(players)} not divisible by team_size {team_size}.")
    return teams

def generate_teams_pools_hidden(pools: Dict[str, List[str]]) -> List[List[str]]:
    # Default: form teams by pairing one from each pool (supports 2 pools of equal size)
    keys = list(pools.keys())
    if len(keys) != 2:
        raise ValueError("pools_hidden mode currently supports exactly 2 pools (e.g., A and B).")
    a = pools[keys[0]][:]
    b = pools[keys[1]][:]
    if len(a) != len(b):
        raise ValueError("Both pools must have the same number of players.")
    random.shuffle(a)
    random.shuffle(b)
    return [[a[i], b[i]] for i in range(len(a))]

def teams_to_pairs(teams: List[List[str]]) -> List[Pair]:
    # For team_size=2, team pair is the partnership.
    # For team_size>2, record all within-team combinations as "pairings".
    pairs: List[Pair] = []
    for t in teams:
        for i in range(len(t)):
            for j in range(i+1, len(t)):
                pairs.append(normalize_pair(t[i], t[j]))
    return pairs

def try_generate_with_constraints(make_teams_fn, max_tries: int, avoid_pairs: Set[Pair]) -> List[List[str]]:
    for _ in range(max_tries):
        teams = make_teams_fn()
        pairs = teams_to_pairs(teams)
        if not any(p in avoid_pairs for p in pairs):
            return teams
    # If we fail, just return the last attempt (or raise)
    raise RuntimeError(f"Could not generate teams without repeating pairs after {max_tries} tries.")

def main(config_path: str) -> None:
    cfg = load_json(config_path, default=None)
    if not cfg:
        raise ValueError(f"Config not found or empty: {config_path}")

    seed = cfg.get("seed", None)
    if seed is not None:
        random.seed(seed)

    mode = cfg.get("mode", "mixed")
    team_size = int(cfg.get("team_size", 2))
    avoid_repeat = bool(cfg.get("avoid_repeat_pairs", False))
    history_file = cfg.get("history_file", "")

    avoid_pairs: Set[Pair] = set()
    if avoid_repeat and history_file:
        avoid_pairs = load_pair_history(history_file)

    max_tries = int(cfg.get("max_tries", 2000))

    if mode == "mixed":
        players = cfg.get("players", [])
        if not isinstance(players, list) or not players:
            raise ValueError("mode=mixed requires a non-empty 'players' list.")

        def maker():
            return generate_teams_mixed(players, team_size)

    elif mode == "pools_hidden":
        pools = cfg.get("pools", {})
        if not isinstance(pools, dict) or not pools:
            raise ValueError("mode=pools_hidden requires 'pools' object.")

        def maker():
            return generate_teams_pools_hidden(pools)

        # team_size implied as 2 for pools_hidden pairing
        team_size = 2

    else:
        raise ValueError(f"Unknown mode: {mode}")

    if avoid_repeat:
        teams = try_generate_with_constraints(maker, max_tries=max_tries, avoid_pairs=avoid_pairs)
    else:
        teams = maker()

    # Output
    print("\n=== Teams ===")
    for i, t in enumerate(teams, 1):
        print(f"Team {i:02d}: " + "  &  ".join(t))

    # Save history
    if avoid_repeat and history_file:
        new_pairs = teams_to_pairs(teams)
        append_pair_history(history_file, new_pairs)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python team_randomizer.py config.json")
        sys.exit(1)
    main(sys.argv[1])
