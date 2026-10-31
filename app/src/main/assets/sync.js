/* Expense Management – optional encrypted sync between devices.
 * Data is encrypted on this device (AES-GCM, key from the user's password) before upload,
 * so the cloud only stores unreadable blobs. Uses Firebase REST APIs directly (no SDK).
 */
(function () {
  'use strict';
  var CFG = window.EM_FIREBASE;
  var EM = window.__EM;
  if (!CFG || !CFG.apiKey || !EM || !window.crypto || !crypto.subtle) return;

  var AUTH = CFG.authBase || 'https://identitytoolkit.googleapis.com/v1';
  var TOKEN = CFG.tokenBase || 'https://securetoken.googleapis.com/v1';
  var FS = (CFG.firestoreBase || 'https://firestore.googleapis.com/v1') + '/projects/' + CFG.projectId + '/databases/(default)/documents';
  var DOCNAME = 'projects/' + CFG.projectId + '/databases/(default)/documents';
  var LS = 'em_sync_v1';
  var ITER = 210000;

  var st = load();            // {email, uid, refresh, key(b64), cursor, last}
  var idToken = null, idExp = 0, cryptoKey = null;
  var status = st.uid ? 'idle' : 'off', busy = false, again = false, timer = null, lastErr = '';

  function load() { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch (e) { return {} } }
  function save() { try { localStorage.setItem(LS, JSON.stringify(st)) } catch (e) { } }
  function he() { return (document.documentElement.lang || 'he') === 'he' }
  function T(h, e) { return he() ? h : e }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }

  // ---------- crypto ----------
  var enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s) }
  function unb64(s) { var r = atob(s), b = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b }
  async function deriveKey(password, saltB64) {
    var base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function encrypt(obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, cryptoKey, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), v: b64(ct) };
  }
  async function decrypt(ivB64, vB64, key) {
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, key || cryptoKey, unb64(vB64));
    return JSON.parse(dec.decode(pt));
  }
  async function loadKey() {
    if (cryptoKey || !st.key) return cryptoKey;
    cryptoKey = await crypto.subtle.importKey('raw', unb64(st.key), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    return cryptoKey;
  }

  // ---------- network ----------
  async function post(url, body, auth) {
    var h = { 'Content-Type': 'application/json' };
    if (auth) h.Authorization = 'Bearer ' + auth;
    var r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
    var j = null; try { j = await r.json() } catch (e) { }
    if (!r.ok) { var m = (j && j.error && (j.error.message || j.error.status)) || ('HTTP ' + r.status); var er = new Error(m); er.http = r.status; throw er }
    return j;
  }
  async function getDoc(path) {
    var r = await fetch(FS + '/' + path, { headers: { Authorization: 'Bearer ' + await token() } });
    if (r.status === 404) return null;
    var j = await r.json(); if (!r.ok) { var er = new Error((j.error && j.error.message) || 'HTTP ' + r.status); er.http = r.status; throw er }
    return j;
  }
  async function token() {
    if (idToken && Date.now() < idExp - 60000) return idToken;
    if (!st.refresh) throw new Error('SIGNED_OUT');
    var r = await fetch(TOKEN + '/token?key=' + CFG.apiKey, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(st.refresh) });
    var j = await r.json();
    if (!r.ok) { var er = new Error((j.error && j.error.message) || 'TOKEN'); er.http = r.status; er.auth = true; throw er }
    idToken = j.id_token; idExp = Date.now() + (+j.expires_in || 3600) * 1000; st.refresh = j.refresh_token; save();
    return idToken;
  }
  function setSession(j) { idToken = j.idToken; idExp = Date.now() + (+j.expiresIn || 3600) * 1000; st.uid = j.localId; st.email = j.email; st.refresh = j.refreshToken; }
  function sval(v) { return v && (v.stringValue != null ? v.stringValue : v.integerValue != null ? +v.integerValue : v.booleanValue != null ? v.booleanValue : v.timestampValue) }

  async function commit(writes) {
    var tk = await token();
    for (var i = 0; i < writes.length; i += 400) await post(FS + ':commit', { writes: writes.slice(i, i + 400) }, tk);
  }
  function itemWrite(key, f) {
    return { update: { name: DOCNAME + '/users/' + st.uid + '/items/' + key, fields: f }, updateTransforms: [{ fieldPath: 's', setToServerValue: 'REQUEST_TIME' }] };
  }

  // ---------- key setup ----------
  async function setupKey(password, mode) {
    var meta = await getDoc('users/' + st.uid + '/meta/key');
    if (meta && mode !== 'reset') {
      var f = meta.fields || {};
      var k = await deriveKey(password, sval(f.salt));
      try { await decrypt(sval(f.iv), sval(f.check), k) } catch (e) { var er = new Error('KEY_MISMATCH'); er.keyMismatch = true; throw er }
      cryptoKey = k;
    } else {
      var salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      cryptoKey = await deriveKey(password, salt);
      var chk = await encrypt({ ok: 'em' });
      await commit([{ update: { name: DOCNAME + '/users/' + st.uid + '/meta/key', fields: { salt: { stringValue: salt }, iv: { stringValue: chk.iv }, check: { stringValue: chk.v } } } }]);
    }
    st.key = b64(await crypto.subtle.exportKey('raw', cryptoKey));
    st.cursor = null;
    save();
  }
  async function wipeCloud() {
    var all = await queryItems(null, true), w = all.map(function (d) { return { delete: d.name } });
    if (w.length) await commit(w);
  }

  // ---------- sync ----------
  async function queryItems(cursor, raw) {
    var out = [], cur = cursor, tk = await token();
    for (var guard = 0; guard < 200; guard++) {
      var q = { from: [{ collectionId: 'items' }], orderBy: [{ field: { fieldPath: 's' } }], limit: 1000 };
      if (cur) q.where = { fieldFilter: { field: { fieldPath: 's' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: cur } } };
      var res = await post(FS + '/users/' + st.uid + ':runQuery', { structuredQuery: q }, tk);
      var docs = (res || []).filter(function (x) { return x.document }).map(function (x) { return x.document });
      var fresh = docs.filter(function (d) { return !out.some(function (o) { return o.name === d.name }) });
      out = out.concat(fresh);
      if (docs.length < 1000 || !fresh.length) break;
      cur = sval(docs[docs.length - 1].fields.s);
    }
    return out;
  }

  function markExisting() {
    // data entered before sync was turned on: give it a low timestamp so it uploads but never overrides newer edits
    var S = EM.S, ch = false;
    EM.COLS.forEach(function (c) { Object.keys(S[c] || {}).forEach(function (id) { var k = c + '__' + id; if (!S.__m[k]) { S.__m[k] = 1; S.__dirty[k] = 1; ch = true } }) });
    if (ch) EM.persist();
  }

  async function pull() {
    var docs = await queryItems(st.cursor), S = EM.S, touched = {}, maxS = st.cursor;
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i], f = d.fields || {}, key = d.name.split('/').pop(), t = +sval(f.t) || 0, s = sval(f.s);
      if (s && (!maxS || s > maxS)) maxS = s;
      var p = key.indexOf('__'); if (p < 0) continue;
      var c = key.slice(0, p), id = key.slice(p + 2);
      if (EM.COLS.indexOf(c) < 0) continue;
      if (t <= (S.__m[key] || 0)) continue;
      if (f.d && f.d.booleanValue) { delete S[c][id] }
      else { try { S[c][id] = await decrypt(sval(f.iv), sval(f.v)) } catch (e) { continue } }
      S.__m[key] = t; delete S.__dirty[key]; touched[c] = 1;
    }
    var cs = Object.keys(touched);
    if (cs.length) { EM.persist(); cs.forEach(function (c) { EM.fire(c) }) }
    st.cursor = maxS; save();
    return cs.length;
  }

  async function push() {
    var S = EM.S, keys = Object.keys(S.__dirty);
    if (!keys.length) return 0;
    var snap = {}, writes = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i], p = key.indexOf('__'), c = key.slice(0, p), id = key.slice(p + 2), t = S.__m[key] || Date.now();
      snap[key] = t;
      var f = { t: { integerValue: String(t) } };
      if (S[c] && S[c][id]) { var e = await encrypt(S[c][id]); f.iv = { stringValue: e.iv }; f.v = { stringValue: e.v }; f.d = { booleanValue: false } }
      else f.d = { booleanValue: true };
      writes.push(itemWrite(key, f));
    }
    await commit(writes);
    keys.forEach(function (k) { if (S.__m[k] === snap[k]) delete S.__dirty[k] });
    EM.persist();
    return keys.length;
  }

  async function syncNow() {
    if (!st.uid || !st.key) return;
    if (busy) { again = true; return }
    busy = true; setStatus('syncing');
    try {
      await loadKey();
      await pull();
      await push();
      st.last = Date.now(); save(); lastErr = ''; setStatus('ok');
    } catch (e) {
      if (e.auth) { lastErr = T('צריך להתחבר מחדש', 'Please sign in again'); setStatus('error') }
      else if (!navigator.onLine || e instanceof TypeError) setStatus('offline');
      else { lastErr = e.message; setStatus('error') }
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(syncNow, 300) }
    }
  }
  function soon() { clearTimeout(timer); timer = setTimeout(syncNow, 2000) }

  // ---------- account ----------
  function friendly(e) {
    var m = (e && e.message) || '';
    if (/EMAIL_EXISTS/.test(m)) return T('כבר קיים חשבון עם האימייל הזה – לחץ "התחברות"', 'An account with this email already exists – tap "Sign in"');
    if (/INVALID_LOGIN|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_CREDENTIAL/.test(m)) return T('אימייל או סיסמה לא נכונים', 'Wrong email or password');
    if (/WEAK_PASSWORD/.test(m)) return T('הסיסמה חלשה מדי – לפחות 8 תווים', 'Password too weak – at least 8 characters');
    if (/INVALID_EMAIL/.test(m)) return T('כתובת אימייל לא תקינה', 'Invalid email address');
    if (/TOO_MANY/.test(m)) return T('יותר מדי ניסיונות – נסה שוב בעוד כמה דקות', 'Too many attempts – try again in a few minutes');
    if (e instanceof TypeError) return T('אין חיבור לאינטרנט', 'No internet connection');
    return T('משהו השתבש: ', 'Something went wrong: ') + m;
  }
  async function signIn(email, password, create) {
    var j = await post(AUTH + '/accounts:' + (create ? 'signUp' : 'signInWithPassword') + '?key=' + CFG.apiKey, { email: email, password: password, returnSecureToken: true });
    setSession(j); save();
    try { await setupKey(password, create ? 'new' : 'join') }
    catch (e) { if (e.keyMismatch) { pendingPw = password; throw e } throw e }
    markExisting();
    await syncNow();
  }
  var pendingPw = null;
  async function resetCloud() {
    if (!pendingPw) return;
    await wipeCloud();
    await setupKey(pendingPw, 'reset');
    pendingPw = null;
    var S = EM.S; Object.keys(S.__m).forEach(function (k) { S.__dirty[k] = 1 }); markExisting(); EM.persist();
    await syncNow();
  }
  function signOut() { st = {}; save(); idToken = null; cryptoKey = null; pendingPw = null; setStatus('off') }
  async function forgot(email) {
    await post(AUTH + '/accounts:sendOobCode?key=' + CFG.apiKey, { requestType: 'PASSWORD_RESET', email: email });
  }

  // ---------- UI (card in Settings) ----------
  function statusText() {
    var t = st.last ? new Date(st.last).toLocaleString(he() ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    return ({
      syncing: T('מסנכרן…', 'Syncing…'),
      ok: T('מסונכרן ✓', 'Synced ✓') + (t ? ' · ' + t : ''),
      idle: t ? T('סונכרן לאחרונה ', 'Last synced ') + t : T('ממתין לסנכרון', 'Waiting to sync'),
      offline: T('אין אינטרנט – יסונכרן כשיחזור החיבור', 'Offline – will sync when you’re back online'),
      error: T('שגיאת סנכרון', 'Sync error') + (lastErr ? ': ' + lastErr : '')
    })[status] || '';
  }
  function setStatus(s) { status = s; var el = document.getElementById('syncStatus'); if (el) { el.textContent = statusText(); el.className = 'small sync-' + s } }

  function cardHtml() {
    var h = '<section class="card" id="syncCard" style="margin-top:14px"><h3>☁️ ' + T('סנכרון בין מכשירים', 'Sync between devices') + '</h3>';
    if (st.uid && st.key) {
      h += '<p class="hint">' + T('מחובר כ-', 'Signed in as ') + '<b dir="ltr">' + esc(st.email) + '</b>. ' + T('אותם נתונים בכל מכשיר שמתחבר עם החשבון הזה. הנתונים מוצפנים במכשיר לפני שהם עולים לענן.', 'Same data on every device signed in with this account. Data is encrypted on the device before it goes to the cloud.') + '</p>'
        + '<p id="syncStatus" class="small sync-' + status + '">' + esc(statusText()) + '</p>'
        + '<div class="actions" style="margin-top:10px"><button type="button" class="btn primary" data-sync="now" style="flex:0 0 auto">' + T('סנכרן עכשיו', 'Sync now') + '</button><button type="button" class="btn" data-sync="out" style="flex:0 0 auto">' + T('התנתקות', 'Sign out') + '</button></div>';
    } else if (pendingPw) {
      h += '<p class="hint">' + T('הסיסמה לא פותחת את הנתונים שבענן (כנראה הסיסמה שונתה). אפשר להחליף את העותק שבענן בנתונים שבמכשיר הזה – מכשירים אחרים יצטרכו להתחבר מחדש.', 'This password can’t unlock the data in the cloud (the password was probably changed). You can replace the cloud copy with the data on this device – other devices will need to sign in again.') + '</p>'
        + '<div class="actions"><button type="button" class="btn primary" data-sync="reset" style="flex:0 0 auto">' + T('החלף את העותק שבענן', 'Replace cloud copy') + '</button><button type="button" class="btn" data-sync="out" style="flex:0 0 auto">' + T('ביטול', 'Cancel') + '</button></div><p id="syncMsg" class="small"></p>';
    } else {
      h += '<p class="hint">' + T('לא חובה. התחבר כדי לראות את אותם נתונים בטלפון ובמחשב. הנתונים מוצפנים בסיסמה שלך – אף אחד אחר לא יכול לקרוא אותם. <b>אם תשכח את הסיסמה, העותק שבענן לא ניתן לשחזור</b> (הנתונים במכשיר נשארים).', 'Optional. Sign in to see the same data on your phone and computer. Your data is encrypted with your password – nobody else can read it. <b>If you forget the password, the cloud copy can’t be recovered</b> (data on the device stays).') + '</p>'
        + '<div class="syncform"><input id="sy_email" type="email" dir="ltr" autocomplete="username" placeholder="' + T('אימייל', 'Email') + '"><input id="sy_pw" type="password" dir="ltr" autocomplete="current-password" placeholder="' + T('סיסמה (לפחות 8 תווים)', 'Password (at least 8 characters)') + '"></div>'
        + '<div class="actions" style="margin-top:10px"><button type="button" class="btn primary" data-sync="in" style="flex:0 0 auto">' + T('התחברות', 'Sign in') + '</button><button type="button" class="btn" data-sync="new" style="flex:0 0 auto">' + T('יצירת חשבון', 'Create account') + '</button><button type="button" class="linkbtn" data-sync="forgot">' + T('שכחתי סיסמה', 'Forgot password') + '</button></div>'
        + '<p id="syncMsg" class="small"></p>';
    }
    return h + '</section>';
  }
  function redraw() { var c = document.getElementById('syncCard'); if (c) c.outerHTML = cardHtml() }
  function msg(s, bad) { var m = document.getElementById('syncMsg'); if (m) { m.textContent = s; m.style.color = bad ? 'var(--bad)' : '' } }

  var css = document.createElement('style');
  css.textContent = '.syncform{display:grid;gap:8px;max-width:360px}.syncform input{width:100%}.sync-ok{color:var(--accent)}.sync-error{color:var(--bad)}.linkbtn{border:0;background:none;color:var(--accent);font-weight:600;cursor:pointer;padding:8px}';
  document.head.appendChild(css);

  // add the card whenever Settings is drawn
  new MutationObserver(function () {
    var v = document.getElementById('view');
    if (v && !document.getElementById('syncCard') && v.querySelector('#saveSet')) v.insertAdjacentHTML('beforeend', cardHtml());
  }).observe(document.getElementById('view'), { childList: true });

  document.addEventListener('click', async function (ev) {
    var b = ev.target.closest('[data-sync]'); if (!b) return;
    var a = b.dataset.sync;
    var email = (document.getElementById('sy_email') || {}).value, pw = (document.getElementById('sy_pw') || {}).value;
    email = (email || '').trim();
    try {
      if (a === 'now') { await syncNow(); return }
      if (a === 'out') { signOut(); redraw(); return }
      if (a === 'forgot') {
        if (!email) { msg(T('כתוב את האימייל למעלה', 'Type your email above'), true); return }
        await forgot(email); msg(T('נשלח מייל לאיפוס סיסמה. שים לב: אחרי איפוס, הנתונים שבענן יוחלפו בנתונים שבמכשיר.', 'Password reset email sent. Note: after a reset, the cloud copy is replaced with the data on your device.')); return
      }
      if (a === 'reset') { b.disabled = true; msg(T('מחליף…', 'Replacing…')); await resetCloud(); redraw(); return }
      if (!email || !pw) { msg(T('מלא אימייל וסיסמה', 'Fill in email and password'), true); return }
      if (a === 'new' && pw.length < 8) { msg(T('הסיסמה צריכה להיות לפחות 8 תווים', 'Password must be at least 8 characters'), true); return }
      b.disabled = true; msg(T('מתחבר…', 'Signing in…'));
      await signIn(email, pw, a === 'new');
      redraw();
    } catch (e) {
      if (e.keyMismatch) { st.key = null; save(); redraw(); return }
      msg(friendly(e), true); b.disabled = false;
    }
  });

  // ---------- triggers ----------
  EM.onLocal = function () { if (st.uid && st.key) soon() };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) syncNow() });
  window.addEventListener('online', syncNow);
  setInterval(function () { if (!document.hidden) syncNow() }, 60000);
  if (st.uid && st.key) { markExisting(); setTimeout(syncNow, 500) }

  window.EMSync = { syncNow: syncNow, state: function () { return { status: status, email: st.email, last: st.last } } };
})();
