#!/usr/bin/env python3
# backend/scripts/clip-pbf.py
#
# Clip a bounding box out of an .osm.pbf extract and emit an Overpass-JSON
# "elements" array (the exact shape parseOverpassElements() expects), so the
# result can be pushed through the same importer used for the OPL pilot.
#
# Three passes over the source file keep it simple and memory-safe:
#   1. collect nodes whose location is inside the box
#   2. collect ways with a 'highway' tag that have >=2 member nodes in the box
#      (recording every node id they reference, including endpoints just outside)
#   3. collect the node records for exactly those references
#
# Only 'highway' ways are emitted; relations are not needed by the parser.
#
# Usage:
#   python scripts/clip-pbf.py <in.pbf> <out.json> minLat minLng maxLat maxLng

import json
import os
import sys

import osmium


class BoundingBox:
    def __init__(self, min_lat, min_lng, max_lat, max_lng):
        self.min_lat = float(min_lat)
        self.min_lng = float(min_lng)
        self.max_lat = float(max_lat)
        self.max_lng = float(max_lng)

    def contains(self, lat, lng):
        return (
            self.min_lat <= lat <= self.max_lat
            and self.min_lng <= lng <= self.max_lng
        )


class InBoxNodes(osmium.SimpleHandler):
    def __init__(self, box):
        super().__init__()
        self.box = box
        self.ids = set()
        self.total = 0

    def node(self, n):
        self.total += 1
        loc = n.location
        if self.box.contains(loc.lat, loc.lon):
            self.ids.add(n.id)


class HighwayWays(osmium.SimpleHandler):
    def __init__(self, in_box_ids):
        super().__init__()
        self.in_box_ids = in_box_ids
        self.ways = []  # (way_id, [node_ids], {tags})
        self.refs = set()

    def way(self, w):
        if not w.tags or "highway" not in w.tags:
            return
        refs = [n.ref for n in w.nodes]
        if len(refs) < 2:
            return
        inside = sum(1 for r in refs if r in self.in_box_ids)
        if inside < 2:
            return
        self.ways.append((w.id, refs, dict(w.tags)))
        self.refs.update(refs)


class RefNodes(osmium.SimpleHandler):
    def __init__(self, wanted):
        super().__init__()
        self.wanted = wanted
        self.nodes = []  # (node_id, lat, lon)

    def node(self, n):
        if n.id not in self.wanted:
            return
        loc = n.location
        self.nodes.append((n.id, loc.lat, loc.lon))


def main():
    if len(sys.argv) != 7:
        print(
            "Usage: python scripts/clip-pbf.py <in.pbf> <out.json> minLat minLng maxLat maxLng",
            file=sys.stderr,
        )
        return 2

    in_pbf, out_json = sys.argv[1], sys.argv[2]
    box = BoundingBox(*sys.argv[3:7])
    if not (
        box.min_lat < box.max_lat and box.min_lng < box.max_lng
    ):
        print("bbox corners are backwards (min must be < max)", file=sys.stderr)
        return 2

    print(f"[ClipPbf] Pass 1/3: nodes inside box...", flush=True)
    s1 = InBoxNodes(box)
    s1.apply_file(in_pbf, locations=True)
    print(f"[ClipPbf]   {len(s1.ids)} / {s1.total} nodes in box ({box.min_lat},{box.min_lng},{box.max_lat},{box.max_lng})", flush=True)

    print(f"[ClipPbf] Pass 2/3: highway ways with >=2 in-box nodes...", flush=True)
    s2 = HighwayWays(s1.ids)
    s2.apply_file(in_pbf, locations=True)
    print(f"[ClipPbf]   {len(s2.ways)} ways, {len(s2.refs)} referenced nodes", flush=True)

    print(f"[ClipPbf] Pass 3/3: node records for references...", flush=True)
    s3 = RefNodes(s2.refs)
    s3.apply_file(in_pbf, locations=True)
    print(f"[ClipPbf]   {len(s3.nodes)} node records written", flush=True)

    elements = []
    for nid, lat, lon in s3.nodes:
        elements.append({"type": "node", "id": nid, "lat": lat, "lon": lon})
    for wid, refs, tags in s2.ways:
        elements.append({"type": "way", "id": wid, "nodes": refs, "tags": tags})

    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump({"elements": elements}, fh, ensure_ascii=False)

    size_mb = os.path.getsize(out_json) / (1024 * 1024)
    print(f"[ClipPbf] Wrote {len(elements)} elements -> {out_json} ({size_mb:.1f} MB)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())