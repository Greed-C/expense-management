// Strict QA: text hygiene, overlays, empty/max data, math consistency, tap targets, edge cases.
const { chromium, devices } = require('playwright');
const URL = 'http://localhost:8765/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = new Date(); const Y = now.getFullYear(), M = now.getMonth() + 1;
const p2 = n => String(n).padStart(2, '0'); const d = (y, m, dd) => `${y}-${p2(m)}-${p2(dd)}`;
const pm = M === 1 ? [Y - 1, 12] : [Y, M - 1];
function seedNormal(en) {
  const S = { expenses: {}, income: {}, settings: {}, recurring: {} }; let n = 0;
  const add = (c, o) => { S[c]['q' + (++n)] = { source: 'app', created: Date.now() - n * 1000, ...o } };
  add('expenses', { name: en ? 'Supermarket' : 'שופרסל דיל', amount: 412.905, cat: 'groceries', kind: '', date: d(Y, M, 1), method: 'card', note: '' });
  add('expenses', { name: en ? 'A very very long expense name to test wrapping on a small phone screen and more' : 'שם ארוך מאוד מאוד של הוצאה כדי לבדוק שבירת שורות בטלפון קטן במיוחד ועוד קצת', amount: 1234567.891, cat: 'shopping', kind: '', date: d(Y, M, 2), method: 'bit', note: en ? 'long note long note long note long note long note' : 'הערה ארוכה מאוד מאוד מאוד מאוד' });
  add('expenses', { name: '<img src=x onerror=alert(1)> "q" & \'a\'', amount: 0.1, cat: 'other', kind: 'need', date: d(Y, M, 1), method: 'cash', note: '<b>x</b>' });
  add('expenses', { name: 'x', amount: 0.2, cat: 'other', kind: 'need', date: d(Y, M, 1), method: 'cash', note: '' });
  add('expenses', { name: 'Netflix', amount: 54.9, cat: 'subs', kind: '', date: d(pm[0], pm[1], 15), method: 'card', note: '' });
  add('expenses', { name: en ? 'Fund' : 'קרן השתלמות', amount: 2000, cat: 'savings', kind: '', date: d(Y, M, 3), method: 'transfer', note: '' });
  add('expenses', { name: 'c', amount: 77, cat: 'c_long', kind: '', date: d(Y, M, 2), method: 'card', note: '' });
  add('income', { name: en ? 'Salary' : 'משכורת', amount: 13500.5, date: d(Y, M, 1), type: 'salary', note: '' });
  add('income', { name: en ? 'Salary' : 'משכורת', amount: 13200, date: d(pm[0], pm[1], 1), type: 'salary', note: '' });
  add('recurring', { name: en ? 'Car insurance' : 'ביטוח רכב', amount: 300, cat: 'car', kind: 'need', method: 'standing', note: '', start: d(pm[0], pm[1], 28), end: '' });
  S.settings.main = { income: 14000, budgets: { groceries: 300, shopping: 500, c_long: 100 }, carryFrom: null,
    cats: [{ id: 'c_long', name: en ? 'Wwwwwwwwwwwwwwwwwwwwwwww' : 'אאאאאאאאאאאאאאאאאאאאאאאא', e: '🏷️', type: 'wants' }] };
  return S;
}
function seedMax() {
  const S = { expenses: {}, income: {}, settings: {}, recurring: {} };
  S.income.i1 = { source: 'app', created: 1, name: 'משכורת', amount: 9999999, date: d(Y, M, 1), type: 'salary', note: '' };
  S.expenses.e1 = { source: 'app', created: 2, name: 'הוצאה', amount: 4999999.999, cat: 'shopping', kind: '', date: d(Y, M, 1), method: 'card', note: '' };
  S.expenses.e2 = { source: 'app', created: 3, name: 'השקעה', amount: 4999999.999, cat: 'savings', kind: '', date: d(Y, M, 1), method: 'card', note: '' };
  S.settings.main = { income: 9999999, budgets: { shopping: 9999999 }, carryFrom: null };
  return S;
}
const seedEmpty = () => ({ expenses: {}, income: {}, settings: {}, recurring: {} });

