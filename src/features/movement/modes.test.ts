import { describe, expect, it } from "vitest";
import { normalizeActivityType } from "@/features/movement/modes";

describe("normalizeActivityType", () => {
  it("buckets Google activity types into dashboard modes", () => {
    expect(normalizeActivityType("IN_VEHICLE")).toBe("driving");
    expect(normalizeActivityType("MOTORCYCLING")).toBe("driving");
    expect(normalizeActivityType("WALKING")).toBe("walking");
    expect(normalizeActivityType("ON_FOOT")).toBe("walking");
    expect(normalizeActivityType("CYCLING")).toBe("cycling");
    expect(normalizeActivityType("ON_BICYCLE")).toBe("cycling");
    expect(normalizeActivityType("IN_BUS")).toBe("transit");
    expect(normalizeActivityType("IN_SUBWAY")).toBe("transit");
    expect(normalizeActivityType("IN_TRAIN")).toBe("transit");
    expect(normalizeActivityType("FLYING")).toBe("transit");
    expect(normalizeActivityType("in bus")).toBe("transit");
  });

  it("keeps unknown vehicle types countable as other", () => {
    expect(normalizeActivityType("HOVERBOARDING")).toBe("other");
  });

  it("returns null for nothing usable", () => {
    expect(normalizeActivityType("OTHER")).toBeNull();
    expect(normalizeActivityType("UNKNOWN")).toBeNull();
    expect(normalizeActivityType(42)).toBeNull();
    expect(normalizeActivityType(undefined)).toBeNull();
    expect(normalizeActivityType("")).toBeNull();
  });
});
