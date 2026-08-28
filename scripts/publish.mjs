#!/usr/bin/env node
/**
 * publish.mjs -- Org publishing pipeline for the StarIntel website.
 *
 *   node scripts/publish.mjs <target> [options]
 *
 * Pipeline: Org source (owning repo) -> emacs deterministic export ->
 * provenance enrichment -> gates (approval/allowlist) -> output repo.
 *
 * Options:
 *   --output-repo PATH   override the configured output repository (explicit
 *                        only; never inferred from neighboring directories)
 *   --dry-run            plan and print, write nothing
 *   --diff               after writing, print `git diff --stat` in the output repo
 *   --list               list targets from publish.toml and exit
 *
 * Env: STARINTEL_PUBLISH_OUTPUT_REPO (same as --output-repo),
 *      EMACS (default "emacs"), STARINTEL_WEBSITE_ROOT.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";

const root = process.env.STARINTEL_WEBSITE_ROOT
  ? resolve(process.env.STARINTEL_WEBSITE_ROOT)
  : dirname(dirname(fileURLToPath(import.meta.url)));

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout ?? "").trim(),
    stderr: (r.stderr ?? "").trim(),
  };
}

function git(repo, ...args) {
  return sh("git", ["-C", repo, ...args]);
}

function loadConfig() {
  const cfgPath = join(root, "publish.toml");
  if (!existsSync(cfgPath)) throw new Error(`missing ${cfgPath}`);
  return parseToml(readFileSync(cfgPath, "utf8"));
}

/** Collect files under baseDir matching a glob-like pattern (supports **). */
function matchPattern(baseDir, pattern) {
  const re = new RegExp(
    "^" +
      pattern
        .replaceAll(/[.+^${}()|[\]\\]/g, "\\$&")
        .replaceAll("**/", "(?:.*/)?")
        .replaceAll("**", ".*")
        .replaceAll("*", "[^/]*") +
      "$",
  );
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (re.test(relative(baseDir, full).replaceAll("\\", "/"))) out.push(full);
    }
  };
  walk(baseDir);
  return out.sort();
}

function globMatch(relPath, patterns) {
  for (const pat of patterns) {
    const re = new RegExp(
      "^" +
        pat
          .replaceAll(/[.+^${}()|[\]\\]/g, "\\$&")
          .replaceAll("**/", "(?:.*/)?")
          .replaceAll("**", ".*")
          .replaceAll("*", "[^/]*") +
        "$",
    );
    if (re.test(relPath)) return true;
  }
  return false;
}

