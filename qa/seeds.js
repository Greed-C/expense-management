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


module.exports={normal:seedNormal,max:seedMax,empty:seedEmpty};
