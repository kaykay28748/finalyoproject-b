// backend/scripts/import-osm.mjs
//
// One-shot import of a local OSM extract into the regional pedestrian-edges
// table, alongside any data already synced from Overpass. The upsert keys on
// osm_id, so a re-run is idempotent and multiple regions coexist in the same
// table.
//
// Two input formats are accepted (handled by the filename extension):
//   .opl  — osmium OPL text, e.g. `accra-pilot.opl`
//   .json — an Overpass-JSON "elements" array, e.g. the output of the
//           scripts/clip-pbf.py
//
// Both are re-emitted as the element shape parseOverpassElements() expects
// (el.id, el.lat/el.lon for nodes; el.nodes[] + el.tags for ways), so the same
// parse + ingestEdges pipeline used for live Overpass syncs is reused here
// rather than forked.
//
// Usage:
//   node scripts/import-osm.mjs <path-to-file.opl-or-.json>
//
// Requires backend/.env with DATABASE_URL (run from the backend/ directory so
// dotenv picks it up).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseOverpassElements, ingestEdges } from '../src/services/graphSynchronizer.js';
import { closePool } from '../src/config/db.js';

function decodeTagValue(value) {
  // OPL percent-encodes tag values ("New%20Road", "%2C" for a literal comma).
  // A malformed escape (a lone "%") must not throw the whole import.
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseOpl(text) {
  const nodes = [];
  const ways = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const prefix = line[0];
    // Relations carry routing-irrelevant metadata; skip them.
    if (prefix === 'r') continue;

    const tokens = line.split(/\s+/);
    const id = Number(tokens[0].slice(1));

    if (prefix === 'n') {
      let lat = null;
      let lon = null;
      for (const token of tokens) {
        if (token[0] === 'x') lon = Number(token.slice(1));
        else if (token[0] === 'y') lat = Number(token.slice(1));
      }
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        nodes.push({ type: 'node', id, lat, lon });
      }
    } else if (prefix === 'w') {
      const tags = {};
      let refs = null;

      for (const token of tokens) {
        if (token[0] === 'T' && token.length > 1) {
          for (const pair of token.slice(1).split(',')) {
            const eq = pair.indexOf('=');
            if (eq <= 0) continue;
            tags[pair.slice(0, eq)] = decodeTagValue(pair.slice(eq + 1));
          }
        } else if (token[0] === 'N') {
          refs = token
            .slice(1)
            .split(',')
            .map((r) => Number(r.replace(/^n/, '')))
            .filter((r) => Number.isFinite(r));
        }
      }

      if (refs && refs.length >= 2) {
        ways.push({ type: 'way', id, nodes: refs, tags });
      }
    }
  }

  return [...nodes, ...ways];
}

function parseElementsJson(text) {
  const data = JSON.parse(text);
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  return elements.filter((el) => el && typeof el === 'object');
}

const fileArg = process.argv[2];
const filePath = fileArg
  ? path.resolve(fileArg)
  : null;

if (!filePath) {
  console.error('Usage: node scripts/import-osm.mjs <path-to-file.opl-or-.json>');
  process.exit(2);
}

console.log(`[ImportOsm] Reading ${filePath}`);
const text = readFileSync(filePath, 'utf8');

const isJson = filePath.toLowerCase().endsWith('.json');
const elements = isJson ? parseElementsJson(text) : parseOpl(text);

const nodes = elements.filter((el) => el.type === 'node');
const ways = elements.filter((el) => el.type === 'way');
console.log(`[ImportOsm] Read ${nodes.length} nodes, ${ways.length} ways (${isJson ? 'json' : 'opl'})`);

// parseOverpassElements hard-caps a single call at MAX_EDGES_PER_SYNC (200000)
// by truncating the tail of ways. A whole-city clip exceeds that, so the ways
// are chunked here and each chunk is parsed + upserted on its own. Nodes are
// passed to every chunk so node references resolve identically across chunks.
const WAYS_PER_CHUNK = Number(process.env.IMPORT_WAY_CHUNK ?? 20000);

let totalEdgesParsed = 0;
let totalEdgesInserted = 0;
let totalBatches = 0;
let charge = 0;
let truncatedAnywhere = false;
const skipped = { segmentsSkippedTooShort: 0, segmentsSkippedNoNode: 0, waysSeen: 0 };

for (let offset = 0; offset < ways.length; offset += WAYS_PER_CHUNK) {
  const wayChunk = ways.slice(offset, offset + WAYS_PER_CHUNK);
  charge++;
  const { edges, stats } = parseOverpassElements([...nodes, ...wayChunk]);

  skipped.waysSeen += stats.waysSeen;
  skipped.segmentsSkippedTooShort += stats.segmentsSkippedTooShort;
  skipped.segmentsSkippedNoNode += stats.segmentsSkippedNoNode;
  if (stats.truncated) truncatedAnywhere = true;

  console.log(
    `[ImportOsm] Chunk ${charge}: ${stats.waysSeen} ways -> ${edges.length} edges ` +
    `(${stats.segmentsSkippedTooShort} sub-0.5m skipped, ${stats.segmentsSkippedNoNode} missing-node skipped)`
  );

  if (edges.length === 0) continue;

  const result = await ingestEdges(edges, { source: isJson ? 'json-clip' : 'opl-import' });
  totalEdgesParsed += result.edgesParsed;
  totalEdgesInserted += result.edgesInserted;
  totalBatches += result.batches;

  if (!result.ok) {
    console.error(`[ImportOsm] Chunk ${charge} failed: ${result.error}`);
    await closePool();
    process.exit(1);
  }
}

if (totalEdgesInserted === 0) {
  console.log('[ImportOsm] No edges to insert; nothing written. (Check the file is a way-bearing OSM extract, not node-only.)');
  process.exitCode = 0;
} else {
  console.log(
    `[ImportOsm] Done: ${charge} chunk(s), ${totalEdgesParsed} edges parsed, ` +
    `${totalEdgesInserted} inserted in ${totalBatches} batch(es)`
  );
  if (truncatedAnywhere) {
    console.warn('[ImportOsm] WARNING: at least one chunk hit the 200k edge cap. Reduce IMPORT_WAY_CHUNK and re-run to be sure nothing was dropped.');
  }
}

await closePool();