(async () => {
  const b = await chromium.launch(); const out = []; let pass = 0;
  const ok = (n, c, i = '') => { if (c) pass++; else out.push('FAIL ' + n + (i ? ' — ' + i : '')) };
  const open = async (dv, S, lang, theme) => {
    const ctx = await b.newContext({ ...dv, colorScheme: theme || 'light' }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('dialog', x => { errs.push('DIALOG ' + x.message()); x.dismiss() });
    await p.goto(URL); await p.evaluate(([S, lang]) => { localStorage.clear(); localStorage.setItem('expense_mgmt_v1', JSON.stringify(S)); localStorage.setItem('mm_lang', lang); localStorage.setItem('em_hint_off', '1') }, [S, lang]);
    await p.reload(); await sleep(350); return { p, ctx, errs };
  };
  // generic screen check: bad tokens, float junk, off-screen, clipped (ellipsis allowed), Hebrew in English mode
  const screenCheck = (p, scope, en) => p.evaluate(([scope, en]) => {
    const vw = document.documentElement.clientWidth, I = [];
    const roots = [...document.querySelectorAll(scope)].filter(r => r.getBoundingClientRect().width);
    if (document.documentElement.scrollWidth > vw + 1) { let w = ''; document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (!w && r.width && (r.right > vw + 1 || r.left < -1) && !e.closest(scope)) w = e.tagName + '#' + e.id + '.' + e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right) }); I.push('page wider than screen ' + document.documentElement.scrollWidth + ' ' + w) }
    for (const root of roots) {
      const txt = [...root.querySelectorAll('*')].length ? (root.innerText || '').replace(/עברית/g, '').replace((document.getElementById('langBtn') || {}).innerText || '\u0000', '') : (root.innerText || '');
      const bad = txt.match(/\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object|\d\.\d{4,}|₪-|--₪/);
      if (bad) I.push('bad text "' + bad[0] + '"');
      if (en) { const userish = /[א-ת]/.test(txt.replace(/עברית/g, '')); if (userish) I.push('Hebrew in English mode: "' + (txt.match(/.{0,15}[א-ת]+.{0,10}/) || [''])[0].replace(/\n/g, ' ') + '"') }
      root.querySelectorAll('*').forEach(e => {
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) return; const cs = getComputedStyle(e); if (cs.visibility === 'hidden') return;
        if (r.right > vw + 1 || r.left < -1) I.push('off-screen ' + e.tagName + '.' + e.className + ' "' + (e.textContent || '').trim().slice(0, 25) + '"');
        if (e.children.length === 0 && cs.textOverflow !== 'ellipsis' && !['INPUT', 'SELECT', 'TEXTAREA', 'svg', 'path'].includes(e.tagName)) {
          if (e.scrollWidth > e.clientWidth + 2 && cs.overflow !== 'visible') I.push('clipped ' + e.tagName + '.' + e.className + ' "' + e.textContent.trim().slice(0, 25) + '"');
          if (cs.overflow === 'visible' && e.parentElement) { const pr = e.parentElement.getBoundingClientRect(), pcs = getComputedStyle(e.parentElement); if (pcs.overflow === 'visible' && (r.right > pr.right + 3 || r.left < pr.left - 3) && e.textContent.trim()) I.push('sticks out of box ' + e.tagName + '.' + e.className + ' "' + e.textContent.trim().slice(0, 25) + '"') }
        }
      });
    }
    return [...new Set(I)].slice(0, 6);
  }, [scope, en]);

  const DEV = { PC: { viewport: { width: 1366, height: 820 } }, Android: devices['Pixel 7'], iPhoneSE: devices['iPhone SE'], iPhone14: devices['iPhone 14 Pro Max'] };
  // 0 translations: every key exists in both languages
  { const { p, ctx } = await open(DEV.Android, seedEmpty(), 'he');
    const miss = await p.evaluate(() => { const a = Object.keys(T.he), b = Object.keys(T.en); return a.filter(k => !(k in T.en)).map(k => 'en:' + k).concat(b.filter(k => !(k in T.he)).map(k => 'he:' + k)).concat([...a, ...b].filter(k => (T.he[k] ?? T.en[k]) === '')) });
    ok('every text has Hebrew + English', miss.length === 0, miss.join(',')); await ctx.close() }

  // 1 every screen + every pop-up, all devices, both languages, both themes, three data sets
  for (const [dn, dv] of Object.entries(DEV).filter(([k]) => !process.env.ONLY || k === process.env.ONLY)) for (const lang of ['he', 'en']) for (const [sn, S] of [['normal', seedNormal(lang === 'en')], ['empty', seedEmpty()], ['max', seedMax()], ['cardday', (() => { const z = seedNormal(lang === 'en'); z.settings.main.cardDay = 2; return z })()]]) for (const theme of (sn === 'normal' ? ['light', 'dark'] : ['light'])) {
    const { p, ctx, errs } = await open(dv, S, lang, theme); const en = lang === 'en' && sn !== 'max'; const tag = `${dn}/${lang}/${sn}/${theme}`;
    for (const v of ['home', 'list', 'budget', 'year', 'settings']) {
      await p.evaluate(v => { VIEW = v; BEDIT = false; render(); scrollTo(0, 0) }, v); await sleep(150);
      const r = await screenCheck(p, '#hdr, #view, #tabs', en); ok(`${tag} ${v}`, !r.length, r.join(' | '));
      if (v === 'budget') { await p.evaluate(() => { BEDIT = true; render() }); await sleep(100); const r2 = await screenCheck(p, '#view', en); ok(`${tag} budget-edit`, !r2.length, r2.join(' | ')); await p.evaluate(() => { BEDIT = false; render() }) }
    }
    // pop-ups
    const pops = [
      ['add expense', 'openSheet(null)', '#sheet'], ['add income', 'openSheet(null,"inc")', '#sheet'],
      ['category editor', 'openCatEditor(null,"sheet")', '#catbg'], ['date picker', 'openSheet(null);openPicker({value:isoToday(),mode:"day",onPick:()=>{}})', '#pkbg'],
    ];
    if (sn !== 'empty') pops.push(['day details', 'VIEW="home";render();openDay(1)', '#daybg'], ['edit expense', 'openSheet(EXP.find(e=>!e.virtual)||EXP[0])', '#sheet']);
    for (const [nm, js, sc] of pops) {
      const e = await p.evaluate(js => { try { closeSheet && closeSheet(); closeCatEditor && closeCatEditor(); closeDay && closeDay(); closePicker && closePicker() } catch (e) { } try { eval(js); return '' } catch (e) { return e.message } }, js); await sleep(200);
      if (e) { ok(`${tag} open ${nm}`, false, e); continue }
      const r = await screenCheck(p, sc, en); ok(`${tag} ${nm}`, !r.length, r.join(' | '));
    }
    ok(`${tag} no script errors`, !errs.length, errs.join(' | ')); await ctx.close();
  }

  // 2 math: header, ledger, wheel, year all agree
  for (const [sn, S] of [['normal', seedNormal()], ['max', seedMax()], ['cardday', (() => { const z = seedNormal(); z.settings.main.cardDay = 2; return z })()]]) {
    const { p, ctx } = await open(DEV.Android, S, 'he');
    const m = await p.evaluate(() => {
      VIEW = 'home'; render(); const { y, m } = CUR; const s = monthStats(y, m); const R = {};
      R.header = document.querySelector('.hero2 .amt').textContent.trim() === ils(s.LEFT);
      const { n, D } = dayData(y, m); R.ledgerEnd = Math.abs(D[n].bal - s.LEFT) < 1e-6;
      const L = EXP.filter(e => inMonth(e, y, m)); const w = wheelData(L);
      R.wheel100 = !w.tot || Math.abs(w.parts.reduce((a, x) => a + x.p, 0) - 100) < 1e-6;
      R.wheelTot = Math.abs(w.tot - (s.OUT + s.INV)) < 1e-6;
      R.leftFormula = Math.abs(s.LEFT - (s.CARRY + s.IN - s.OUT - s.INV)) < 1e-6;
      let sumOut = 0; for (let k = 1; k <= 12; k++) sumOut += monthStats(y, k).OUT;
      R.yearOut = Math.abs(sumOut - EXP.filter(e => e.date && e.date.startsWith(y + '-') && !isSave(e)).reduce((a, e) => a + (+e.amount || 0), 0)) < 1e-6;
      R.janCarry = carryInto(y + 1, 1) === 0;
      R.nextCarry = m === 12 || Math.abs(carryInto(y, m + 1) - Math.max(0, s.LEFT)) < 1e-6 || Math.abs(carryInto(y, m + 1) - s.LEFT) < 1e-6;
      return R;
    });
    for (const [k, v] of Object.entries(m)) ok(`math ${sn}: ${k}`, v);
    await ctx.close();
  }

  // 3 tap targets: every visible button is big enough and not covered (phone sizes)
  for (const dn of ['Android', 'iPhoneSE']) {
    const { p, ctx } = await open(DEV[dn], seedNormal(), 'he');
    for (const v of ['home', 'list', 'budget', 'year', 'settings']) {
      await p.evaluate(v => { VIEW = v; render(); scrollTo(0, 0) }, v); await sleep(120);
      const bad = await p.evaluate(async () => {
        const B = []; const els = [...document.querySelectorAll('#view button:not([disabled]), #view [data-editcat], #view a, #tabs button, #hdr button, #fab')].filter(e => e.getBoundingClientRect().width);
        for (const e of els) {
          e.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 0)); const r = e.getBoundingClientRect();
          if (r.height < 22 || r.width < 22) B.push('too small ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + e.textContent.trim().slice(0, 18) + '"');
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit && !e.contains(hit) && !hit.contains(e) && !hit.closest('#tabs,#fab,#hdr') ) B.push('covered "' + e.textContent.trim().slice(0, 18) + '" by ' + hit.tagName + '.' + hit.className);
        }
        return [...new Set(B)].slice(0, 5);
      });
      ok(`${dn} ${v} buttons tappable`, !bad.length, bad.join(' | '));
    }
    await ctx.close();
  }

  // 4 behaviour edge cases
  { const { p, ctx, errs } = await open(DEV.Android, seedEmpty(), 'he');
    const n = () => p.evaluate(() => RAW.length);
    await p.evaluate(() => { VIEW = 'home'; render(); openSheet(null) }); await p.fill('#f_amount', '5'); await p.click('[data-cat="fuel"]');
    await p.evaluate(() => { const s = document.getElementById('saveBtn'); s.click(); s.click() }); await sleep(500);
    ok('double-tap save makes one item', (await n()) === 1, String(await n()));
    for (const a of ['0.1', '0.2']) { await p.evaluate(() => openSheet(null)); await p.fill('#f_amount', a); await p.click('[data-cat="fuel"]'); await p.click('#saveBtn'); await sleep(250) }
    await p.evaluate(() => { VIEW = 'list'; render() }); const lt = await p.innerText('#view');
    ok('no float junk (0.1+0.2)', !/\d\.\d{4,}/.test(lt));
    // yearly cap with income
    await p.evaluate(() => { openSheet(null, 'inc') }); await sleep(250); await p.fill('#f_amount', '9999999'); await p.click('#saveBtn'); await sleep(300);
    const i1 = await p.evaluate(() => INC.length); await p.evaluate(() => { openSheet(null, 'inc') }); await sleep(250); await p.fill('#f_amount', '1'); await p.click('#saveBtn'); await sleep(300);
    ok('yearly income cap 9,999,999', (await p.evaluate(() => INC.length)) === i1 && i1 >= 1, `${i1} -> ${await p.evaluate(() => INC.length)}`);
    await p.evaluate(() => { try { closeSheet() } catch (e) { } });
    await p.evaluate(() => { openSheet(null) }); await p.fill('#f_amount', '9999999'); await p.click('[data-cat="fuel"]'); await p.click('#saveBtn'); await sleep(300);
    const before = await n(); await p.evaluate(() => { try { closeSheet() } catch (e) { } openSheet(null) }); await p.fill('#f_amount', '9999999'); await p.click('[data-cat="fuel"]'); await p.click('#saveBtn'); await sleep(300);
    ok('yearly spending cap 9,999,999', (await n()) === before, `${before} -> ${await n()}`); await p.evaluate(() => { try { closeSheet() } catch (e) { } });
    // fast tab switching
    for (let i = 0; i < 40; i++) await p.click(['#t_home', '#t_list', '#t_budget', '#t_year'][i % 4]);
    ok('40 fast tab switches, no errors', !errs.length, errs.join('|'));
    // month navigation across the year change
    await p.evaluate(() => { VIEW = 'home'; CUR = { y: CUR.y, m: 12 }; render() }); await p.click('#next').catch(() => { }); await sleep(100);
    const c1 = await p.evaluate(() => CUR); ok('Dec → next = Jan next year', c1.m === 1);
    await p.click('#prev').catch(() => { }); await sleep(100); const c2 = await p.evaluate(() => CUR); ok('Jan → prev = Dec', c2.m === 12 && c2.y === c1.y - 1);
    // language + theme survive reopening
    await p.click('#langBtn'); await p.evaluate(() => { VIEW = 'settings'; render() }); await p.click('[data-theme-set="dark"]'); await p.reload(); await sleep(350);
    ok('language + theme remembered', await p.evaluate(() => LANG === 'en' && document.documentElement.dataset.theme === 'dark'));
    await ctx.close() }

  console.log(out.join('\n')); console.log(`\nPASS ${pass}  FAIL ${out.length}`); await b.close();
})();
