# Map Diary

A personal web app that turns an imported Google Maps Timeline into a beautiful visual record of a person's travels — animated map playback, dashboards, and heatmaps. Users must import their own Google Timeline export; nothing is fetched from Google automatically.

## Language

### Core records

### Core records

**Visit**:
A time-spanning stay at a place, with an arrival and departure time (departure may be open-ended). The atomic unit of the product; every feature derives from visits.
_Avoid_: moment, stop, check-in, entry, event

**Place**:
A real-world location that visits occur at, carrying one canonical name, address, and coordinates. Imported visits are grouped into places by Google placeId; renaming a place applies everywhere.
_Avoid_: location, POI, spot, venue

**Trip**:
A named window of days (e.g. "Himachal, Mar 12–19") that claims every visit falling inside it. May be auto-inferred or declared by hand; trips are the unit of narrative features like video rendering and recaps.
_Avoid_: vacation, journey, excursion

**Home**:
The single Place the user has explicitly designated as their base. The anchor for trip inference and away-time stats; never inferred silently.
_Avoid_: primary residence, default location

### Ingestion

**Import**:
A Google Timeline export file supplied by the user, parsed entirely in the browser. The only way data enters the app.
_Avoid_: upload, sync, fetch

**Archive**:
The versioned JSON backup file a user can export and re-import, carrying all places, visits, trips, settings, and dismissal memory. The escape hatch from device-bound storage and the future sync payload.
_Avoid_: dump, snapshot, download
