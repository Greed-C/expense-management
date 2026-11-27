import re,sys
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
a=open(os.path.join(ROOT,'src','my-money.html'),encoding='utf-8').read()
def r(x,y,req=True):
    global a
    if x not in a:
        if req: raise SystemExit('missing: '+x[:60])
        return
    a=a.replace(x,y)
r('<title>My Money</title>','<title>Expense Management</title>')
r('<meta name="viewport" content="width=device-width,initial-scale=1">','<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#0f1f3d">')
a=re.sub(r'<link rel="preconnect"[^>]*>\n<link href="https://fonts.googleapis.com[^>]*>\n','',a)
r('--display:"Rubik","Heebo",system-ui,sans-serif; --body:"Heebo",system-ui,','--display:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; --body:system-ui,')
r('.wrap{max-width:1060px;margin:0 auto;padding:16px 16px 110px}','.wrap{max-width:1060px;margin:0 auto;padding:16px 16px 110px}')
r('<span id="t_brand">My Money</span>','<span id="t_brand">Expense Management</span>')
r("brand:'הכסף שלי'","brand:'ניהול הוצאות'"); r("brand:'My Money'","brand:'Expense Management'")
r("noDb:'האחסון לא זמין בתצוגה הזו – פתח את האפליקציה מתוך Claude כשאתה מחובר.'","noDb:'לא ניתן לשמור נתונים במכשיר הזה.'")
r("noDb:'Storage isn’t available in this view – open the app inside Claude while signed in.'","noDb:'This device can’t store data.'")
LOCAL=r'''async function copyText(s){try{await navigator.clipboard.writeText(s)}catch(err){const ta=document.createElement('textarea');ta.value=s;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove()}toast(t('copied'))}
// ---------- local on-device store (same API shape the app uses) ----------
const LS_KEY='expense_mgmt_v1';
function makeLocalDb(){
  let S; try{S=JSON.parse(localStorage.getItem(LS_KEY)||'{}')}catch(e){S={}}
  ['expenses','income','settings','recurring'].forEach(c=>{S[c]=S[c]||{}});
  const subs={expenses:[],income:[],settings:[],recurring:[]};
  const persist=()=>{try{localStorage.setItem(LS_KEY,JSON.stringify(S))}catch(e){throw {code:'quota_exceeded',message:e.message}}};
  const snapOf=c=>({docs:Object.entries(S[c]).map(([id,d])=>({id,exists:true,data:()=>d})),metadata:{fromCache:false}});
  const fire=c=>{subs[c].forEach(f=>{try{f()}catch(e){}})};
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  S.__m=S.__m||{}; S.__dirty=S.__dirty||{};
  const touch=(c,id)=>{const k=c+'__'+id;S.__m[k]=Date.now();S.__dirty[k]=1};
  window.__EM={S,persist,fire,COLS:['expenses','income','settings','recurring'],onLocal:null};
  const changed=()=>{try{window.__EM.onLocal&&window.__EM.onLocal()}catch(e){}};
  const docRef=(c,id)=>({id,set:async d=>{S[c][id]=JSON.parse(JSON.stringify(d));touch(c,id);persist();fire(c);changed()},delete:async()=>{delete S[c][id];touch(c,id);persist();fire(c);changed()},
    onSnapshot:(n)=>{const f=()=>n({exists:!!S[c][id],data:()=>S[c][id]});subs[c].push(f);setTimeout(f,0);return()=>{subs[c]=subs[c].filter(x=>x!==f)}}});
  return {collection:c=>({doc:id=>docRef(c,id||uid()),onSnapshot:(n)=>{const f=()=>n(snapOf(c));subs[c].push(f);setTimeout(f,0);return()=>{subs[c]=subs[c].filter(x=>x!==f)}}}),
    doc:p=>{const [c,id]=p.split('/');return docRef(c,id)}};
}
'''
r("// ---------- data ----------",LOCAL+"\n// ---------- data ----------")
r("try{ db=(window.claude&&claude.use)?await claude.use('db'):null; }catch(e){ db=null }","try{ localStorage.setItem('__t','1'); localStorage.removeItem('__t'); db=makeLocalDb(); }catch(e){ db=null }")
r("try{await navigator.clipboard.writeText(csv);toast(t('copied'))}catch(err){toast(t('saveErr'))}","copyText(csv)",req=False)
r("render();\n(async()=>{","""(function(){let ver=0;const get=()=>ver?Promise.resolve(ver):fetch('webver.txt',{cache:'no-store'}).then(r=>r.ok?r.text():'').then(t=>(ver=+t||0)).catch(()=>0);
new MutationObserver(()=>{const v=document.getElementById('view');if(VIEW!=='settings'||!v||document.getElementById('verLine')||!v.querySelector('#saveSet'))return;const d=document.createElement('p');d.id='verLine';d.className='hint';d.style.cssText='text-align:center;margin:18px 0 4px';v.appendChild(d);
get().then(x=>{if(x)d.textContent=(LANG==='he'?'גרסה: ':'Version: ')+(z=>z.getDate()+'/'+(z.getMonth()+1)+'/'+z.getFullYear()+' '+String(z.getHours()).padStart(2,'0')+':'+String(z.getMinutes()).padStart(2,'0'))(new Date(x*1000))})}).observe(document.body,{childList:true,subtree:true})})();
window.__updateReady=function(){toast(LANG==='he'?'הותקנה גרסה חדשה – מתעדכן…':'New version installed – updating…');const go=()=>{const busy=['sheetbg','catbg','daybg','impbg','pkbg'].some(id=>{const el=document.getElementById(id);return el&&el.classList.contains('open')});if(busy)setTimeout(go,1500);else location.reload()};setTimeout(go,1800)};
window.__needApk=function(url){const b=document.getElementById('banner');b.innerHTML=(LANG==='he'?'יש עדכון לאפליקציה שצריך להתקין פעם אחת. ':'An app update needs to be installed once. ')+'<a href="'+url.replace(/"/g,'')+'" style="color:inherit;font-weight:700">'+(LANG==='he'?'להורדה':'Download')+'</a>';b.classList.add('show')};
setTimeout(()=>{try{if(window.EMAndroid&&EMAndroid.status){const st=JSON.parse(EMAndroid.status());if(st.needApk)__needApk(st.needApk);if(st.updated)__updateReady()}}catch(e){}},800);
render();\n(async()=>{""")
r("render();\n(async()=>{","window.__back=function(){if(pkbg.classList.contains('open')){closePicker();return true}if(document.getElementById('impbg').classList.contains('open')){closeImp();return true}if(document.getElementById('catbg').classList.contains('open')){closeCatEditor();return true}if(document.getElementById('daybg').classList.contains('open')){closeDay();return true}if(sheetbg.classList.contains('open')){closeSheet();return true}if(VIEW!=='home'){VIEW='home';render();return true}return false};\nrender();\n(async()=>{")
HEAD='<meta name="theme-color" content="#0f1f3d">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-180.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="default">\n<meta name="apple-mobile-web-app-title" content="Expenses">'
r('<meta name="theme-color" content="#0f1f3d">',HEAD)
WEB=r"""<script>
/* Web version (iPhone / browser): offline cache + "Add to Home Screen" hint. Does nothing inside the Android app. */
(function(){
  var web=location.protocol==='https:'&&location.hostname.indexOf('appassets')<0;
  if(!web)return;
  if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(function(){})}
  var ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var standalone=navigator.standalone||matchMedia('(display-mode: standalone)').matches;
  try{if(!ios||standalone||localStorage.getItem('em_hint_off'))return}catch(e){return}
  var he=(function(){try{return (localStorage.getItem('mm_lang')||'he')==='he'}catch(e){return true}})();
  var b=document.createElement('div');
  b.setAttribute('style','margin:calc(10px + env(safe-area-inset-top)) 12px 0;padding:12px 14px;border-radius:14px;background:var(--accent-soft);color:var(--ink);font:14px/1.45 system-ui,-apple-system,sans-serif;display:flex;gap:10px;align-items:flex-start');
  b.dir=he?'rtl':'ltr';
  b.innerHTML='<div style="flex:1">'+(he?'<b>להתקנה באייפון:</b> לחץ על כפתור השיתוף <b style="display:inline-block;padding:0 6px;border:1px solid var(--line);border-radius:6px">⬆︎</b> בספארי ← <b>הוספה למסך הבית</b>. אחרי ההתקנה פתח רק מהאייקון. <a href="guide.html" style="color:var(--accent);font-weight:700">מדריך מלא</a>':'<b>Install on iPhone:</b> tap Share in Safari → <b>Add to Home Screen</b>. After that, always open it from the icon. <a href="guide.html#en" style="color:var(--accent);font-weight:700">Full guide</a>')+'</div><button aria-label="close" style="border:0;background:none;font-size:20px;line-height:1;color:var(--muted);cursor:pointer">×</button>';
  b.querySelector('button').onclick=function(){try{localStorage.setItem('em_hint_off','1')}catch(e){}b.remove()};
  document.body.insertBefore(b,document.body.firstChild);
})();
</script>
</body>"""
r('</body>',WEB)
r('</body>','<script src="firebase-config.js"></script>\n<script src="sync.js"></script>\n</body>')
a=re.sub(r"dataHint:'[^']*',","",a)
for bad in ['claude.use','Claude','fonts.googleapis']:
    if bad in a: raise SystemExit('leftover '+bad)
out=sys.argv[1] if len(sys.argv)>1 else os.path.join(ROOT,'app','src','main','assets','index.html')
open(out,'w',encoding='utf-8').write(a); print('apk html ok ->',os.path.relpath(out,ROOT))
