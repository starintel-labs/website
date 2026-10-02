/**
 * StarIntel document validation and public-safe projection.
 *
 * The canonical schema authority is `lost-rob0t/starintel-gpt-auto-dig`.
 * Exact v0.9 and v0.10.1 artifacts are vendored under `schemas/`; validation
 * fails closed and current emitters must write v0.10.1.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020Default from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import type { Ajv, ValidateFunction } from "ajv";

const Ajv2020 = Ajv2020Default as unknown as new (options?: Record<string, unknown>) => Ajv;
const addFormats = addFormatsModule as unknown as (
  ajv: Ajv,
  formats: Record<string, boolean>,
) => Ajv;

export * from "./public.ts";

export const STARINTEL_V09_SCHEMA_VERSION = "0.9.0";
export const STARINTEL_V0101_SCHEMA_VERSION = "0.10.1";

/** Required envelope fields per StarIntel v0.9. */
export const V09_REQUIRED_FIELDS = [
  "_id",
  "dataset",
  "dtype",
  "schema_version",
  "version",
  "date_added",
  "date_updated",
  "sources",
  "evidence",
  "data",
] as const;

export interface StarIntelV09Doc {
  _id: string;
  _rev?: string;
  dataset: string;
  dtype: string;
  schema_version: string;
  version: number | string;
  date_added: string;
  date_updated: string;
  sources: unknown[];
  evidence: unknown[];
  data: Record<string, unknown>;
  title?: string;
  summary?: string;
  description?: string;
  handling?: Record<string, unknown>;
  tags?: string[];
  keywords?: string[];
  [k: string]: unknown;
}

export class V09ValidationError extends Error {
  readonly issues: string[];
  constructor(docId: string, issues: string[]) {
    super(`StarIntel v0.9 validation failed for ${docId}: ${issues.join("; ")}`);
    this.name = "V09ValidationError";
    this.issues = issues;
  }
}

let cachedValidator: ValidateFunction<StarIntelV09Doc> | undefined;

function schemaPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return process.env.STARINTEL_V09_SCHEMA ?? join(here, "..", "schemas", "starintel-doc-v0.9.0.schema.json");
}

function loadValidator(): ValidateFunction<StarIntelV09Doc> {
  if (cachedValidator) return cachedValidator;
  const raw = readFileSync(schemaPath(), "utf8");
  const schema = JSON.parse(raw) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv, { date: true, "date-time": true });
  cachedValidator = ajv.compile<StarIntelV09Doc>(schema);
  if (!cachedValidator) throw new Error("failed to compile StarIntel v0.9 schema validator");
  return cachedValidator;
}

/** Validate a parsed document against the pinned StarIntel v0.9 schema. */
export function validateV09(doc: unknown): StarIntelV09Doc {
  const d = doc as StarIntelV09Doc;
  const issues: string[] = [];
  for (const f of V09_REQUIRED_FIELDS) {
    if (d?.[f] === undefined) issues.push(`missing required field ${f}`);
  }
  if (d?.schema_version !== undefined && !String(d.schema_version).startsWith("0.9")) {
    issues.push(`schema_version ${d.schema_version} is not 0.9.x`);
  }
  const validate = loadValidator();
  if (!validate(doc)) {
    for (const err of validate.errors ?? []) {
      issues.push(`${err.instancePath || "/"} ${err.message ?? "invalid"}`);
    }
  }
  if (issues.length > 0) throw new V09ValidationError(d?._id ?? "<unknown>", issues);
  return d;
}

/** Parse and validate one NDJSON line. */
export function validateV09Line(line: string): StarIntelV09Doc {
  const trimmed = line.trim();
  if (trimmed.length === 0) throw new V09ValidationError("<empty line>", ["empty NDJSON line"]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    throw new V09ValidationError("<unparseable>", [`invalid JSON: ${(e as Error).message}`]);
  }
  return validateV09(parsed);
}


export interface StarIntelV0101Doc extends Omit<StarIntelV09Doc, "schema_version"> {
  schema_version: "0.10.1";
}

export class V0101ValidationError extends Error {
  readonly issues: string[];
  constructor(docId: string, issues: string[]) {
    super(`StarIntel v0.10.1 validation failed for ${docId}: ${issues.join("; ")}`);
    this.name = "V0101ValidationError";
    this.issues = issues;
  }
}

let cachedV0101Validator: ValidateFunction<StarIntelV0101Doc> | undefined;

function schemaPathV0101(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return (
    process.env.STARINTEL_V0101_SCHEMA ??
    join(here, "..", "schemas", "starintel-doc-v0.10.1.schema.json")
  );
}

function loadV0101Validator(): ValidateFunction<StarIntelV0101Doc> {
  if (cachedV0101Validator) return cachedV0101Validator;
  const raw = readFileSync(schemaPathV0101(), "utf8");
  const schema = JSON.parse(raw) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv, { date: true, "date-time": true });
  cachedV0101Validator = ajv.compile<StarIntelV0101Doc>(schema);
  if (!cachedV0101Validator) {
    throw new Error("failed to compile StarIntel v0.10.1 schema validator");
  }
  return cachedV0101Validator;
}

/** Validate a newly-emitted document against the pinned StarIntel v0.10.1 schema. */
export function validateV0101(doc: unknown): StarIntelV0101Doc {
  const d = doc as StarIntelV0101Doc;
  const issues: string[] = [];
  for (const field of V09_REQUIRED_FIELDS) {
    if (d?.[field] === undefined) issues.push(`missing required field ${field}`);
  }
  if (d?.schema_version !== undefined && d.schema_version !== STARINTEL_V0101_SCHEMA_VERSION) {
    issues.push(
      `schema_version ${String(d.schema_version)} is not emitted version ${STARINTEL_V0101_SCHEMA_VERSION}`,
    );
  }
  const validate = loadV0101Validator();
  if (!validate(doc)) {
    for (const err of validate.errors ?? []) {
      issues.push(`${err.instancePath || "/"} ${err.message ?? "invalid"}`);
    }
  }
  if (issues.length > 0) {
    throw new V0101ValidationError(d?._id ?? "<unknown>", issues);
  }
  return d;
}
