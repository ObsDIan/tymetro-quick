#!/usr/bin/env python3
"""Validate station and timetable CSV files for 機捷快選."""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

REQUIRED_STATION_HEADERS = {"station_id", "station_name", "seq"}
REQUIRED_TIMETABLE_HEADERS = {"service_type", "direction", "train_id", "train_type", "station_id", "time"}


def parse_time(value: str) -> int:
    h, m = value.strip().split(":")
    hour = int(h)
    minute = int(m)
    if hour < 0 or hour > 27 or minute < 0 or minute > 59:
        raise ValueError(value)
    total = hour * 60 + minute
    return total + 1440 if total < 240 else total


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python tools/validate_data.py data/stations.csv data/timetable.csv", file=sys.stderr)
        return 2

    stations_path = Path(sys.argv[1])
    timetable_path = Path(sys.argv[2])
    stations = read_csv(stations_path)
    timetable = read_csv(timetable_path)

    errors: list[str] = []
    warnings: list[str] = []

    if not stations:
        errors.append("stations.csv is empty")
    if not timetable:
        errors.append("timetable.csv is empty")

    station_headers = set(stations[0].keys()) if stations else set()
    timetable_headers = set(timetable[0].keys()) if timetable else set()
    missing_station = REQUIRED_STATION_HEADERS - station_headers
    missing_timetable = REQUIRED_TIMETABLE_HEADERS - timetable_headers
    if missing_station:
        errors.append(f"stations.csv missing headers: {sorted(missing_station)}")
    if missing_timetable:
        errors.append(f"timetable.csv missing headers: {sorted(missing_timetable)}")

    station_ids: set[str] = set()
    seqs: dict[str, float] = {}
    for row in stations:
        sid = row.get("station_id", "").strip()
        if not sid:
            errors.append("stations.csv contains blank station_id")
            continue
        if sid in station_ids:
            errors.append(f"duplicate station_id: {sid}")
        station_ids.add(sid)
        try:
            seqs[sid] = float(row.get("seq", ""))
        except ValueError:
            errors.append(f"invalid seq for {sid}: {row.get('seq')}")

    grouped: dict[tuple[str, str, str, str], list[tuple[str, int]]] = defaultdict(list)
    directions = set()
    train_types = set()
    services = set()
    for idx, row in enumerate(timetable, start=2):
        sid = row.get("station_id", "").strip()
        if sid not in station_ids:
            errors.append(f"line {idx}: unknown station_id {sid!r}")
        try:
            minute = parse_time(row.get("time", ""))
        except Exception:
            errors.append(f"line {idx}: invalid time {row.get('time')!r}")
            continue
        key = (
            row.get("service_type", "").strip(),
            row.get("direction", "").strip(),
            row.get("train_type", "").strip(),
            row.get("train_id", "").strip(),
        )
        if not key[3]:
            errors.append(f"line {idx}: blank train_id")
        grouped[key].append((sid, minute))
        services.add(key[0])
        directions.add(key[1])
        train_types.add(key[2])

    short_runs = 0
    non_monotonic = 0
    for key, stops in grouped.items():
        if len(stops) < 2:
            short_runs += 1
            continue
        minutes = [m for _, m in stops]
        if any(b < a for a, b in zip(minutes, minutes[1:])):
            non_monotonic += 1

    if short_runs:
        warnings.append(f"{short_runs} train runs have fewer than 2 stops; route planning may ignore them")
    if non_monotonic:
        warnings.append(f"{non_monotonic} train runs have non-monotonic times; check direction/order or after-midnight rows")
    if not {"south", "north"}.issubset(directions):
        warnings.append(f"directions found: {sorted(directions)}; expected both south and north when using normalized CSV")
    if not {"local", "express"}.intersection(train_types):
        warnings.append(f"train types found: {sorted(train_types)}; expected local/express normalized values")

    print(f"Stations: {len(stations)}")
    print(f"Timetable rows: {len(timetable)}")
    print(f"Train runs: {len(grouped)}")
    print(f"Services: {', '.join(sorted(services))}")
    print(f"Directions: {', '.join(sorted(directions))}")
    print(f"Train types: {', '.join(sorted(train_types))}")

    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
