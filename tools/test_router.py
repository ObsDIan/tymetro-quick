#!/usr/bin/env python3
"""Test suite for 機捷快選 router logic and data integrity."""

import csv
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def parse_clock(value: str) -> int:
    h, m = value.strip().split(":")
    total = int(h) * 60 + int(m)
    return total + 1440 if total < 240 else total

def calculate_fare(origin_seq: float, dest_seq: float) -> int:
    seq_diff = abs(origin_seq - dest_seq)
    if seq_diff == 0:
        return 0
    if seq_diff <= 1:
        return 30
    if seq_diff <= 3:
        return 35
    if seq_diff <= 5:
        return 60
    if seq_diff <= 8:
        return 90
    if seq_diff <= 11:
        return 130
    if seq_diff <= 13:
        return 150
    return 160

def main():
    base_dir = Path(__file__).resolve().parent.parent
    stations_path = base_dir / "data" / "stations.csv"
    timetable_path = base_dir / "data" / "timetable.csv"

    with stations_path.open(encoding="utf-8-sig") as f:
        stations = list(csv.DictReader(f))

    with timetable_path.open(encoding="utf-8-sig") as f:
        timetable = list(csv.DictReader(f))

    print(f"[TEST] Loading stations: {len(stations)} rows")
    assert len(stations) >= 22, "Stations count should be at least 22"

    seq_map = {s["station_id"]: float(s["seq"]) for s in stations}
    assert "A22" in seq_map, "A22 station missing from stations.csv"

    print("[TEST] Validating fare logic...")
    assert calculate_fare(seq_map["A1"], seq_map["A2"]) == 30, "A1 -> A2 fare should be 30"
    assert calculate_fare(seq_map["A1"], seq_map["A13"]) == 150, "A1 -> A13 fare should be 150"
    assert calculate_fare(seq_map["A1"], seq_map["A22"]) == 160, "A1 -> A22 fare should be 160 capped"
    assert calculate_fare(seq_map["A1"], seq_map["A1"]) == 0, "A1 -> A1 fare should be 0"

    print("[TEST] Validating timetable runs...")
    runs = set(r["train_id"] for r in timetable)
    assert len(runs) > 100, f"Expected > 100 train runs, found {len(runs)}"

    print("[SUCCESS] All Python router & data integration tests passed successfully!")
    return 0

if __name__ == "__main__":
    sys.exit(main())
