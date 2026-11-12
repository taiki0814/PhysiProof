# Treasure chest placement data

`chestCandidates.ts` contains derived data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Each entry is `[latitude, longitude, OSM way ID]`. For example, the provenance of a location can be checked at `https://www.openstreetmap.org/way/<OSM way ID>`.

The coordinates come from real closed pedestrian ways and public running tracks. The generator excludes access restrictions, fees, indoor locations and self-intersecting loops. It checks that the marker falls inside the loop with room around it, uses the bundled boundaries to assign the prefecture, and groups close candidates into roughly 1 km cells. Map tags can lag on-site access changes.

The initial catalogue comes from the [OpenStreetMap France Overpass instance](https://overpass.openstreetmap.fr/) with OSM data dated 2026-10-26 14:35 UTC. The source was retrieved in regional bounding boxes from Hokkaido through Okinawa, with smaller boxes for Kanto.

The Worker draws up to 12 boxes from the bundled data per prefecture and week. It never contacts Overpass for personal treasure chest searches. Weekly placement is shared across players. The source is fetched only when rebuilding the catalogue.

To refresh the data, download Overpass JSON extracts with way IDs, tags and full geometry. Query regions separately rather than querying the whole country at once. This is the example for metropolitan Kanto:

```overpassql
[out:json][timeout:35];
(
  way[highway~"^(footway|pedestrian)$"](35.42,139.45,35.86,140.01)(if:is_closed()==1);
  way[highway=path][foot~"^(yes|designated|permissive)$"](35.42,139.45,35.86,140.01)(if:is_closed()==1);
  way[leisure=track][sport=running](35.42,139.45,35.86,140.01)(if:is_closed()==1);
);
out geom;
```

```sh
node node_modules/esbuild/bin/esbuild --bundle --platform=node --format=esm --outfile=tmp/build-chest-candidates.mjs scripts/build-chest-candidates.ts
node tmp/build-chest-candidates.mjs packages/backend/src/data/chestCandidates.ts tmp/region-1.json tmp/region-2.json
```

The generator requires at least one eligible candidate in every prefecture. It accepts multiple extracts if a supplemental query is needed. Run the chest integration tests before releasing a refreshed catalogue.
