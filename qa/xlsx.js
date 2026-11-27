// Excel (.xlsx) card-statement import, with made-up data only (no real amounts or names).
// Builds small .xlsx files in the test itself, then imports them through the real file picker on 3 devices.
const { chromium, devices } = require('playwright'); const fs = require('fs'); const os = require('os'); const path = require('path'); const zlib = require('zlib');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return b => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 } })();
function zip(files) { // {name: string} -> Buffer (deflate)
  const loc = [], cen = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8'), comp = zlib.deflateRawSync(raw), nm = Buffer.from(name), crc = CRC(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    loc.push(h, nm, comp); cen.push(c, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(cen.length / 2, 8); e.writeUInt16LE(cen.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, e]);
}
const X = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// rows: arrays of values; strings become shared strings (like Excel), numbers stay numbers, {d:serial} is an Excel date number
function xlsx(rows, { prefix = 'x:' } = {}) {
  const ss = []; const si = s => { let i = ss.indexOf(s); if (i < 0) { ss.push(s); i = ss.length - 1 } return i };
  const L = i => String.fromCharCode(65 + i); const P = prefix;
  const body = rows.map((r, ri) => `<${P}row r="${ri + 1}">` + r.map((v, ci) => v == null ? '' : typeof v === 'number' ? `<${P}c r="${L(ci)}${ri + 1}"><${P}v>${v}</${P}v></${P}c>` : v.d ? `<${P}c r="${L(ci)}${ri + 1}" s="1"><${P}v>${v.d}</${P}v></${P}c>` : `<${P}c r="${L(ci)}${ri + 1}" t="s"><${P}v>${si(v)}</${P}v></${P}c>`).join('') + `</${P}row>`).join('');
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'; const dec = P ? ` xmlns:${P.slice(0, -1)}="${ns}"` : ` xmlns="${ns}"`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>', 'xl/workbook.xml': `<${P}workbook${dec}><${P}sheets><${P}sheet name="פירוט עסקאות" sheetId="1"/></${P}sheets></${P}workbook>`,
    'xl/sharedStrings.xml': `<${P}sst${dec}>${ss.map(s => `<${P}si><${P}t>${X(s)}</${P}t></${P}si>`).join('')}</${P}sst>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><${P}worksheet${dec}><${P}sheetData>${body}</${P}sheetData></${P}worksheet>`
  });
}
const HEAD = ['תאריך רכישה', 'שם בית עסק', 'סכום עסקה', 'מטבע עסקה', 'סכום חיוב', 'מטבע חיוב', "מס' שובר", 'פירוט נוסף'];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'em-xlsx-'));
const F1 = path.join(dir, 'statement.xlsx'); // 8 purchases + one refund; one instalment, one abroad, one foreign website, one Excel-number date, one late (February) purchase; total 435.00
fs.writeFileSync(F1, xlsx([
  [], ['פירוט עסקאות', null, 'מרץ 2026'], [], ['כרטיס בדיקה - 0000', null, null, null, null, null, null, '₪ 400.00'], ['על שם בדיקה', null, null, null, null, null, null, 'לחיוב ב-10.04'], [],
  ['עסקאות למועד חיוב'], HEAD,
  ['05.03.26', 'שופרסל דיל בדיקה', 120.5, '₪', 120.5, '₪', '111', ''],
  ['06.03.26', 'רב קו אונליין', 50, '₪', 50, '₪', '112', ''],
  [{ d: 46090 }, 'WOLT', 89.9, '₪', 89.9, '₪', '113', ''], // Excel day number 46090 = 9 Mar 2026
  ['09.03.26', 'חנות בדיקה', 300, '₪', 60, '₪', '114', 'תשלום 2 מתוך 5'],
  ['10.03.26', 'BOOKSHOP TEST', 10, '€', 39.6, '₪', '115', 'בוצע בחו"ל'],
  ['11.03.26', 'WEBSHOP TEST', 5, '$', 20, '₪', '118', 'אתר חו"ל'], // a foreign website is not a trip: stays "other"
  ['12.03.26', 'שופרסל זיכוי', -10, '₪', -10, '₪', '116', 'זיכוי'],
  ['14.03.26', 'קפה בדיקה', 50, '₪', 50, '₪', '117', ''],
  ['20.02.26', 'חנות פברואר', 15, '₪', 15, '₪', '119', ''], // a late purchase: billed with this statement (10 April), not in March
  [null, 'סה"כ לחיוב החודש בכרטיס בש"ח', null, null, 435, '₪']
]));
const F2 = path.join(dir, 'other.xlsx'); fs.writeFileSync(F2, xlsx([['שם', 'טלפון'], ['בדיקה', '000']], { prefix: '' })); // an unrelated sheet
const F3 = path.join(dir, 'broken.xlsx'); fs.writeFileSync(F3, 'this is not a zip file');
(async () => { const b = await chromium.launch(); const R = []; const ok = (n, c, i = '') => R.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  for (const [dn, dv] of [['Android', devices['Pixel 7']], ['iPhoneSE', devices['iPhone SE']], ['PC', { viewport: { width: 1366, height: 820 } }]]) {
    for (const lang of ['he', 'en']) {
      const N = `${dn} ${lang}`;
      const p = await (await b.newContext(dv)).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) });
      await p.goto('http://localhost:8765/'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('em_hint_off', '1') }); await p.reload(); await sleep(400);
      if (await p.evaluate(() => LANG) !== lang) { await p.click('#langBtn'); await sleep(200) } ok(N + ' language set', await p.evaluate(() => LANG) === lang);
      // can the user find it: the + form link and the settings button both say Excel, and the picker accepts .xlsx
      await p.click('#fab'); await sleep(150); if (lang === 'he' && dn === 'Android') await p.screenshot({ path: path.join(__dirname, 'out', 'xlsx_link_Android.png') }); const link = await p.evaluate(() => { const e = document.getElementById('impLink'); return e && e.offsetParent ? e.innerText : '' });
      ok(N + ' + form import link mentions Excel', /Excel/.test(link), link); ok(N + ' file picker accepts .xlsx', /\.xlsx/.test(await p.getAttribute('#impFile', 'accept')));
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#impLink')]); await fc.setFiles(F1);
      await p.waitForSelector('.improw', { timeout: 20000 }).catch(() => { });
      const info = await p.evaluate(() => ({ n: document.querySelectorAll('.improw').length, on: document.querySelectorAll('.improw.on').length, sum: (document.querySelector('.impsum') || {}).innerText, title: document.getElementById('impTitle').innerText,
        cats: IMP.items.map(x => x.cat).join(','), notes: IMP.items.map(x => x.note).join('|'), dates: IMP.items.map(x => x.date).join(','), day: IMP.cardDay,
        over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || [...document.querySelectorAll('#impbg *')].some(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) }) }));
      ok(N + ' 9 rows found', info.n === 9, JSON.stringify(info)); ok(N + ' refund row not ticked (8 on)', info.on === 8, info.on); ok(N + ' total matches ✓', /✓/.test(info.sum || ''), info.sum);
      ok(N + ' title says Excel', /Excel/.test(info.title), info.title); ok(N + ' nothing off screen', !info.over);
      ok(N + ' categories from names', info.cats === 'groceries,transport,eatingout,other,travel,other,groceries,eatingout,other', info.cats);
      ok(N + ' instalment + foreign amount kept as notes', /תשלום 2 מתוך 5/.test(info.notes) && /10 €/.test(info.notes), info.notes);
      ok(N + ' Excel date number read (9 Mar)', info.dates.split(',')[2] === '2026-03-09', info.dates); ok(N + ' card day 10 found', info.day === 10, info.day);
      ok(N + ' card holder line not imported', await p.evaluate(() => !IMP.items.some(x => /בדיקה - 0000|על שם/.test(x.name))));
      if (lang === 'he') await p.locator('#impbg .sheet').screenshot({ path: path.join(__dirname, 'out', `xlsx_${dn}.png`) });
      await p.selectOption('[data-icat="3"]', 'shopping'); await p.click('#impSave'); await sleep(800);
      const st = await p.evaluate(() => ({ n: RAW.length, sum: Math.round(RAW.reduce((a, e) => a + e.amount, 0) * 100) / 100, src: [...new Set(RAW.map(e => e.source))].join(','), learn: SET.learn, day: SET.cardDay }));
      ok(N + ' 8 expenses added, sum 445', st.n === 8 && st.sum === 445, JSON.stringify(st));
      const mo = () => p.evaluate(() => ({ feb: monthStats(2026, 2).OUT, mar: monthStats(2026, 3).OUT, apr: Math.round(monthStats(2026, 4).OUT * 100) / 100 }));
      let mm = await mo(); ok(N + ' whole file counts on the bill date (10 April)', mm.feb === 0 && mm.mar === 0 && mm.apr === 445, JSON.stringify(mm));
      ok(N + ' jumped to April 2026', await p.evaluate(() => CUR.y === 2026 && CUR.m === 4));
      await p.evaluate(() => openSheet(EXP.find(e => e.date === '2026-02-20'))); await sleep(200); await p.fill('#f_note', 'בדיקה'); await p.click('#saveBtn'); await sleep(400);
      mm = await mo(); ok(N + ' editing a note keeps the bill date', mm.apr === 445 && await p.evaluate(() => RAW.find(e => e.date === '2026-02-20').bd === '2026-04-10'), JSON.stringify(mm)); ok(N + ' saved as Excel import', st.src === 'xlsx', st.src); ok(N + ' card day saved', st.day === 10);
      ok(N + ' learned my change', Object.values(st.learn || {}).includes('shopping'));
      await p.evaluate(() => { VIEW = 'settings'; render() }); await sleep(150);
      ok(N + ' settings import button mentions Excel', /Excel/.test(await p.innerText('[data-imp="settings"]')));
      if (lang === 'he' && dn === 'Android') await p.locator('section:has([data-imp="settings"])').screenshot({ path: path.join(__dirname, 'out', 'xlsx_settings_Android.png') });
      const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-imp="settings"]')]); await fc2.setFiles(F1); await p.waitForSelector('.improw', { timeout: 20000 });
      const d = await p.evaluate(() => ({ dups: document.querySelectorAll('.impdup').length, on: document.querySelectorAll('.improw.on').length, dis: document.getElementById('impSave').disabled, learned: IMP.items[3].cat }));
      ok(N + ' re-import: nothing ticked, all marked', d.on === 0 && d.dis && d.dups >= 8, JSON.stringify(d)); ok(N + ' re-import uses learned category', d.learned === 'shopping');
      await p.click('#impCancel'); await sleep(150);
      for (const [f, what] of [[F2, 'unrelated sheet'], [F3, 'broken file']]) {
        const [fc3] = await Promise.all([p.waitForEvent('filechooser'), p.click('[data-imp="settings"]')]); await fc3.setFiles(f); await sleep(1200);
        const r = await p.evaluate(() => ({ rows: document.querySelectorAll('.improw').length, txt: document.getElementById('impBody').innerText, save: !document.getElementById('impSave').classList.contains('hidden'), n: RAW.length }));
        ok(N + ` ${what}: adds nothing, shows a message`, r.rows === 0 && !r.save && r.n === 8 && r.txt.length > 5, JSON.stringify(r)); await p.click('#impCancel'); await sleep(150);
      }
      ok(N + ' no errors', !errs.filter(e => !/InvalidPDFException/.test(e)).length, errs.join(' | ')); // the broken file is logged as an unreadable PDF on purpose
      await p.context().close();
    }
  }
  console.log(R.join('\n')); await b.close(); fs.rmSync(dir, { recursive: true, force: true });
  process.exit(R.some(r => r.startsWith('FAIL')) ? 1 : 0) })();