/** Parse file-level Org keywords (header area only, before first heading). */
function parseOrgKeywords(file) {
  const text = readFileSync(file, "utf8");
  const header = text.slice(0, text.search(/^\* /m) === -1 ? text.length : text.search(/^\* /m));
  const keywords = {};
  for (const m of header.matchAll(/^\s*#\+([A-Za-z_]+):\s*(.*?)\s*$/gm)) {
    const key = m[1].toUpperCase();
    if (!(key in keywords)) keywords[key] = m[2];
  }
  const id = header.match(/:ID:\s*(\S+)/);
  if (id) keywords.ID = id[1];
  return keywords;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function sourceProvenance(sourceRoot, relPath) {
  const repoRoot = git(sourceRoot, "rev-parse", "--show-toplevel");
  if (!repoRoot.ok) return { source_repo: null, source_commit: null };
  const repoRel = relative(repoRoot.stdout, resolve(sourceRoot, relPath));
  const origin = git(sourceRoot, "config", "--get", "remote.origin.url");
  const commit = git(sourceRoot, "rev-parse", "HEAD");
  return {
    source_repo: origin.ok ? origin.stdout : repoRoot.stdout,
    source_path: repoRel,
    source_commit: commit.ok ? commit.stdout : null,
  };
}

/** Research gate: fail closed. Approval APPROVED + explicit allowlist entry. */
function researchGate(keywords, slug, publicIds) {
  const approvalState = (keywords.APPROVAL_STATE ?? "").toUpperCase();
  const evidence = keywords.APPROVAL_EVIDENCE ?? "";
  const approved = approvalState === "APPROVED" && evidence.length > 0;
  const allowlisted = publicIds.includes(slug) || (keywords.ID && publicIds.includes(keywords.ID));
  return { approved, allowlisted, published: approved && allowlisted };
}

function excerptFromHtml(html) {
  const m = html.match(/<p>([\s\S]*?)<\/p>/);
  if (!m) return "";
  return m[1]
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/&[a-z]+;/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function main() {
  const argv = process.argv.slice(2);
  const listOnly = argv.includes("--list");
  const dryRun = argv.includes("--dry-run");
  const diffMode = argv.includes("--diff");
  const outRepoIdx = argv.indexOf("--output-repo");
  const outRepoArg = outRepoIdx >= 0 ? argv[outRepoIdx + 1] : undefined;
  const target = argv.find(
    (a, i) => !a.startsWith("--") && !(outRepoIdx >= 0 && i === outRepoIdx + 1),
  );

  const cfg = loadConfig();
  const targets = cfg.targets ?? {};

  if (listOnly) {
    for (const [name, t] of Object.entries(targets)) {
      console.log(`${name}${t.enabled === false ? " (disabled)" : ""} -> ${t.output_path} from ${t.source_root}`);
    }
    return 0;
  }

  if (!target) {
    console.error("usage: publish.mjs <target> [--output-repo PATH] [--dry-run] [--diff] | --list");
    console.error("targets: " + Object.keys(targets).join(", "));
    return 2;
  }
  const t = targets[target];
  if (!t) {
    console.error(`unknown target: ${target}`);
    console.error("targets: " + Object.keys(targets).join(", "));
    return 2;
  }

  const defaultRepo = resolve(root, cfg.settings?.default_output_repo ?? ".");
  const envRepo = process.env.STARINTEL_PUBLISH_OUTPUT_REPO;
  const outRepo = resolve(root, outRepoArg ?? envRepo ?? defaultRepo);
  const explicitOverride = Boolean(outRepoArg ?? envRepo);
  if (outRepo === resolve(root, "..")) {
    // Never write into a sibling repository of the checkout by accident.
    console.error("refusing ambiguous output repository: pass --output-repo explicitly");
    return 2;
  }
  if (!explicitOverride && !git(outRepo, "rev-parse", "--is-inside-work-tree").ok) {
    console.error(`configured output repo is not a git repository: ${outRepo}`);
    return 2;
  }

  const sourceRoot = resolve(root, t.source_root);
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    console.error(`source_root does not exist: ${sourceRoot}`);
    return 2;
  }

  let files = matchPattern(sourceRoot, t.include ?? "**/*.org").filter((f) => f.endsWith(".org"));
  for (const pat of t.exclude ?? []) {
    files = files.filter((f) => !globMatch(relative(sourceRoot, f), [pat]));
  }

  // Gates run before any export work.
  const gated = [];
  for (const f of files) {
    const rel = relative(sourceRoot, f);
    const keywords = parseOrgKeywords(f);
    let published = true;
    let gate = null;
    if (t.require_approval) {
      gate = researchGate(keywords, slugFor(rel, keywords), t.public_ids ?? []);
      published = gate.published;
    }
    gated.push({ file: f, rel, keywords, published, gate });
  }
  const publishable = gated.filter((g) => g.published);
  const skipped = gated.filter((g) => !g.published);

  console.log(`target ${target}: ${gated.length} source file(s), ${publishable.length} publishable, ${skipped.length} gated off`);
  for (const s of skipped.slice(0, 10)) {
    console.log(`  gated: ${s.rel} (approval_state=${s.keywords.APPROVAL_STATE ?? "none"})`);
  }
  if (skipped.length > 10) console.log(`  ... and ${skipped.length - 10} more`);

  if (publishable.length === 0) {
    console.log("nothing to publish (fail closed)");
    if (dryRun) return 0;
    const outDir = join(outRepo, t.output_path);
    if (!dryRun) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "manifest.json"), JSON.stringify({ target, documents: [], generated_at: new Date().toISOString() }, null, 2) + "\n");
      console.log(`wrote empty manifest -> ${join(outDir, "manifest.json")}`);
    }
    return 0;
  }

  const tmp = `/tmp/opencode/publish-${target}-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const emacs = process.env.EMACS ?? "emacs";
  const exportRun = sh(
    emacs,
    ["--batch", "-Q", "--load", join(root, "tools", "orgexport", "export.el"), "--", tmp, ...publishable.map((g) => g.file)],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  if (!exportRun.ok) {
    console.error(`org export failed (exit ${exportRun.status})`);
    return 1;
  }

  const outDir = join(outRepo, t.output_path);
  const documents = [];
  const sourceCommit = git(sourceRoot, "rev-parse", "HEAD").stdout || null;

  for (const g of publishable) {
    const slug = slugFor(g.rel, g.keywords);
    const htmlPath = join(tmp, `${slug}.html`);
    const metaPath = join(tmp, `${slug}.meta.json`);
    if (!existsSync(htmlPath) || !existsSync(metaPath)) {
      console.error(`exporter did not emit ${slug} (duplicate slug?)`);
      return 1;
    }
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const html = readFileSync(htmlPath, "utf8");
    const prov = sourceProvenance(sourceRoot, g.rel);
    const doc = {
      slug,
      title: meta.title ?? slug,
      date: meta.date ?? null,
      author: meta.author ?? null,
      description: meta.description ?? "",
      excerpt: excerptFromHtml(html),
      tags: meta.tags ? meta.tags.split(/\s+/).filter(Boolean) : [],
      filetags: meta.filetags ?? null,
      id: meta.id ?? null,
      status: meta.status ?? null,
      anchors: meta.anchors ?? [],
      approval: t.require_approval
        ? {
            schema: meta.approval_schema ?? null,
            state: meta.approval_state ?? null,
            actor: meta.approval_actor ?? null,
            evidence: meta.approval_evidence ?? null,
            decided_at: meta.approval_decided_at ?? null,
          }
        : null,
      source: {
        repo: prov.source_repo,
        path: prov.source_path,
        commit: prov.source_commit,
        blob: meta.id ? prov.source_commit : null,
        content_sha256: sha256(g.file),
      },
    };
    documents.push(doc);
    if (!dryRun) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, `${slug}.json`), JSON.stringify(doc, null, 2) + "\n");
      writeFileSync(join(outDir, `${slug}.html`), html);
    }
    console.log(`  ${dryRun ? "would write" : "wrote"} ${join(t.output_path, slug + ".html")}`);
  }

  documents.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  const manifest = {
    target,
    generated_at: new Date().toISOString(),
    source_commit: sourceCommit,
    count: documents.length,
    documents,
  };
  if (!dryRun) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(`manifest: ${documents.length} document(s) -> ${join(outDir, "manifest.json")}`);
  }

  if (diffMode && !dryRun) {
    const d = git(outRepo, "diff", "--stat");
    console.log(d.stdout || "(no unstaged diffs)");
    const untracked = git(outRepo, "status", "--short");
    if (untracked.stdout) console.log(untracked.stdout.split("\n").slice(0, 20).join("\n"));
  }

  rmSync(tmp, { recursive: true, force: true });
  return 0;
}

function slugFor(relPath, keywords) {
  const kslug = keywords.SLUG;
  if (kslug) return kslug;
  const title = keywords.TITLE;
  const base = relPath.replace(/\.org$/, "");
  const useTitle = title && base.split("/").pop()?.match(/^\d{4}-\d{2}-\d{2}$/); // dailies keep date slugs
  const src = useTitle ? title : base;
  return src
    .toLowerCase()
    .replaceAll(/[^a-z0-9/]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll("/", "/");
}

process.exit(main());
