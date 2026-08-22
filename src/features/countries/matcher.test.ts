import { describe, expect, it } from "vitest";
import type { CountryPoly } from "@/features/countries/polygons";
import { matchCountries } from "@/features/countries/matcher";

function squareCountry(
  iso: string,
  minLng: number,
  maxLng: number,
  minLat: number,
  maxLat: number,
  name = `Testland (${iso})`,
): CountryPoly {
  const ring = [
    { lng: minLng, lat: minLat },
    { lng: maxLng, lat: minLat },
    { lng: maxLng, lat: maxLat },
    { lng: minLng, lat: maxLat },
  ];
  return {
    iso,
    name,
    rings: [{ points: ring }],
    bbox: {
      minLat,
      maxLat,
      minLng,
      maxLng,
    },
  };
}

const TST = squareCountry("TST", 10, 11, 10, 11);
const NBR = squareCountry("NBR", 12.5, 13.5, 12.5, 13.5);
const COUNTRIES = [TST, NBR];

/** Degrees ≈ metres at these latitudes (~111 km per degree). */
describe("matchCountry via matchCountries", () => {
  it("counts a visit inside the polygon", () => {
    const matches = matchCountries([{ id: "p1", lat: 10.5, lng: 10.5 }], COUNTRIES);
    expect(matches).toEqual({ p1: "TST" });
  });

  it("snaps a coastal visit to the nearest country within ~50 km", () => {
    // ~0.2° off the coast of TST ≈ 22 km offshore.
    const matches = matchCountries([{ id: "p1", lat: 9.8, lng: 10.4 }], COUNTRIES);
    expect(matches).toEqual({ p1: "TST" });
  });

  it("leaves deep-ocean visits uncounted beyond the snap radius", () => {
    // ~1.3° south ≈ 145 km offshore: no country, no invented one.
    const matches = matchCountries([{ id: "p1", lat: 8.7, lng: 10.4 }], COUNTRIES);
    expect(matches).toEqual({ p1: null });
  });

  it("snaps to the nearest coast when two countries compete", () => {
    // ~23 km off NBR's south-west corner; far beyond TST.
    const matches = matchCountries([{ id: "p1", lat: 12.35, lng: 12.65 }], COUNTRIES);
    expect(matches).toEqual({ p1: "NBR" });
  });

  it("handles holes via even-odd parity (enclave stays itself)", () => {
    const outerWithHole: CountryPoly = {
      iso: "OUT",
      name: "Outer",
      rings: [
        { points: squareCountry("OUT", 20, 24, 20, 24).rings[0]!.points },
        { points: squareCountry("OUT", 21.5, 22.5, 21.5, 22.5).rings[0]!.points },
      ],
      bbox: { minLat: 20, maxLat: 24, minLng: 20, maxLng: 24 },
    };
    const enclave = squareCountry("ENC", 21.5, 22.5, 21.5, 22.5);
    const matches = matchCountries(
      [
        { id: "in-hole", lat: 22, lng: 22 },
        { id: "outside-hole", lat: 23.5, lng: 20.5 },
      ],
      [outerWithHole, enclave],
    );
    expect(matches["in-hole"]).toBe("ENC");
    expect(matches["outside-hole"]).toBe("OUT");
  });

  it("is deterministic for identical inputs", () => {
    const places = [
      { id: "a", lat: 10.5, lng: 10.5 },
      { id: "b", lat: 9.9, lng: 10.1 },
      { id: "c", lat: 8, lng: 8 },
    ];
    expect(matchCountries(places, COUNTRIES)).toEqual(
      matchCountries([...places].reverse(), [...COUNTRIES].reverse()),
    );
  });
});
