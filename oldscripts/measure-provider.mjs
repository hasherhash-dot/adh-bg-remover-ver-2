#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

/**
 * End-to-end performance of a running server.
 *
 *   node scripts/measure-provider.mjs [url] [image] [runs]
 *
 * Measures the complete HTTP request, not model time — validation, decode,
 * inference, full-resolution composite and encode included. That is what a user
 * waits for.
 *
 * Resident memory is read from the OS for the *server* process, not this one.
 * `process.memoryUsage()` here would describe the benchmark client and tell us
 * nothing about how many of these fit on a box.
 *
 * The first request is reported separately: it pays for session creation
 * (~180MB of weights, several hundred ms) and averaging it into the warm
 * numbers would flatter nothing and mislead everyone.
 */

const URL = process.argv[2] ?? 'http://localhost:3000';
const IMAGE = process.argv[3] ?? 'debug/input/portrait-1.jpg';
const RUNS = Number(process.argv[4] ?? 12);

const port = new global.URL(URL).port;

/** Working set of the process listening on the port, in MB. */
function serverRssMb() {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$p=(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess; ` +
          `if($p){[int]((Get-Process -Id $p).WorkingSet64/1MB)}else{0}`,
      ],
      { encoding: 'utf8', timeout: 20000 },
    );
    return Number(out.trim()) || 0;
  } catch {
    return 0;
  }
}

async function request(buffer, name) {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)]), name);
  const started = performance.now();
  const response = await fetch(`${URL}/api/remove-background`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const bytes = (await response.arrayBuffer()).byteLength;
  return {
    totalMs: Math.round(performance.now() - started),
    // Reported by the server, so we can separate its own view of inference
    // from network and encoding overhead.
    serverMs: Number(response.headers.get('X-Processing-Time-Ms')) || null,
    inferenceMs: Number(response.headers.get('X-Inference-Time-Ms')) || null,
    provider: response.headers.get('X-Provider'),
    width: Number(response.headers.get('X-Image-Width')),
    height: Number(response.headers.get('X-Image-Height')),
    bytes,
  };
}

async function main() {
  const buffer = await readFile(IMAGE);
  const name = IMAGE.split(/[\\/]/).pop();

  const health = await (await fetch(`${URL}/api/health`)).json();
  console.log(`\nurl      ${URL}`);
  console.log(`provider ${health.provider}  (${health.detail ?? ''})`);
  console.log(`image    ${IMAGE}\n`);

  const idle = serverRssMb();
  console.log(`RSS before any request       ${idle} MB`);

  // Cold: model not yet loaded.
  const cold = await request(buffer, name);
  const afterCold = serverRssMb();
  console.log(`\ncold request (loads model)   ${cold.totalMs} ms   server ${cold.serverMs} ms   inference ${cold.inferenceMs} ms`);
  console.log(`RSS after model load         ${afterCold} MB   (+${afterCold - idle} MB)`);
  console.log(`output                       ${cold.width}x${cold.height}, ${(cold.bytes / 1048576).toFixed(1)} MB, provider=${cold.provider}`);

  console.log(`\n${RUNS} sequential warm requests:\n`);
  console.log('  run   total    server   inference    RSS   delta vs run 1');
  console.log('  ' + '-'.repeat(58));

  const warm = [];
  let firstRss = 0;
  for (let i = 1; i <= RUNS; i += 1) {
    const r = await request(buffer, name);
    const rss = serverRssMb();
    if (i === 1) firstRss = rss;
    warm.push({ ...r, rss });
    const delta = rss - firstRss;
    console.log(
      `  ${String(i).padStart(3)}  ${String(r.totalMs).padStart(6)}ms  ${String(r.serverMs).padStart(6)}ms  ` +
        `${String(r.inferenceMs).padStart(7)}ms  ${String(rss).padStart(5)}MB  ${delta >= 0 ? '+' : ''}${delta} MB`,
    );
  }

  const totals = warm.map((r) => r.totalMs).sort((a, b) => a - b);
  const infers = warm.map((r) => r.inferenceMs).filter(Boolean).sort((a, b) => a - b);
  const rssValues = warm.map((r) => r.rss);
  const median = (a) => a[Math.floor(a.length / 2)];

  console.log(`\n  full request  median ${median(totals)} ms   min ${totals[0]} ms   max ${totals[totals.length - 1]} ms`);
  if (infers.length) console.log(`  inference     median ${median(infers)} ms`);
  console.log(`  peak RSS      ${Math.max(afterCold, ...rssValues)} MB`);
  console.log(`  steady RSS    ${median([...rssValues].sort((a, b) => a - b))} MB`);
  console.log(`  growth        run 1 ${firstRss} MB -> run ${RUNS} ${rssValues[rssValues.length - 1]} MB  (${rssValues[rssValues.length - 1] - firstRss >= 0 ? '+' : ''}${rssValues[rssValues.length - 1] - firstRss} MB)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
