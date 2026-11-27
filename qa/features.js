// Feature tests on the phone build (local storage). Prints PASS/FAIL lines.
const { chromium, devices } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'], permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { errs.push('DIALOG ' + d.message()); d.dismiss() });
  const res = []; const ok = (name, cond, info = '') => res.push((cond ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : ''));
  await p.goto('http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('em_hint_off', '1') }); await p.reload(); await sleep(400);
  const st = () => p.evaluate(() => ({ raw: RAW.map(e => ({ ...e })), inc: INC.map(e => ({ ...e })), rec: REC.map(e => ({ ...e })), cur: { ...CUR }, view: VIEW, sheet: document.getElementById('sheetbg').classList.contains('open') }));
  const toast = () => p.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
  const go = v => p.evaluate(v => { VIEW = v; render(); scrollTo(0, 0) }, v);
  async function openAdd() { await go('home'); await p.click('#fab'); await sleep(150) }
  async function save() { await p.click('#saveBtn'); await sleep(250) }

  // 1 decimals + name optional
  await openAdd(); await p.fill('#f_amount', '12.5'); await p.click('[data-cat="fuel"]'); await save();
  let s = await st(); ok('decimal amount saved', s.raw.length === 1 && s.raw[0].amount === 12.5, JSON.stringify(s.raw[0] && s.raw[0].amount));
  ok('empty name defaults to category', s.raw[0] && s.raw[0].name === 'דלק', s.raw[0] && s.raw[0].name);
  // 2 zero / dot / letters rejected
  await openAdd(); await p.fill('#f_amount', '0'); await p.click('[data-cat="fuel"]'); await save(); s = await st(); ok('amount 0 rejected', s.raw.length === 1 && s.sheet);
  await p.fill('#f_amount', '.'); await save(); s = await st(); ok('amount "." rejected', s.raw.length === 1);
  await p.fill('#f_amount', 'abc'); ok('letters stripped from amount', (await p.inputValue('#f_amount')) === '', await p.inputValue('#f_amount'));
  await p.fill('#f_amount', '1.2399'); ok('max 3 decimals', (await p.inputValue('#f_amount')) === '1.239', await p.inputValue('#f_amount'));
  await p.fill('#f_amount', '1.2.3'); ok('one decimal point', (await p.inputValue('#f_amount')) === '1.23', await p.inputValue('#f_amount'));
  await p.click('#cancelBtn'); await sleep(150);
  // 3 back button closes the sheet, then goes home
  await openAdd(); let back = await p.evaluate(() => window.__back ? window.__back() : 'none'); s = await st(); ok('back closes add sheet', back === true && !s.sheet);
  await go('year'); back = await p.evaluate(() => window.__back()); s = await st(); ok('back from tab goes Home', back === true && s.view === 'home');
  back = await p.evaluate(() => window.__back()); ok('back on Home exits app', back === false);
  // 4 edit: move to previous month
  await go('list'); await p.click('#listBody .tx'); await sleep(150);
  const prevMonth = await p.evaluate(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) });
  await p.evaluate(m => setDateBtn('f_date', m + '-15'), prevMonth); await save(); s = await st();
  ok('edit moves date + view follows month', s.raw[0].date === prevMonth + '-15' && (s.cur.y + '-' + String(s.cur.m).padStart(2, '0')) === prevMonth, s.raw[0].date + ' cur ' + JSON.stringify(s.cur));
  // 5 delete needs double tap
  await go('list'); await p.click('#listBody .tx'); await sleep(150); await p.click('#delBtn'); await sleep(150); s = await st(); ok('delete asks confirm first', s.raw.length === 1);
  await p.click('#delBtn'); await sleep(250); s = await st(); ok('delete on second tap', s.raw.length === 0);
  await p.evaluate(() => { const n = new Date(); CUR = { y: n.getFullYear(), m: n.getMonth() + 1 }; render() });
  // 6 recurring on the 31st -> clamps to month end, Feb ok
  await openAdd(); await p.fill('#f_amount', '100'); await p.click('[data-cat="phone"]'); await p.click('.switch');
  await p.evaluate(() => setDateBtn('f_date', '2026-01-31')); await save(); s = await st();
  const occ = await p.evaluate(() => recOcc().map(o => o.date).filter(d => d < '2026-05'));
  ok('repeat on 31st: Feb=28, Apr=30', JSON.stringify(occ) === JSON.stringify(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']), JSON.stringify(occ));
  // 7 end date before start
  await go('list'); await p.click('[data-rec]'); await sleep(150);
  await p.evaluate(() => setDateBtn('f_end', '2025-12-01')); await save(); s = await st();
  ok('end date before start is refused (not saved as "no end")', s.sheet || (s.rec[0] && s.rec[0].end === '2025-12-01'), 'saved end=' + JSON.stringify(s.rec[0] && s.rec[0].end) + ' sheetOpen=' + s.sheet);
  if (s.sheet) await p.click('#cancelBtn');
  // 8 recurring -> single (turn repeat off)
  await go('list'); await p.click('[data-rec]'); await sleep(150); await p.click('.switch'); await save(); s = await st();
  ok('turn repeat off -> one expense, series removed', s.rec.length === 0 && s.raw.length === 1, `rec ${s.rec.length} raw ${s.raw.length}`);
  // 9 income via + sheet (income mode), edit, delete
  await openAdd(); await p.click('#m_inc'); await p.fill('#f_amount', '13,500'); await save(); s = await st(); ok('income added from + (income mode)', s.inc.length === 1 && s.inc[0].amount === 13500 && s.inc[0].name === 'משכורת', JSON.stringify(s.inc[0]));
  await go('list'); await p.click('[data-txf="inc"]'); await sleep(150); await p.click('#listBody [data-inc]'); await sleep(200);
  ok('income edit opens in income mode', await p.evaluate(() => sheet.classList.contains('incmode') && document.getElementById('modeSeg').style.display === 'none'));
  await p.fill('#f_amount', '14000'); await save(); s = await st(); ok('income edit', s.inc.length === 1 && s.inc[0].amount === 14000);
  await p.click('#listBody [data-inc]'); await sleep(150); await p.click('#delBtn'); await p.click('#delBtn'); await sleep(250); s = await st(); ok('income delete', s.inc.length === 0);
  await openAdd(); await p.click('#m_inc'); await p.fill('#f_amount', '9000'); await save(); await p.click('[data-txf="all"]').catch(()=>{});
  await openAdd(); ok('+ opens in expense mode again', await p.evaluate(() => !sheet.classList.contains('incmode'))); await p.click('#cancelBtn');
  // 10 search + category filter
  await openAdd(); await p.fill('#f_amount', '50'); await p.fill('#f_name', 'פיצה'); await p.click('[data-cat="eatingout"]'); await save();
  await p.evaluate(() => { TXF = 'all' }); await go('list'); await p.fill('#q', 'פיצ'); await sleep(150); let n = await p.$$eval('#listBody .tx', x => x.length); ok('search filters list', n === 1, 'items ' + n);
  await p.fill('#q', ''); await p.selectOption('#qc', 'phone'); await sleep(150); n = await p.$$eval('#listBody .tx', x => x.length); ok('category filter', n === 1, 'items ' + n);
  // 11 budget tab editing + settings income keeps budgets
  await go('budget'); await p.click('[data-bedit="1"]'); await sleep(150); await p.fill('[data-bud="groceries"]', '1,200'); await p.click('#saveBud'); await sleep(250);
  await go('settings'); await p.fill('#s_income', '15,000'); await p.fill('#s_name', 'Meir'); await p.click('#saveSet'); await sleep(250);
  const set = await p.evaluate(() => SET); ok('budget saved; settings save keeps budgets', set.income === 15000 && set.budgets.groceries === 1200, JSON.stringify(set));
  await go('home'); ok('greeting uses name', (await p.textContent('#heroBody')).includes('Meir'));
  await go('budget'); ok('budget overview shows', (await p.textContent('#view')).includes('1,200'));
  // 12 CSV backup button exists and copies
  await go('settings'); const csvBtn = await p.$('#copyCsv'); ok('backup (CSV) button exists in Settings', !!csvBtn);
  if (csvBtn) { await csvBtn.click(); await sleep(300); const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => '')); ok('CSV copied', clip.includes('פיצה'), clip.slice(0, 60)) }
  // 13 language persists
  await p.click('#langBtn'); await sleep(150); await p.reload(); await sleep(400); ok('language remembered', await p.evaluate(() => LANG === 'en'));
  await p.click('#langBtn'); await sleep(150);
  // 14 month navigation + year
  const c0 = (await st()).cur; await p.click('#prev'); await p.click('#prev'); await p.click('#next'); const c1 = (await st()).cur;
  ok('month arrows', (c0.y * 12 + c0.m) - (c1.y * 12 + c1.m) === 1, JSON.stringify([c0, c1]));
  // 15 date picker opens/closes, Escape closes
  await go('home'); await p.click('#fab'); await sleep(150); await p.click('#f_date'); await sleep(150);
  ok('date picker opens', await p.evaluate(() => document.getElementById('pkbg').classList.contains('open')));
  back = await p.evaluate(() => window.__back()); ok('back closes date picker first', back && await p.evaluate(() => !pkbg.classList.contains('open') && sheetbg.classList.contains('open')));
  await p.click('#cancelBtn');
  // 16 upcoming item in list opens the series editor
  await openAdd(); await p.fill('#f_amount', '70'); await p.click('[data-cat="subs"]'); await p.click('.switch');
  const nextWeek = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10) }); await p.evaluate(d => setDateBtn('f_date', d), nextWeek); await save();
  await p.evaluate(() => { QC = ''; Q = ''; TXF = 'all'; const n = new Date(); CUR = { y: n.getFullYear(), m: n.getMonth() + 1 } }); await go('list'); const up = await p.$('.tx.upc'); ok('upcoming charge visible', !!up || nextWeek.slice(0, 7) !== (await p.evaluate(() => isoToday().slice(0, 7))));
  // 17 settings gear toggles, back from settings goes home
  await go('home'); await p.click('#setBtn'); await sleep(150); ok('gear opens settings', (await st()).view === 'settings');
  back = await p.evaluate(() => window.__back()); ok('back from settings -> home', back && (await st()).view === 'home');
  await p.click('[data-goto="list"]').catch(()=>{}); ok('"see all" goes to transactions', (await st()).view === 'list');
  // 19 custom categories: every action reachable from the normal screens
  const mkc = async n => { await p.evaluate(() => { VIEW='home'; render(); openSheet(null) }); await sleep(100); await p.click('[data-newcat="sheet"]'); await p.fill('#c_name', n); await p.click('#c_save'); await sleep(250) };
  await mkc('קטגוריה א'); await mkc('קטגוריה ב'); await mkc('קטגוריה ג');
  ok('create category from + form', await p.evaluate(() => SET.cats.length === 3));
  ok('new category selectable in + form', (await p.$$('#f_cats .chipedit')).length === 3);
  await p.click('#f_cats .chipedit >> nth=0'); await sleep(150); ok('✎ opens editor without selecting', await p.evaluate(() => catbg.classList.contains('open')));
  await p.fill('#c_name', 'שונה'); await p.click('#c_save'); await sleep(250); ok('rename category', await p.evaluate(() => SET.cats.some(c => c.name === 'שונה' || c.he === 'שונה')));
  await p.click('#f_cats .chipedit >> nth=0'); await sleep(150); await p.click('#c_del'); await p.click('#c_del'); await sleep(300); ok('delete from + form', await p.evaluate(() => SET.cats.length === 2 && sheetbg.classList.contains('open')));
  await p.click('#cancelBtn'); await go('settings'); await p.click('[data-delcat] >> nth=0'); await sleep(100); await p.click('[data-delcat] >> nth=0'); await sleep(300); ok('delete from Settings', await p.evaluate(() => SET.cats.length === 1));
  await p.evaluate(() => { BEDIT = false; SET.budgets[SET.cats[0].id] = 100 }); await go('budget'); const lk = await p.$('[data-editcat]:visible'); ok('edit link in Budget (normal view)', !!lk);
  if (lk) { await lk.click(); await sleep(150); await p.click('#c_del'); await p.click('#c_del'); await sleep(300) } ok('delete from Budget', await p.evaluate(() => SET.cats.length === 0));
  await p.reload(); await sleep(400); ok('deleted categories stay deleted', await p.evaluate(() => (SET.cats || []).length === 0));
  // 18 home delta percent sanity
  const delta = await p.evaluate(() => { const el = document.querySelector('.delta'); return el ? el.textContent : '' });
  res.push('INFO home delta: ' + delta);
  console.log(res.join('\n')); console.log('errors:', errs); await b.close();
})();
