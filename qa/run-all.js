// Runs every QA suite against a fresh build: node qa/run-all.js   (or: npm test)
// Starts the local server and the Firebase mock itself. Prints one summary line per suite.
const { spawn, spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const Q = __dirname; const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = spawnSync('node', [path.join(Q, '..', 'tools', 'build.js')], { stdio: 'inherit' }); if (b.status) process.exit(1);
  const srv = spawn('node', [path.join(Q, 'serve.js')], { stdio: 'ignore' }), mock = spawn('node', [path.join(Q, 'mockfb.js')], { stdio: 'ignore' });
  await sleep(1200); let bad = 0;
  const suites = [['strict', 'strict.js'], ['features', 'features.js'], ['xlsx', 'xlsx.js'], ['sync', 'sync.js']];
  for (const f of fs.existsSync(path.join(Q, 'private')) ? fs.readdirSync(path.join(Q, 'private')).filter(f => f.endsWith('.js')) : []) suites.push(['private/' + f, path.join('private', f)]);
  for (const [name, file] of suites) {
    const r = spawnSync('node', [path.join(Q, file)], { encoding: 'utf8', timeout: 900000 }); const out = (r.stdout || '') + (r.stderr || '');
    if (/^SKIP/m.test(out) && !/^(PASS|FAIL)/m.test(out)) { console.log(`${name}: skipped (its real statement file is not in qa/private)`); continue }
    const pass = (out.match(/^PASS/gm) || []).length, fail = (out.match(/^FAIL/gm) || []).length; const strictSum = out.match(/PASS (\d+)\s+FAIL (\d+)/);
    let line;
    if (name === 'sync') { const okSync = /plaintext in cloud\? false/.test(out) && /reads for 5 idle syncs: 5/.test(out) && !/Error|Timeout/.test(out); line = okSync ? 'sync OK' : 'sync FAILED'; if (!okSync) bad++ }
    else if (strictSum) { line = `${name}: PASS ${strictSum[1]} FAIL ${strictSum[2]}`; if (+strictSum[2] || r.status) bad++ }
    else { line = `${name}: PASS ${pass} FAIL ${fail}`; if (fail || r.status || !pass) bad++ }
    console.log(line); if (/FAIL/.test(line) || /FAILED/.test(line) || r.status) console.log(out.split('\n').filter(l => /^FAIL|Error/.test(l)).slice(0, 15).join('\n'));
  }
  srv.kill(); mock.kill(); console.log(bad ? `\n${bad} suite(s) failed` : '\nAll suites passed'); process.exit(bad ? 1 : 0);
})();
