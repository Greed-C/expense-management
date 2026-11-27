const { chromium, devices } = require('playwright');
const CFG = `window.EM_FIREBASE={apiKey:'k',projectId:'p',googleClientId:'gid',authBase:'http://localhost:8790/auth',tokenBase:'http://localhost:8790/token',firestoreBase:'http://localhost:8790/fs'};`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const errs = [];
  async function dev(name) {
    const ctx = await b.newContext({ ...devices['Pixel 7'] });
    await ctx.route('**/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: CFG }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()) });
    await p.goto('http://localhost:8765/'); await sleep(300); return p;
  }
  async function add(p, amt, catId) { await p.click('#fab'); await p.fill('#f_amount', String(amt)); await p.click(`[data-cat="${catId}"]`); await p.click('#saveBtn'); await sleep(200) }
  async function settings(p) { await p.evaluate(() => { VIEW = 'settings'; render() }); await sleep(200) }
  async function login(p, email, pw, create) { await settings(p); await p.fill('#sy_email', email); await p.fill('#sy_pw', pw); await p.click(`[data-sync="${create ? 'new' : 'in'}"]`); await sleep(3500) }
  const amounts = p => p.evaluate(() => Object.values(window.__EM.S.expenses).map(e => e.amount).sort((a, b) => a - b).join(','));

  const A = await dev('A'), B = await dev('B');
  await add(A, 111, 'fun'); await login(A, 'a@x.com', 'password1', true);
  console.log('A status:', await A.textContent('#syncStatus'));
  await add(B, 222, 'car'); await login(B, 'a@x.com', 'password1', false);
  console.log('B after login:', await amounts(B), '|', await B.textContent('#syncStatus'));
  await A.evaluate(() => EMSync.syncNow()); await sleep(800);
  console.log('A after sync:', await amounts(A));
  // edit + delete propagation
  await A.evaluate(() => { VIEW = 'list'; render() }); await sleep(200);
  await add(A, 333, 'groceries'); await sleep(2600);
  await B.evaluate(() => EMSync.syncNow()); await sleep(800);
  console.log('B sees new:', await amounts(B));
  const delId = await B.evaluate(() => Object.entries(window.__EM.S.expenses).find(([, e]) => e.amount === 111)[0]);
  await B.evaluate(id => { /* delete through app db api */ return window.__EM && document.dispatchEvent(new Event('x')) }, delId);
  await B.evaluate(async id => { const S = window.__EM.S; delete S.expenses[id]; const k = 'expenses__' + id; S.__m[k] = Date.now(); S.__dirty[k] = 1; window.__EM.persist(); window.__EM.fire('expenses'); await EMSync.syncNow() }, delId);
  await sleep(500); await A.evaluate(() => EMSync.syncNow()); await sleep(800);
  console.log('A after B deleted 111:', await amounts(A));
  // cloud is encrypted
  const dump = JSON.stringify(await (await fetch('http://localhost:8790/__dump')).json());
  console.log('plaintext in cloud?', /333|222|groceries|fun|car|amount|"name"/.test(dump.replace(/"(stringValue|integerValue)":"[^"]*"/g, '""').replace(/__[a-z0-9]+/g, '')));
  // reload persists session
  await A.reload(); await sleep(1500); await settings(A); console.log('A after reload:', await A.textContent('#syncStatus'));
  // password changed elsewhere -> mismatch flow
  await fetch('http://localhost:8790/__setpw', { method: 'POST', body: JSON.stringify({ email: 'a@x.com', pw: 'newpass99' }) });
  const C = await dev('C'); await add(C, 444, 'fuel'); await login(C, 'a@x.com', 'newpass99', false);
  console.log('C mismatch card:', (await C.textContent('#syncCard')).slice(0, 60));
  await C.fill('#sy_key','newpass99'); await C.click('[data-sync="kreset"]'); await sleep(200); await C.click('[data-sync="kreset"]'); await sleep(3000);
  console.log('C after reset:', await C.textContent('#syncStatus'), await amounts(C));
  // wrong password message
  const D = await dev('D'); await login(D, 'a@x.com', 'nope12345', false); console.log('D msg:', await D.textContent('#syncMsg'));
  // ---- Google: Android bridge on device G1 ----
  const G1 = await dev('G1');
  await G1.evaluate(() => { window.EMAndroid = { googleSignIn: id => setTimeout(() => window.__gsiResult('FAKE-g@x.com', ''), 100) } });
  await add(G1, 555, 'pets'); await settings(G1); await G1.click('[data-sync="google"]'); await sleep(1500);
  console.log('G1 needs new key:', !!(await G1.$('#sy_key2')));
  await G1.fill('#sy_key', 'syncpass1'); await G1.fill('#sy_key2', 'syncpass1'); await G1.click('[data-sync="knew"]'); await sleep(2500);
  console.log('G1 status:', await G1.textContent('#syncStatus'));
  // ---- Google: web redirect return on device G2 ----
  const G2 = await dev('G2');
  await G2.evaluate(() => localStorage.setItem('em_gsi', 'N1'));
  await G2.goto('about:blank'); await G2.goto('http://localhost:8765/#id_token=FAKE-g@x.com&state=N1'); await sleep(2000);
  console.log('G2 url clean:', !G2.url().includes('id_token'), '| join prompt:', !!(await G2.$('#sy_key')) && !(await G2.$('#sy_key2')));
  await G2.fill('#sy_key', 'wrongpass1'); await G2.click('[data-sync="kjoin"]'); await sleep(1500); console.log('G2 wrong:', await G2.textContent('#syncMsg'));
  await G2.fill('#sy_key', 'syncpass1'); await G2.click('[data-sync="kjoin"]'); await sleep(2500);
  console.log('G2 data:', await amounts(G2), '|', await G2.textContent('#syncStatus'));
  // bad state is rejected
  const G3 = await dev('G3'); await G3.goto('about:blank'); await G3.goto('http://localhost:8765/#id_token=FAKE-g@x.com&state=evil'); await sleep(1500); console.log('G3 rejected:', await G3.textContent('#syncMsg'));
  // idle polling cost: 5 syncs with no changes should cost ~5 reads, not hundreds
  const r0 = (await (await fetch('http://localhost:8790/__reads')).json()).reads;
  for (let i = 0; i < 5; i++) { await G2.evaluate(() => EMSync.syncNow()); await sleep(300) }
  const r1 = (await (await fetch('http://localhost:8790/__reads')).json()).reads;
  console.log('reads for 5 idle syncs:', r1 - r0);
  console.log('errors:', errs); await b.close();
})();
