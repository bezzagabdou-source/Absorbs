#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""لوحة تحكم الوسطاء — موقع زجاجي عصري (Flask)"""
import json, os, threading
from pathlib import Path
from flask import Flask, request, jsonify, render_template_string

BASE = Path(__file__).parent
DATA_FILE = BASE / "data.json"
_lock = threading.Lock()
app = Flask(__name__)

def load():
    with _lock:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))

def save(d):
    with _lock:
        DATA_FILE.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")

SECTIONS = {"xr": "🛡️ وسطاء XR", "bm": "⚔️ وسطاء BM", "ft": "🎩 وسطاء FT",
            "owners": "👑 وسطاء ومالكين", "free": "🎁 مجانيين مؤقتاً", "scammers": "🚨 منتحلين"}

PAGE = """<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>لوحة تحكم الوسطاء</title><style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,'Segoe UI',Tahoma,sans-serif;color:#fff;
background:linear-gradient(135deg,#0f2027,#203a43,#2c5364);min-height:100vh;padding:20px}
.glass{background:rgba(255,255,255,.08);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.18);
border-radius:18px;padding:18px;margin:14px auto;max-width:900px;box-shadow:0 8px 32px rgba(0,0,0,.35)}
h1{text-align:center} .stats{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.card{flex:1;min-width:140px;text-align:center;background:rgba(255,255,255,.1);border-radius:14px;padding:16px}
.card b{font-size:28px;display:block}
button{background:linear-gradient(90deg,#00c853,#00b0ff);border:0;color:#fff;padding:9px 16px;border-radius:10px;cursor:pointer;font-weight:700}
button.red{background:linear-gradient(90deg,#ff1744,#ff9100)}
input,select{padding:9px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;margin:4px}
input::placeholder{color:#cfd8dc} .row{display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,.12);flex-wrap:wrap}
a{color:#4fc3f7} .tabs{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.tabs button{background:rgba(255,255,255,.12)} .tabs button.on{background:linear-gradient(90deg,#00c853,#00b0ff)}
</style></head><body>
<h1>🛡️ لوحة تحكم بوت الوسطاء</h1>
<div class="glass"><div class="stats">
<div class="card"><b id="sUsers">0</b>👥 المستخدمين</div>
<div class="card"><b id="sTotal">0</b>🛡️ الوسطاء</div>
<div class="card"><b id="sScam">0</b>🚨 منتحلين</div>
</div></div>
<div class="glass"><div class="tabs" id="tabs"></div>
<div id="list"></div>
<h3>➕ إضافة عنصر جديد</h3>
<input id="name" placeholder="الاسم / اللقب"><input id="username" placeholder="@username">
<input id="guarantee" placeholder="الضمان (مثال 50$)"><input id="note" placeholder="ملاحظة (دلائله...)">
<button onclick="addItem()">إضافة</button></div>
<div class="glass"><h3>📣 رسالة جماعية لكل المستخدمين</h3>
<input id="bc" placeholder="اكتب الرسالة..." style="width:70%"><button onclick="broadcast()">إرسال</button>
<p id="bcRes"></p></div>
<script>
let cur='xr', data={};
const secs=__SECTIONS__;
async function refresh(){data=await (await fetch('/api/data')).json();
document.getElementById('sUsers').textContent=data.users.length;
let t=0;for(let k in data.sections)t+=data.sections[k].length;
document.getElementById('sTotal').textContent=t;
document.getElementById('sScam').textContent=data.sections.scammers.length;
renderTabs();renderList();}
function renderTabs(){document.getElementById('tabs').innerHTML=Object.keys(secs).map(k=>
`<button class="${k===cur?'on':''}" onclick="cur='${k}';renderTabs();renderList()">${secs[k]}</button>`).join('');}
function renderList(){document.getElementById('list').innerHTML=(data.sections[cur]||[]).map((it,i)=>
`<div class="row"><span>${it.note||''} ${it.name} — <a href="https://t.me/${(it.username||'').replace('@','')}" target="_blank">${it.username}</a> ${it.guarantee?'— ضمانه: '+it.guarantee:''}</span>
<button class="red" onclick="delItem(${i})">حذف</button></div>`).join('')||'<p>لا يوجد عناصر</p>';}
async function addItem(){const v=id=>document.getElementById(id).value.trim();
await fetch('/api/add',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({section:cur,name:v('name'),username:v('username'),guarantee:v('guarantee'),note:v('note')})});
['name','username','guarantee','note'].forEach(id=>document.getElementById(id).value='');refresh();}
async function delItem(i){await fetch('/api/del',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({section:cur,index:i})});refresh();}
async function broadcast(){const m=document.getElementById('bc').value;
const r=await (await fetch('/api/broadcast',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify({message:m})})).json();
document.getElementById('bcRes').textContent=r.msg||'';}
refresh();
</script></body></html>"""

@app.route("/")
def index():
    return render_template_string(PAGE.replace("__SECTIONS__", json.dumps(SECTIONS, ensure_ascii=False)))

@app.route("/api/data")
def api_data():
    return jsonify(load())

@app.route("/api/add", methods=["POST"])
def api_add():
    d = load(); b = request.json
    sec = b.get("section")
    if sec in d["sections"]:
        d["sections"][sec].append({"name": b.get("name",""), "username": b.get("username",""),
                                   "guarantee": b.get("guarantee",""), "note": b.get("note","")})
        save(d)
    return jsonify(ok=True)

@app.route("/api/del", methods=["POST"])
def api_del():
    d = load(); b = request.json
    sec = b.get("section")
    if sec in d["sections"]:
        d["sections"][sec].pop(b.get("index", 0))
        save(d)
    return jsonify(ok=True)

@app.route("/api/broadcast", methods=["POST"])
def api_broadcast():
    # تُرسل الرسالة عبر البوت عند تشغيله مع اللوحة (نفس العملية)
    d = load(); msg = request.json.get("message", "")
    users = d.get("users", [])
    try:
        import requests
        token = os.environ.get("BOT_TOKEN", "9169731361:AAGdtx1soQWt2GIdcq23_vSyS1XfLcIH0NQ")
        ok = 0
        for u in users:
            r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage",
                              json={"chat_id": u["id"], "text": msg}, timeout=10)
            if r.status_code == 200: ok += 1
        return jsonify(msg=f"✅ تم الإرسال إلى {ok}/{len(users)} مستخدم")
    except Exception as e:
        return jsonify(msg=f"⚠️ خطأ: {e}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
