// QA sweep: all tabs x devices x languages x themes. Reports page errors, horizontal overflow, clipped text.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const URL = 'http://localhost:8765/';
const now = new Date(); const Y = now.getFullYear(), M = now.getMonth() + 1;
const p2 = n => String(n).padStart(2, '0');
const d = (y, m, dd) => `${y}-${p2(m)}-${p2(dd)}`;
const pm = M === 1 ? [Y - 1, 12] : [Y, M - 1];
function seed() {
  const S = { expenses: {}, income: {}, settings: {}, recurring: {} }; let n = 0;
  const add = (c, o) => { S[c]['q' + (++n)] = { source: 'app', created: Date.now() - n * 1000, ...o } };
  add('expenses', { name: 'שופרסל דיל', amount: 412.9, cat: 'groceries', kind: '', date: d(Y, M, 1), method: 'card', note: '' });
  add('expenses', { name: 'שם ארוך מאוד מאוד של הוצאה כדי לבדוק שבירת שורות בטלפון קטן במיוחד ועוד קצת', amount: 1234567.89, cat: 'shopping', kind: '', date: d(Y, M, 1), method: 'bit', note: 'הערה ארוכה מאוד מאוד מאוד מאוד מאוד מאוד מאוד' });
  add('expenses', { name: '<img src=x onerror=alert(1)> "quotes" & \'apos\'', amount: 10, cat: 'other', kind: 'need', date: d(Y, M, 1), method: 'cash', note: '<b>bold</b>' });
  add('expenses', { name: 'Netflix', amount: 54.9, cat: 'subs', kind: '', date: d(pm[0], pm[1], 15), method: 'card', note: '' });
  add('expenses', { name: 'קרן השתלמות', amount: 2000, cat: 'savings', kind: '', date: d(Y, M, 1), method: 'transfer', note: '' });
  add('income', { name: 'משכורת', amount: 13500, date: d(Y, M, 1), type: 'salary', note: '' });
  add('income', { name: 'משכורת', amount: 13200, date: d(pm[0], pm[1], 1), type: 'salary', note: '' });
  add('recurring', { name: 'ביטוח רכב', amount: 300, cat: 'car', kind: 'need', method: 'standing', note: '', start: d(pm[0], pm[1], 31 > 28 ? 31 : 28), end: '' });
  S.settings.main = { income: 14000, budgets: { groceries: 300, shopping: 500 }, carryFrom: null };
  return S;
}
(async () => {
  fs.mkdirSync(require('path').join(__dirname, 'out', 'shots'), { recursive: true });
  const b = await chromium.launch(); const out = [];
  const devs = { PC: { viewport: { width: 1366, height: 820 } }, Android: devices['Pixel 7'], iPhoneSE: devices['iPhone SE'], iPhone14: devices['iPhone 14 Pro Max'] };
  for (const [dn, dv] of Object.entries(devs)) for (const lang of ['he', 'en']) for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ ...dv, colorScheme: theme }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('dialog', dlg => { errs.push('DIALOG ' + dlg.message()); dlg.dismiss() });
    await p.goto(URL); await p.evaluate(([S, lang]) => { localStorage.clear(); localStorage.setItem('expense_mgmt_v1', JSON.stringify(S)); localStorage.setItem('mm_lang', lang); localStorage.setItem('em_hint_off', '1') }, [seed(), lang]);
    await p.reload(); await p.waitForTimeout(400);
    for (const v of ['home', 'list', 'budget', 'year', 'settings']) {
      await p.evaluate(v => { VIEW = v; render(); scrollTo(0, 0) }, v); await p.waitForTimeout(250);
      const r = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth, issues = [];
        if (document.documentElement.scrollWidth > vw + 1) issues.push('page wider than screen: ' + document.documentElement.scrollWidth + '>' + vw);
        document.querySelectorAll('#view *, header *, nav *').forEach(e => {
          const r = e.getBoundingClientRect(); if (!r.width) return;
          if (r.right > vw + 1 || r.left < -1) issues.push('off-screen: ' + e.tagName + '.' + e.className + ' "' + (e.textContent || '').trim().slice(0, 30) + '"');
          const cs = getComputedStyle(e);
          if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 2 && cs.overflow !== 'visible' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName)) issues.push('clipped: ' + e.tagName + '.' + e.className + ' "' + e.textContent.trim().slice(0, 30) + '"');
        });
        return [...new Set(issues)].slice(0, 8);
      });
      if (r.length) out.push(`${dn}/${lang}/${theme}/${v}: ` + r.join(' | '));
      if (theme === 'light' || dn === 'Android') await p.screenshot({ path: require('path').join(__dirname,'out','shots',`${dn}_${lang}_${theme}_${v}.png`), fullPage: true });
    }
    if (errs.length) out.push(`${dn}/${lang}/${theme} ERRORS: ` + errs.join(' | '));
    await ctx.close();
  }
  fs.mkdirSync(require('path').join(__dirname,'out'),{recursive:true});fs.writeFileSync(require('path').join(__dirname,'out','sweep.txt'), out.join('\n')); console.log(out.join('\n') || 'no issues'); await b.close();
})();
