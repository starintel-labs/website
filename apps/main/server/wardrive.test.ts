import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWardriveRunDocument,
  parseWigleCapture,
  projectWardriveRun,
} from "./wardrive.ts";
import { scoreRun } from "../src/wardrive-score.ts";

const HEADER =
  "MAC,SSID,AuthMode,FirstSeen,Channel,RSSI,CurrentLatitude,CurrentLongitude,AltitudeMeters,AccuracyMeters,Type,Frequency,MfgrId";

test("header-only WiGLE exports parse as zero observations", () => {
  const parsed = parseWigleCapture("WigleWifi-1.6,appRelease=2.99,model=test\n" + HEADER + "\n");
  assert.equal(parsed.rows, 0);
  assert.equal(parsed.wifiIds.length, 0);
  assert.equal(parsed.bluetoothIds.length, 0);
  assert.equal(parsed.gpsCoveragePct, 0);
});

test("WiGLE parser derives radios, channels, bands, GPS coverage, and duration", () => {
  const csv = [
    "WigleWifi-1.6,appRelease=2.99,model=test",
    HEADER,
    "AA:BB:CC:00:00:01,one,[WPA2],2026-10-02 00:00:00,1,-40,39.99,-83.00,0,4,WIFI,2412,Vendor A",
    "AA:BB:CC:00:00:02,two,[WPA3],2026-10-02 00:10:00,36,-50,39.991,-83.001,0,4,WIFI,5180,Vendor B",
    "AA:BB:CC:00:00:03,bt,,2026-10-02 00:20:00,,-60,39.992,-83.002,0,4,BLE,0,Vendor C",
  ].join("\n");

  const parsed = parseWigleCapture(csv);
  assert.equal(parsed.rows, 3);
  assert.equal(parsed.wifiIds.length, 2);
  assert.equal(parsed.bluetoothIds.length, 1);
  assert.equal(parsed.uniqueChannels, 2);
  assert.equal(parsed.bands, 2);
  assert.equal(parsed.vendors, 3);
  assert.equal(parsed.gpsCoveragePct, 100);
  assert.equal(parsed.durationMinutes, 20);
  assert.ok(parsed.newGridCells >= 2);
});

test("public run projection removes private capture identifiers", () => {
  const inputs = {
    distanceKm: 0,
    durationMinutes: 20,
    gpsCoveragePct: 100,
    wifiNew: 2,
    wifiTotal: 2,
    bluetoothNew: 1,
    bluetoothTotal: 1,
    otherNew: 0,
    packetCount: 0,
    uniqueChannels: 2,
    bands: 2,
    vendors: 3,
    newGridCells: 3,
    sourceCount: 1,
  };
  const result = scoreRun(inputs);
  const doc = buildWardriveRunDocument({
    id: "wardrive-run:test",
    playerId: "player_test_1234",
    displayName: "test",
    captureSha256: "deadbeef",
    captureBytes: 123,
    parsed: {
      source: "wigle",
      rows: 3,
      wifiIds: ["wifi:a", "wifi:b"],
      bluetoothIds: ["bluetooth:c"],
      packetCount: 0,
      uniqueChannels: 2,
      bands: 2,
      vendors: 3,
      newGridCells: 3,
      gpsCoveragePct: 100,
      startedAt: "2026-10-02T04:00:00.000Z",
      endedAt: "2026-10-02T04:20:00.000Z",
      durationMinutes: 20,
    },
    radioFingerprints: ["private-a", "private-b", "private-c"],
    inputs,
    result,
    now: "2026-10-02T04:21:00.000Z",
  });

  assert.equal(doc.dtype, "event");
  assert.equal(doc.schema_version, "0.10.1");
  assert.equal(doc.data.event_kind, "wireless-survey-run");

  const projected = projectWardriveRun(doc);
  const json = JSON.stringify(projected);
  assert.doesNotMatch(json, /deadbeef/);
  assert.doesNotMatch(json, /private-a/);
  assert.equal(projected.verification, "capture-derived");
});


test("JSON-LD omits unavailable capture timestamps", () => {
  const inputs = {
    distanceKm: 0,
    durationMinutes: 0,
    gpsCoveragePct: 0,
    wifiNew: 1,
    wifiTotal: 1,
    bluetoothNew: 0,
    bluetoothTotal: 0,
    otherNew: 0,
    packetCount: 0,
    uniqueChannels: 1,
    bands: 1,
    vendors: 1,
    newGridCells: 0,
    sourceCount: 1,
  };
  const doc = buildWardriveRunDocument({
    id: "wardrive-run:no-dates",
    playerId: "player_test_5678",
    displayName: "test",
    captureSha256: "cafebabe",
    captureBytes: 42,
    parsed: {
      source: "kismet",
      rows: 1,
      wifiIds: ["wifi:a"],
      bluetoothIds: [],
      packetCount: 0,
      uniqueChannels: 1,
      bands: 1,
      vendors: 1,
      newGridCells: 0,
      gpsCoveragePct: 0,
      startedAt: null,
      endedAt: null,
      durationMinutes: 0,
    },
    radioFingerprints: ["private-a"],
    inputs,
    result: scoreRun(inputs),
    now: "2026-10-02T04:21:00.000Z",
  });

  assert.equal(doc.data.start_at, null);
  assert.equal(doc.data.end_at, null);
  assert.equal("startDate" in doc.schema_org, false);
  assert.equal("endDate" in doc.schema_org, false);
});
