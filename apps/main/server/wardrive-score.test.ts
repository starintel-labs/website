import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeFor, scoreRun } from "../src/wardrive-score.ts";

test("grade thresholds remain stable", () => {
  assert.equal(gradeFor(900), "S+");
  assert.equal(gradeFor(800), "S");
  assert.equal(gradeFor(700), "A");
  assert.equal(gradeFor(550), "B");
  assert.equal(gradeFor(400), "C");
  assert.equal(gradeFor(250), "D");
  assert.equal(gradeFor(249), "F");
});

test("empty run scores zero without NaN", () => {
  const result = scoreRun({
    distanceKm: 0,
    durationMinutes: 0,
    gpsCoveragePct: 0,
    wifiNew: 0,
    wifiTotal: 0,
    bluetoothNew: 0,
    bluetoothTotal: 0,
    otherNew: 0,
    packetCount: 0,
    uniqueChannels: 0,
    bands: 0,
    vendors: 0,
    newGridCells: 0,
    sourceCount: 0,
  });
  assert.equal(result.score, 0);
  assert.equal(result.grade, "F");
  assert.equal(result.noveltyPct, 0);
});

test("mixed WiGLE + Kismet run earns dual-source achievement", () => {
  const result = scoreRun({
    distanceKm: 9,
    durationMinutes: 150,
    gpsCoveragePct: 97,
    wifiNew: 420,
    wifiTotal: 500,
    bluetoothNew: 180,
    bluetoothTotal: 230,
    otherNew: 8,
    packetCount: 600000,
    uniqueChannels: 24,
    bands: 3,
    vendors: 40,
    newGridCells: 75,
    sourceCount: 2,
  });
  assert.ok(result.score > 700);
  assert.ok(result.achievements.includes("Dual Wield"));
  assert.ok(result.achievements.includes("Spectrum Tourist"));
  assert.ok(result.xp > result.score);
});
