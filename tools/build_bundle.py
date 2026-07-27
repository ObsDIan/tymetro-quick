#!/usr/bin/env python3
"""Build data/bundle.js to allow zero-config offline & file:// protocol fallback for 機捷快選."""

import csv
import json
import sys
from pathlib import Path

def main():
    base = Path(__file__).resolve().parent.parent
    stations_path = base / "data" / "stations.csv"
    timetable_path = base / "data" / "timetable.csv"
    version_path = base / "data" / "version.json"
    out_path = base / "data" / "bundle.js"

    with stations_path.open(encoding="utf-8-sig") as f:
        stations = list(csv.DictReader(f))

    with timetable_path.open(encoding="utf-8-sig") as f:
        timetable = list(csv.DictReader(f))

    with version_path.open(encoding="utf-8") as f:
        version = json.load(f)

    bundle = {
        "stations": stations,
        "timetable": timetable,
        "version": version
    }

    with out_path.open("w", encoding="utf-8") as f:
        f.write("window.TYMETRO_STATIC_DATA = ")
        json.dump(bundle, f, ensure_ascii=False)
        f.write(";\n")

    print(f"Generated {out_path} ({len(stations)} stations, {len(timetable)} timetable rows)")

if __name__ == "__main__":
    main()
