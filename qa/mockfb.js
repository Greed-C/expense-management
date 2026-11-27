// Minimal mock of Firebase Auth + Firestore REST endpoints used by sync.js (for local testing only)
const http = require('http');
const users = {}; // email -> {pw, uid}
const tokens = {}; // token -> uid
const docs = {};  // full name -> fields
let n = 0, seq = 0;
const P = 'projects/p/databases/(default)/documents';
function ts() { seq++; const d = new Date(Date.now()); return d.toISOString().replace('Z', String(seq % 1000).padStart(3, '0') + 'Z') }
function tok(uid) { const t = 't' + (++n); tokens[t] = uid; return t }
function send(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); res.end(JSON.stringify(body)) }
function uidOf(req) { const a = (req.headers.authorization || '').replace('Bearer ', ''); return tokens[a] }
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    let j = {}; try { j = JSON.parse(body) } catch (e) { j = Object.fromEntries(new URLSearchParams(body)) }
    if (u === '/__dump') return send(res, 200, docs);
    if (u === '/__reads') return send(res, 200, { reads: global.READS || 0 });
    if (u === '/__setpw') { users[j.email].pw = j.pw; return send(res, 200, {}) }
    if (u.startsWith('/auth/accounts:signUp')) {
      if (users[j.email]) return send(res, 400, { error: { message: 'EMAIL_EXISTS' } });
      const uid = 'u' + (++n); users[j.email] = { pw: j.password, uid };
      return send(res, 200, { idToken: tok(uid), refreshToken: 'r_' + uid, localId: uid, email: j.email, expiresIn: '3600' });
    }
    if (u.startsWith('/auth/accounts:signInWithPassword')) {
      const x = users[j.email]; if (!x || x.pw !== j.password) return send(res, 400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
      return send(res, 200, { idToken: tok(x.uid), refreshToken: 'r_' + x.uid, localId: x.uid, email: j.email, expiresIn: '3600' });
    }
    if (u.startsWith('/auth/accounts:signInWithIdp')) {
      const tokn = new URLSearchParams(j.postBody).get('id_token'); if (!tokn || !tokn.startsWith('FAKE-')) return send(res, 400, { error: { message: 'INVALID_IDP_RESPONSE' } });
      const email = tokn.slice(5); if (!users[email]) users[email] = { pw: null, uid: 'u' + (++n) }; const x = users[email];
      return send(res, 200, { idToken: tok(x.uid), refreshToken: 'r_' + x.uid, localId: x.uid, email, expiresIn: '3600' });
    }
    if (u.startsWith('/auth/accounts:sendOobCode')) return send(res, 200, { email: j.email });
    if (u.startsWith('/token/token')) { const uid = j.refresh_token.slice(2); return send(res, 200, { id_token: tok(uid), refresh_token: j.refresh_token, expires_in: '3600' }) }
    const uid = uidOf(req);
    const own = name => name.startsWith(P + '/users/' + uid + '/');
    if (u.startsWith('/fs/' + P + ':commit')) {
      if (!uid) return send(res, 401, { error: { message: 'UNAUTHENTICATED' } });
      const t = ts();
      for (const w of j.writes) {
        const name = w.update ? w.update.name : w.delete;
        if (!own(name)) return send(res, 403, { error: { message: 'PERMISSION_DENIED' } });
        if (w.delete) delete docs[name];
        else { const f = { ...w.update.fields }; (w.updateTransforms || []).forEach(x => f[x.fieldPath] = { timestampValue: t }); docs[name] = f }
      }
      return send(res, 200, { commitTime: t });
    }
    if (u.endsWith(':runQuery')) {
      const parent = u.slice(4, -9); if (parent !== P + '/users/' + uid) return send(res, 403, { error: { message: 'PERMISSION_DENIED' } });
      const q = j.structuredQuery; const prefix = parent + '/' + q.from[0].collectionId + '/';
      let list = Object.entries(docs).filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map(([name, fields]) => ({ name, fields }));
      if (q.where) { const v = q.where.fieldFilter.value.timestampValue, gt = q.where.fieldFilter.op === 'GREATER_THAN'; list = list.filter(d => gt ? d.fields.s.timestampValue > v : d.fields.s.timestampValue >= v) }
      global.READS = (global.READS || 0) + Math.max(1, list.slice(0, q.limit || 1e9).length);
      list.sort((a, b) => a.fields.s.timestampValue < b.fields.s.timestampValue ? -1 : 1); list = list.slice(0, q.limit || 1e9);
      return send(res, 200, list.length ? list.map(d => ({ document: d, readTime: 'x' })) : [{ readTime: 'x' }]);
    }
    if (req.method === 'GET' && u.startsWith('/fs/')) {
      const name = u.slice(4); if (!own(name)) return send(res, 403, { error: { message: 'PERMISSION_DENIED' } });
      return docs[name] ? send(res, 200, { name, fields: docs[name] }) : send(res, 404, { error: { message: 'NOT_FOUND' } });
    }
    send(res, 404, { error: { message: 'no route ' + u } });
  });
}).listen(8790, () => console.log('mock on 8790'));
