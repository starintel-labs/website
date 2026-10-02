export type RunInputs = {
  distanceKm: number;
  durationMinutes: number;
  gpsCoveragePct: number;
  wifiNew: number;
  wifiTotal: number;
  bluetoothNew: number;
  bluetoothTotal: number;
  otherNew: number;
  packetCount: number;
  uniqueChannels: number;
  bands: number;
  vendors: number;
  newGridCells: number;
  sourceCount: number;
};

export type ScoreBreakdown = {
  exploration: number;
  discovery: number;
  diversity: number;
  captureQuality: number;
  density: number;
  novelty: number;
  endurance: number;
};

export type RunScore = {
  score: number;
  grade: "S+" | "S" | "A" | "B" | "C" | "D" | "F";
  xp: number;
  breakdown: ScoreBreakdown;
  achievements: string[];
  noveltyPct: number;
};

function finite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function linear(value: number, target: number, max: number): number {
  if (target <= 0) return 0;
  return max * Math.min(1, finite(value) / target);
}

function logScale(value: number, target: number, max: number): number {
  if (target <= 0) return 0;
  const v = Math.min(finite(value), target);
  return max * (Math.log1p(v) / Math.log1p(target));
}

export function gradeFor(score: number): RunScore["grade"] {
  if (score >= 900) return "S+";
  if (score >= 800) return "S";
  if (score >= 700) return "A";
  if (score >= 550) return "B";
  if (score >= 400) return "C";
  if (score >= 250) return "D";
  return "F";
}

export function scoreRun(input: RunInputs): RunScore {
  const wifiNew = finite(input.wifiNew);
  const bluetoothNew = finite(input.bluetoothNew);
  const otherNew = finite(input.otherNew);
  const wifiTotal = Math.max(wifiNew, finite(input.wifiTotal));
  const bluetoothTotal = Math.max(bluetoothNew, finite(input.bluetoothTotal));
  const totalRadios = wifiTotal + bluetoothTotal + otherNew;
  const newRadios = wifiNew + bluetoothNew + otherNew;
  const noveltyPct = totalRadios > 0 ? Math.min(100, (newRadios / totalRadios) * 100) : 0;

  const exploration =
    linear(input.distanceKm, 8, 110) +
    logScale(input.newGridCells, 80, 110) +
    linear(input.gpsCoveragePct, 100, 30);

  const discovery =
    logScale(wifiNew, 500, 140) +
    logScale(bluetoothNew, 300, 80) +
    logScale(otherNew, 100, 30);

  const diversity =
    linear(input.bands, 3, 60) +
    logScale(input.uniqueChannels, 24, 50) +
    logScale(input.vendors, 40, 40);

  const captureQuality =
    linear(input.gpsCoveragePct, 100, 60) +
    logScale(input.packetCount, 250000, 70) +
    linear(input.sourceCount, 2, 20);

  const km = Math.max(finite(input.distanceKm), 0.5);
  const minutes = Math.max(finite(input.durationMinutes), 1);
  const density =
    logScale(newRadios / km, 150, 60) +
    logScale(finite(input.packetCount) / minutes, 1000, 40);

  const novelty = linear(noveltyPct, 100, 75);
  const endurance =
    linear(input.durationMinutes, 180, 15) +
    linear(input.distanceKm, 15, 10);

  const breakdown: ScoreBreakdown = {
    exploration: Math.round(exploration),
    discovery: Math.round(discovery),
    diversity: Math.round(diversity),
    captureQuality: Math.round(captureQuality),
    density: Math.round(density),
    novelty: Math.round(novelty),
    endurance: Math.round(endurance),
  };

  const score = Math.min(
    1000,
    Object.values(breakdown).reduce((sum, value) => sum + value, 0),
  );

  const achievements: string[] = [];
  if (input.packetCount >= 1000000) achievements.push("Packet Goblin");
  if (wifiNew >= 1000) achievements.push("Urban Archaeologist");
  if (input.bands >= 3) achievements.push("Spectrum Tourist");
  if (input.gpsCoveragePct >= 95) achievements.push("No Stone Unturned");
  if (newRadios / km >= 500) achievements.push("RF Rainforest");
  if (noveltyPct >= 90 && totalRadios >= 25) achievements.push("Fresh Ground");
  if (input.sourceCount >= 2) achievements.push("Dual Wield");
  if (input.distanceKm >= 15) achievements.push("Long Haul");

  const xp = Math.round(
    score * 2 +
    wifiNew * 0.5 +
    bluetoothNew * 0.4 +
    otherNew * 0.5 +
    finite(input.newGridCells) * 3,
  );

  return {
    score,
    grade: gradeFor(score),
    xp,
    breakdown,
    achievements,
    noveltyPct: Math.round(noveltyPct),
  };
}
