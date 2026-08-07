#!/usr/bin/env node
/**
 * Seed-batch runner — one child process per seed (avoids physics-frame heap OOM).
 *
 * Examples:
 *   node scripts/run-seed-batch.mjs --harness sp004 --rank0 4 --rank1 4 --n 50
 *   node scripts/run-seed-batch.mjs --harness headless --rank0 4 --rank1 2 --from 0 --to 49 \\
 *     --out /tmp/batch.json --partial-dir /tmp/seed-partials
 *
 * Env:
 *   MEASURE_SHA — optional override for measureCommit field (default: git rev-parse HEAD)
 *   SEED_BATCH_HEAP_MB — default 8192
 *
 * Output aligns with tests/fixtures/ai-quality/kakashi-foul-metric-baseline-*.json
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WORKER = join(__dirname, 'seed-batch-worker.mts');

function parseArgs(argv) {
  const o = {
    harness: 'sp004',
    rank0: 4,
    rank1: 4,
    rankLast: 5,
    maxShots: 200,
    from: 0,
    to: null, // inclusive; if null, use n
    n: 20,
    out: null,
    partialDir: null,
    concurrency: 1, // sequential safest; raise carefully
    label: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--harness') o.harness = next();
    else if (a === '--rank0') o.rank0 = Number(next());
    else if (a === '--rank1') o.rank1 = Number(next());
    else if (a === '--rankLast') o.rankLast = Number(next());
    else if (a === '--maxShots') o.maxShots = Number(next());
    else if (a === '--from') o.from = Number(next());
    else if (a === '--to') o.to = Number(next());
    else if (a === '--n') o.n = Number(next());
    else if (a === '--out') o.out = next();
    else if (a === '--partial-dir') o.partialDir = next();
    else if (a === '--concurrency') o.concurrency = Math.max(1, Number(next()));
    else if (a === '--label') o.label = next();
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/run-seed-batch.mjs [options]
  --harness sp004|headless   (default sp004)
  --rank0 N --rank1 N --rankLast N --maxShots N
  --from N --to N            inclusive seed range (or --n from 0)
  --n N                      seeds 0..n-1 if --to omitted
  --out path.json            final artifact path
  --partial-dir path         write seed-NNNN.json for resume
  --concurrency N            default 1
  --label string             group label override`);
      process.exit(0);
    } else throw new Error(`unknown arg: ${a}`);
  }
  if (o.to == null) o.to = o.from + o.n - 1;
  return o;
}

function gitHead() {
  if (process.env.MEASURE_SHA) return process.env.MEASURE_SHA.trim();
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function seedDeriv(harness) {
  if (harness === 'sp004') {
    return 'seed + globalShotIndex * 7919 (both seats share global index; no respot — ruler B / SP-004)';
  }
  return 'seed + shotCount (headless/demo formula; post-DIV-008(b) no respot — ruler A path without safety net)';
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function runWorker(opts, seed) {
  const heap = process.env.SEED_BATCH_HEAP_MB || '8192';
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        `--max-old-space-size=${heap}`,
        '--import',
        'tsx',
        WORKER,
        '--harness', opts.harness,
        '--seed', String(seed),
        '--rank0', String(opts.rank0),
        '--rank1', String(opts.rank1),
        '--rankLast', String(opts.rankLast),
        '--maxShots', String(opts.maxShots),
      ],
      {
        cwd: ROOT,
        env: { ...process.env, NODE_OPTIONS: '' }, // heap flag is on argv
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`seed ${seed} exit ${code}: ${err.slice(-500)}`));
        return;
      }
      const line = out.trim().split('\n').filter(Boolean).pop();
      if (!line) {
        reject(new Error(`seed ${seed} empty stdout; stderr=${err.slice(-300)}`));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(new Error(`seed ${seed} bad JSON: ${line.slice(0, 200)}`));
      }
    });
  });
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function partialPath(dir, seed) {
  return join(dir, `seed-${String(seed).padStart(5, '0')}.json`);
}

async function main() {
  const opts = parseArgs(process.argv);
  const measureCommit = gitHead();
  const seeds = [];
  for (let s = opts.from; s <= opts.to; s++) seeds.push(s);

  if (opts.partialDir) mkdirSync(opts.partialDir, { recursive: true });

  const rows = [];
  const todo = [];
  for (const seed of seeds) {
    if (opts.partialDir) {
      const p = partialPath(opts.partialDir, seed);
      if (existsSync(p)) {
        rows.push(JSON.parse(readFileSync(p, 'utf8')));
        process.stderr.write(`resume seed=${seed}\n`);
        continue;
      }
    }
    todo.push(seed);
  }

  process.stderr.write(
    `run-seed-batch harness=${opts.harness} ranks=${opts.rank0}v${opts.rank1} ` +
    `seeds=${opts.from}..${opts.to} pending=${todo.length} resume=${seeds.length - todo.length} ` +
    `commit=${measureCommit.slice(0, 7)} heap=${process.env.SEED_BATCH_HEAP_MB || 8192}MB\n`,
  );

  const fresh = await mapPool(todo, opts.concurrency, async (seed) => {
    const row = await runWorker(opts, seed);
    process.stderr.write(
      `  seed=${seed} shots=${row.shots} fouls=${row.fouls} completed=${row.completed} cap=${row.capHit}\n`,
    );
    if (opts.partialDir) {
      writeFileSync(partialPath(opts.partialDir, seed), JSON.stringify(row) + '\n');
    }
    return row;
  });
  rows.push(...fresh);
  rows.sort((a, b) => a.seed - b.seed);

  const completed = rows.filter((r) => r.completed && !r.capHit);
  const capHits = rows.filter((r) => r.capHit);
  const completedRates = completed.map((r) => r.foulPerShot);
  const label =
    opts.label ||
    `${opts.harness} r${opts.rank0}v${opts.rank1} seeds ${opts.from}..${opts.to}`;

  const group = {
    id: label.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(),
    label,
    seedDeriv: seedDeriv(opts.harness),
    completedOnlyFoulMedian: median(completedRates),
    capHits: capHits.length,
    n: rows.length,
    capHitRate: rows.length ? capHits.length / rows.length : 0,
    completed: completed.length,
    completionRate: rows.length ? completed.length / rows.length : 0,
    measureCommitFromRun: measureCommit,
    seeds: rows,
  };

  const artifact = {
    schemaVersion: 1,
    title: 'seed-batch runner output',
    measureCommit,
    measureCommitShort: measureCommit.slice(0, 7),
    repro: `node scripts/run-seed-batch.mjs --harness ${opts.harness} --rank0 ${opts.rank0} --rank1 ${opts.rank1} --from ${opts.from} --to ${opts.to}`,
    metric: {
      name: 'foulPerShot',
      definition: 'foul shots / legal applyShot count',
      foulShot: 'after forceShot settles, session.isBallInHand === true',
      denominator: 'applyShot / shot loop count',
      completedOnlyMedian: 'median foulPerShot over completed=true AND capHit=false',
      capHitRateSeparate: true,
      authority: 'Kakashi-ruled metric; batch infra only',
    },
    maxShots: opts.maxShots,
    nSeeds: rows.length,
    seedRange: `${opts.from}..${opts.to} inclusive`,
    groups: [group],
    notes: [
      'One child process per seed (heap isolation).',
      seedDeriv(opts.harness),
      'Do not compare sp004 (*7919) vs headless (seed+shot) as the same ruler.',
    ],
  };

  const summary = {
    label: group.label,
    measureCommit,
    completedOnlyFoulMedian: group.completedOnlyFoulMedian,
    capHitRate: group.capHitRate,
    completionRate: group.completionRate,
    completed: group.completed,
    capHits: group.capHits,
    n: group.n,
  };
  process.stderr.write(`SUMMARY ${JSON.stringify(summary)}\n`);

  if (opts.out) {
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, JSON.stringify(artifact, null, 2) + '\n');
    process.stderr.write(`wrote ${opts.out}\n`);
  } else {
    process.stdout.write(JSON.stringify(artifact, null, 2) + '\n');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
