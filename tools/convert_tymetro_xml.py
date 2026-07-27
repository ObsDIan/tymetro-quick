#!/usr/bin/env python3
"""Convert Taoyuan Metro StationTimeTable XML into the CSV files used by 機捷快選.

Supported source schema (桃園捷運站別時刻表資料):
- StationTimeTable / StationID / StationName / Direction / DestinationStaionID
- Timetables / Timetable / Sequence / ArrivalTime / DepartureTime / TrainType
- ServiceDays / ServiceTag

The source is a station-level timetable, not a trip-level timetable. For route
planning we reconstruct train runs by grouping rows with the same:
service_type + direction + destination_station + train_type + sequence.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from statistics import median
from datetime import date
from pathlib import Path
from typing import Iterable

TIME_RE = re.compile(r"^([0-2]?\d):([0-5]\d)$")

# Current/open-data encoding observed in StationTimeTable.xml:
# 0 = 普通車, 2 = 直達車. Keep 1 as local for compatibility with other feeds.
TRAIN_TYPE_MAP = {
    "0": "local",
    "1": "local",
    "2": "express",
    "local": "local",
    "普通": "local",
    "普通車": "local",
    "一般": "local",
    "express": "express",
    "直達": "express",
    "直達車": "express",
    "快速": "express",
    "跳站": "express",
}

STATION_ORDER = {
    "A1": 1,
    "A2": 2,
    "A3": 3,
    "A4": 4,
    "A5": 5,
    "A6": 6,
    "A7": 7,
    "A8": 8,
    "A9": 9,
    "A10": 10,
    "A11": 11,
    "A12": 12,
    "A13": 13,
    "A14a": 14.5,
    "A15": 15,
    "A16": 16,
    "A17": 17,
    "A18": 18,
    "A19": 19,
    "A20": 20,
    "A21": 21,
    "A22": 22,
    "A23": 23,
}


def clean_tag(tag: str) -> str:
    return tag.split("}")[-1]


def child_text(elem: ET.Element, *names: str) -> str:
    names_l = {n.lower() for n in names}
    for child in list(elem):
        if clean_tag(child.tag).lower() in names_l:
            return " ".join(t.strip() for t in child.itertext() if t and t.strip())
    return ""


def nested_text(elem: ET.Element, path: str) -> str:
    current: ET.Element | None = elem
    for part in path.split("/"):
        if current is None:
            return ""
        found = None
        for child in list(current):
            if clean_tag(child.tag).lower() == part.lower():
                found = child
                break
        current = found
    if current is None:
        return ""
    return " ".join(t.strip() for t in current.itertext() if t and t.strip())


def normalize_direction(value: str) -> str:
    v = value.strip().lower()
    if v in {"0", "south", "s", "down", "outbound", "去程", "往機場", "往中壢", "往環北", "往老街溪"}:
        return "south"
    if v in {"1", "north", "n", "up", "inbound", "返程", "往台北", "往台北車站"}:
        return "north"
    if "台北" in v:
        return "north"
    if any(token in v for token in ["機場", "中壢", "環北", "老街溪"]):
        return "south"
    return v or "unknown"


def normalize_train_type(value: str) -> str:
    v = value.strip().lower()
    return TRAIN_TYPE_MAP.get(v, v or "unknown")


def normalize_service_days(service_days: ET.Element | None) -> list[str]:
    if service_days is None:
        return ["daily"]
    tag = child_text(service_days, "ServiceTag").strip().lower()
    if tag in {"每日", "每天", "daily", "all"}:
        return ["daily"]
    if tag in {"平日", "weekday", "workday", "工作日"}:
        return ["weekday"]
    if tag in {"假日", "weekend", "holiday", "週末", "周末"}:
        return ["weekend"]

    def is_true(name: str) -> bool:
        return child_text(service_days, name).strip().lower() == "true"

    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    weekends = ["Saturday", "Sunday", "NationalHolidays"]
    has_weekday = any(is_true(d) for d in weekdays)
    has_weekend = any(is_true(d) for d in weekends)
    if has_weekday and has_weekend:
        return ["daily"]
    if has_weekday:
        return ["weekday"]
    if has_weekend:
        return ["weekend"]
    return ["daily"]


def parse_time(value: str) -> str | None:
    v = value.strip()
    m = TIME_RE.match(v)
    if not m:
        return None
    h = int(m.group(1))
    minute = int(m.group(2))
    if h > 27 or minute > 59:
        return None
    return f"{h:02d}:{minute:02d}"


def station_sort_key(station_id: str) -> float:
    if station_id in STATION_ORDER:
        return STATION_ORDER[station_id]
    m = re.match(r"A(\d+)([a-z]?)$", station_id, re.I)
    if not m:
        return 9999
    base = int(m.group(1))
    suffix = m.group(2).lower()
    return base + (0.5 if suffix else 0)


def seq_to_str(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return str(value)


def iter_station_time_tables(root: ET.Element) -> Iterable[ET.Element]:
    for elem in root.iter():
        if clean_tag(elem.tag) == "StationTimeTable":
            yield elem


def normalized_minute(time_value: str) -> int:
    h, m = [int(x) for x in time_value.split(":")]
    total = h * 60 + m
    return total + 1440 if total < 240 else total


def denormalize_minute(minute: int) -> str:
    minute = minute % 1440
    return f"{minute // 60:02d}:{minute % 60:02d}"


def max_segment_gap(train_type: str, from_station: str, to_station: str) -> int:
    """Loose upper bound used only to reconstruct runs from station-level times.

    Local adjacent-station gaps are usually a few minutes; express gaps can be
    much longer because skipped stations are absent from the group. The bound is
    intentionally loose enough to handle A1→A8/A8→A12 express segments but tight
    enough to avoid linking the next headway as the same train.
    """
    if train_type == "express":
        return 45
    return 12


def reconstruct_runs(group_events: dict[tuple[str, str, str, str], list[dict[str, object]]]) -> list[dict[str, object]]:
    all_runs: list[dict[str, object]] = []

    for (service_type, direction, destination_id, train_type), events in group_events.items():
        reverse = direction == "north"
        station_ids = sorted({str(e["station_id"]) for e in events}, key=station_sort_key, reverse=reverse)
        station_index = {sid: idx for idx, sid in enumerate(station_ids)}
        events_by_station: dict[str, list[dict[str, object]]] = defaultdict(list)
        for event in events:
            events_by_station[str(event["station_id"])].append(event)
        for station_events in events_by_station.values():
            station_events.sort(key=lambda e: (int(e["minute"]), int(e["sequence"])))

        active: list[dict[str, object]] = []
        finalized: list[dict[str, object]] = []

        for sid in station_ids:
            idx = station_index[sid]
            station_events = events_by_station.get(sid, [])
            used_run_ids: set[int] = set()

            for event in station_events:
                event_minute = int(event["minute"])
                best_i = None
                best_gap = None

                for i, run in enumerate(active):
                    if id(run) in used_run_ids:
                        continue
                    last_idx = int(run["last_idx"])
                    if last_idx != idx - 1:
                        continue
                    last_stop = run["stops"][-1]
                    last_minute = int(last_stop["minute"])
                    gap = event_minute - last_minute
                    if gap <= 0:
                        continue
                    if gap > max_segment_gap(train_type, str(last_stop["station_id"]), sid):
                        continue
                    # Prefer the closest previous stop. This handles offset
                    # sequences when early trains start at intermediate stations.
                    if best_gap is None or gap < best_gap:
                        best_i = i
                        best_gap = gap

                if best_i is None:
                    run = {
                        "service_type": service_type,
                        "direction": direction,
                        "destination_id": destination_id,
                        "train_type": train_type,
                        "last_idx": idx,
                        "stops": [event],
                    }
                    active.append(run)
                    used_run_ids.add(id(run))
                else:
                    run = active[best_i]
                    run["stops"].append(event)
                    run["last_idx"] = idx
                    used_run_ids.add(id(run))

            # Runs that did not reach this station and are now more than one stop
            # behind can no longer be extended in this station-ordered pass.
            still_active = []
            for run in active:
                if int(run["last_idx"]) < idx - 1:
                    finalized.append(run)
                else:
                    still_active.append(run)
            active = still_active

        finalized.extend(active)

        run_counter = 1
        for run in finalized:
            stops = run["stops"]
            if len(stops) < 2:
                continue
            run["train_id"] = f"{service_type}-{direction}-{destination_id or 'NA'}-{train_type}-{run_counter:03d}"
            run_counter += 1
            all_runs.append(run)

    return all_runs


def synthesize_terminal_arrivals(runs: list[dict[str, object]], stations: dict[str, dict[str, str]]) -> int:
    """Add terminal arrival stops missing from station departure-only XML records.

    StationTimeTable records usually list departures in a direction, so terminal
    arrivals such as A2→A1 or A12→A13 are not present as StationTimeTable rows.
    The app needs those terminal arrivals to answer routes ending at A1/A13/A21.
    We estimate only the final segment using the median observed adjacent segment
    duration, preferring the same train type and allowing the reverse direction.
    """
    durations: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for run in runs:
        stops = sorted(run["stops"], key=lambda s: int(s["minute"]))
        for a, b in zip(stops, stops[1:]):
            sid_a = str(a["station_id"])
            sid_b = str(b["station_id"])
            diff = int(b["minute"]) - int(a["minute"])
            if 0 < diff <= 60:
                durations[(str(run["train_type"]), sid_a, sid_b)].append(diff)

    def estimate(train_type: str, from_sid: str, to_sid: str) -> int | None:
        candidates = durations.get((train_type, from_sid, to_sid))
        if candidates:
            return int(round(median(candidates)))
        reverse = durations.get((train_type, to_sid, from_sid))
        if reverse:
            return int(round(median(reverse)))
        # Fallback across train types for adjacent terminal segments.
        any_type = []
        for (tt, a, b), values in durations.items():
            if (a, b) == (from_sid, to_sid) or (a, b) == (to_sid, from_sid):
                any_type.extend(values)
        if any_type:
            return int(round(median(any_type)))
        return None

    added = 0
    for run in runs:
        destination_id = str(run.get("destination_id") or "")
        if not destination_id or destination_id not in stations:
            continue
        if any(str(s["station_id"]) == destination_id for s in run["stops"]):
            continue
        stops = sorted(run["stops"], key=lambda s: int(s["minute"]))
        if not stops:
            continue
        last = stops[-1]
        last_sid = str(last["station_id"])
        direction = str(run["direction"])
        last_seq = float(stations[last_sid]["seq"])
        dest_seq = float(stations[destination_id]["seq"])
        if direction == "south" and not (last_seq < dest_seq):
            continue
        if direction == "north" and not (last_seq > dest_seq):
            continue
        gap = estimate(str(run["train_type"]), last_sid, destination_id)
        if gap is None:
            continue
        run["stops"].append({
            "station_id": destination_id,
            "time": denormalize_minute(int(last["minute"]) + gap),
            "minute": int(last["minute"]) + gap,
            "sequence": 9999,
            "synthetic": True,
        })
        added += 1
    return added


def convert(xml_path: Path) -> tuple[list[dict[str, str]], list[dict[str, str]], dict[str, object]]:
    root = ET.parse(xml_path).getroot()
    stations: dict[str, dict[str, str]] = {}
    group_events: dict[tuple[str, str, str, str], list[dict[str, object]]] = defaultdict(list)
    train_type_counts: Counter[str] = Counter()
    source_updates: list[str] = []
    update_times: list[str] = []

    for record in iter_station_time_tables(root):
        station_id = child_text(record, "StationID").strip()
        station_name = nested_text(record, "StationName/Zh_tw").strip() or station_id
        direction = normalize_direction(child_text(record, "Direction").strip())
        destination_id = child_text(record, "DestinationStaionID", "DestinationStationID").strip()
        service_days_elem = next((c for c in list(record) if clean_tag(c.tag) == "ServiceDays"), None)
        service_types = normalize_service_days(service_days_elem)
        src_update = child_text(record, "SrcUpdateTime").strip()
        update = child_text(record, "UpdateTime").strip()
        if src_update:
            source_updates.append(src_update)
        if update:
            update_times.append(update)

        if not station_id:
            continue
        stations[station_id] = {
            "station_id": station_id,
            "station_name": station_name,
            "seq": seq_to_str(station_sort_key(station_id)),
            "is_express_stop": "false",
        }

        timetable_holder = next((c for c in list(record) if clean_tag(c.tag) == "Timetables"), None)
        if timetable_holder is None:
            continue

        for item in [c for c in list(timetable_holder) if clean_tag(c.tag) == "Timetable"]:
            sequence_raw = child_text(item, "Sequence").strip()
            time = parse_time(child_text(item, "DepartureTime").strip() or child_text(item, "ArrivalTime").strip())
            train_type = normalize_train_type(child_text(item, "TrainType").strip())
            if not sequence_raw or not time or train_type == "unknown":
                continue
            try:
                sequence = int(sequence_raw)
            except ValueError:
                continue
            minute = normalized_minute(time)
            train_type_counts[train_type] += 1
            for service_type in service_types:
                group_events[(service_type, direction, destination_id, train_type)].append({
                    "station_id": station_id,
                    "time": time,
                    "minute": minute,
                    "sequence": sequence,
                })

    runs = reconstruct_runs(group_events)
    synthesized_terminal_stops = synthesize_terminal_arrivals(runs, stations)
    rows: list[dict[str, str]] = []
    express_stations: set[str] = set()
    for run in runs:
        train_id = str(run["train_id"])
        for stop in run["stops"]:
            sid = str(stop["station_id"])
            if run["train_type"] == "express":
                express_stations.add(sid)
            rows.append({
                "service_type": str(run["service_type"]),
                "direction": str(run["direction"]),
                "train_id": train_id,
                "train_type": str(run["train_type"]),
                "station_id": sid,
                "time": denormalize_minute(int(stop["minute"])),
            })

    for sid in express_stations:
        if sid in stations:
            stations[sid]["is_express_stop"] = "true"

    station_rows = sorted(stations.values(), key=lambda r: float(r["seq"]))
    seq_by_station = {s["station_id"]: float(s["seq"]) for s in station_rows}
    rows.sort(key=lambda r: (
        r["service_type"],
        r["direction"],
        r["train_id"],
        normalized_minute(r["time"]),
        seq_by_station.get(r["station_id"], 9999),
    ))

    meta = {
        "source_update_time_min": min(source_updates) if source_updates else None,
        "source_update_time_max": max(source_updates) if source_updates else None,
        "update_time_min": min(update_times) if update_times else None,
        "update_time_max": max(update_times) if update_times else None,
        "train_type_counts": dict(train_type_counts),
        "reconstructed_runs": len(runs),
        "raw_event_count": sum(len(v) for v in group_events.values()),
        "synthesized_terminal_stops": synthesized_terminal_stops,
    }
    return station_rows, rows, meta

def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert Taoyuan Metro StationTimeTable XML to 機捷快選 CSV files.")
    parser.add_argument("xml", type=Path, help="Downloaded StationTimeTable XML file")
    parser.add_argument("--out", type=Path, default=Path("data/timetable.csv"), help="Output timetable CSV")
    parser.add_argument("--stations", type=Path, default=Path("data/stations.csv"), help="Output stations CSV")
    parser.add_argument("--version", type=Path, default=Path("data/version.json"), help="Output version JSON")
    parser.add_argument("--data-version", default=None, help="Human-readable data version label")
    args = parser.parse_args()

    station_rows, rows, meta = convert(args.xml)
    if not station_rows or not rows:
        print("No usable rows were parsed. Please inspect the XML schema.", file=sys.stderr)
        return 1

    write_csv(args.stations, ["station_id", "station_name", "seq", "is_express_stop"], station_rows)
    write_csv(args.out, ["service_type", "direction", "train_id", "train_type", "station_id", "time"], rows)

    data_version = args.data_version
    if not data_version:
        data_version = meta.get("source_update_time_max") or f"converted-{date.today().isoformat()}"

    version = {
        "app_version": "0.1.1",
        "data_version": data_version,
        "updated_at": date.today().isoformat(),
        "valid_until": None,
        "is_demo": False,
        "source": "使用者上傳 StationTimeTable.xml（桃園捷運站別時刻表資料格式）",
        "source_update_time": meta.get("source_update_time_max"),
        "xml_update_time": meta.get("update_time_max"),
        "note": "此版本由上傳 XML 轉換。正式通勤前請確認 XML 是否為最新官方資料；若官方班表更新，請重新轉換並發布。",
    }
    args.version.parent.mkdir(parents=True, exist_ok=True)
    with args.version.open("w", encoding="utf-8") as f:
        json.dump(version, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Wrote {len(station_rows)} stations to {args.stations}")
    print(f"Wrote {len(rows)} timetable rows to {args.out}")
    print(f"Wrote metadata to {args.version}")
    if meta.get("source_update_time_max"):
        print(f"Source update time: {meta['source_update_time_max']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
