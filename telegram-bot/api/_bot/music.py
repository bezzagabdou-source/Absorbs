# -*- coding: utf-8 -*-
"""الموسيقى: يوت <اسم> → أغنية كاملة من يوتيوب، مع بدائل تلقائية، بحث، وكلمات."""
import io
import random
import re
import time

import requests

from .helpers import esc, take, keyboard, btn, is_error

MAX_AUDIO = 45 * 1024 * 1024
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}


def handle(ctx):
    if not ctx.words:
        return False

    rest = take(ctx, "يوت", "يوتيوب", "اغنيه", "اغنية", "موسيقى", "شغل", "song", "music", "play", "تحميل")
    if rest is not None:
        if not rest.strip():
            ctx.reply("🎵 <b>اكتب اسم الأغنية بعد الأمر:</b>\nمثال: <code>يوت الشاب خالد عيشة</code>\nأو: <code>يوت Amr Diab Tamally Maak</code>\n\n🔎 للبحث فقط: <code>بحث يوت اسم الأغنية</code>\n📝 للكلمات: <code>كلمات اسم الأغنية</code>")
            return True
        fetch_song(ctx, rest.strip())
        return True

    rest = take(ctx, "بحث يوت", "بحث اغنيه", "بحث اغنية", "بحث", "yts")
    if rest is not None:
        if not rest.strip():
            ctx.reply("🔎 Usage: بحث يوت <اسم الأغنية>")
            return True
        search_list(ctx, rest.strip())
        return True

    rest = take(ctx, "كلمات", "كلمات اغنيه", "lyrics")
    if rest is not None:
        if not rest.strip():
            ctx.reply("📝 الاستخدام: كلمات <اسم الأغنية>")
            return True
        get_lyrics(ctx, rest.strip())
        return True

    return False


# ---------- يوتيوب ----------
def _yt_search(query, limit=5):
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True,
            "socket_timeout": 15, "playlist_items": f"1:{limit}", "default_search": "ytsearch"}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
    out = []
    for e in (info.get("entries") or []):
        if e and e.get("id"):
            out.append({"id": e["id"], "title": e.get("title") or "بدون عنوان",
                        "duration": e.get("duration") or 0,
                        "channel": e.get("channel") or e.get("uploader") or "",
                        "url": f"https://www.youtube.com/watch?v={e['id']}"})
    return out


def _yt_info(video_id):
    import yt_dlp
    opts = {"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True,
            "socket_timeout": 20, "retries": 2,
            "format": "bestaudio[ext=m4a]/bestaudio/best",
            "extractor_args": {"youtube": {"player_client": ["android", "web_safari", "web"]}}}
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)


def _download(url, headers=None, cap=MAX_AUDIO, timeout=90):
    h = dict(UA)
    if headers:
        h.update(headers)
    r = requests.get(url, headers=h, timeout=timeout, stream=True)
    r.raise_for_status()
    buf = io.BytesIO()
    total = 0
    for chunk in r.iter_content(65536):
        total += len(chunk)
        if total > cap:
            raise ValueError("too big")
        buf.write(chunk)
    return buf.getvalue()


def _thumb_bytes(url):
    try:
        data = _download(url, cap=400_000, timeout=15)
        from PIL import Image
        im = Image.open(io.BytesIO(data)).convert("RGB")
        im.thumbnail((320, 320))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=80)
        b = out.getvalue()
        return b if len(b) < 200_000 else None
    except Exception:
        return None


def fetch_song(ctx, query, video_id=None):
    tg, cid = ctx.tg, ctx.chat_id
    status = tg.send(cid, f"🔎 أبحث عن: <b>{esc(query[:80])}</b> …\n⏳ ثوانٍ قليلة")
    smid = status.get("message_id") if isinstance(status, dict) else None
    tg.send_action(cid, "upload_voice")

    title = artist = None
    audio = thumb = None
    duration = 0
    source_url = None

    # 1) يوتيوب
    try:
        if not video_id:
            results = _yt_search(query, 1)
            if not results:
                raise ValueError("no results")
            video_id = results[0]["id"]
            title = results[0]["title"]
        info = _yt_info(video_id)
        title = info.get("title") or title or query
        artist = info.get("uploader") or info.get("channel") or "YouTube"
        duration = int(info.get("duration") or 0)
        source_url = f"https://www.youtube.com/watch?v={video_id}"
        if duration and duration > 1500:
            raise ValueError("too long")
        aurl = info.get("url")
        if not aurl and info.get("formats"):
            fmts = [f for f in info["formats"] if f.get("acodec") != "none" and f.get("url")]
            aurl = fmts[-1]["url"] if fmts else None
        if not aurl:
            raise ValueError("no audio url")
        audio = _download(aurl, info.get("http_headers"))
        thumb = _thumb_bytes(info.get("thumbnail")) if info.get("thumbnail") else None
    except Exception:
        audio = None

    if audio:
        res = tg.send_audio(cid, audio, title=title, performer=artist, duration=duration,
                            thumb=thumb, reply_to=ctx.msg.get("message_id") if ctx.msg else None,
                            caption=f"🎵 <b>{esc(title[:90])}</b>\n📥 من يوتيوب — استمتع! 🎧")
        if smid:
            tg.delete(cid, smid)
        if is_error(res):
            tg.send(cid, f"⚠️ تعذر رفع الملف، هذا رابط الأغنية:\n{source_url}")
        return

    # 2) ديزر (بديل)
    try:
        r = requests.get("https://api.deezer.com/search", params={"q": query, "limit": 1}, timeout=15)
        d = (r.json().get("data") or [None])[0]
        if d and d.get("preview"):
            audio = _download(d["preview"], cap=5_000_000, timeout=30)
            title = d.get("title", query)
            artist = d.get("artist", {}).get("name", "")
            cover = d.get("album", {}).get("cover_medium")
            thumb = _thumb_bytes(cover) if cover else None
            link = d.get("link", "")
            res = tg.send_audio(cid, audio, title=title, performer=artist, thumb=thumb,
                                reply_to=ctx.msg.get("message_id") if ctx.msg else None,
                                caption=f"🎵 <b>{esc(title)}</b> — {esc(artist)}\n⚡ معاينة عالية الجودة (30 ث)\n🎧 الأغنية الكاملة: {esc(link)}")
            if smid:
                tg.delete(cid, smid)
            if not is_error(res):
                return
    except Exception:
        pass

    # 3) آيتونز (بديل أخير)
    try:
        r = requests.get("https://itunes.apple.com/search",
                         params={"term": query, "media": "music", "limit": 1}, timeout=15)
        d = (r.json().get("results") or [None])[0]
        if d and d.get("previewUrl"):
            audio = _download(d["previewUrl"], cap=5_000_000, timeout=30)
            res = tg.send_audio(cid, audio, title=d.get("trackName", query),
                                performer=d.get("artistName", ""),
                                reply_to=ctx.msg.get("message_id") if ctx.msg else None,
                                caption=f"🎵 <b>{esc(d.get('trackName', query))}</b> — {esc(d.get('artistName', ''))}\n⚡ معاينة (30 ث)")
            if smid:
                tg.delete(cid, smid)
            if not is_error(res):
                return
    except Exception:
        pass

    # 4) فشل الكل → رابط بحث
    if smid:
        tg.edit(cid, smid, f"😔 ما لقيت نتيجة قابلة للتحميل لـ <b>{esc(query[:80])}</b>.\nجرّب اسماً أدق (اسم الفنان + الأغنية).")
    else:
        tg.send(cid, f"😔 ما لقيت نتيجة لـ {esc(query[:80])}.")
    tg.send(cid, "🔎 نتائج البحث:",
            markup=keyboard([[btn("▶️ يوتيوب", url="https://www.youtube.com/results?search_query=" + requests.utils.quote(query))],
                             [btn("🎵 ديزر", url="https://www.deezer.com/search/" + requests.utils.quote(query))]]))


def search_list(ctx, query):
    tg, cid = ctx.tg, ctx.chat_id
    status = tg.send(cid, f"🔎 أبحث في يوتيوب عن <b>{esc(query[:80])}</b>…")
    smid = status.get("message_id") if isinstance(status, dict) else None
    try:
        results = _yt_search(query, 6)
    except Exception:
        results = []
    if not results:
        if smid:
            tg.edit(cid, smid, "😔 تعذر البحث حالياً — جرّب: يوت <الاسم> مباشرة.")
        return
    lines = [f"🔎 <b>نتائج: {esc(query)}</b>\nاضغط زر التحميل ⬇️\n"]
    rows = []
    for i, r in enumerate(results[:6], 1):
        dur = f"{int(r['duration']) // 60}:{int(r['duration']) % 60:02d}" if r["duration"] else "?"
        lines.append(f"{i}. {esc(r['title'][:70])} ({dur})")
        rows.append([btn(f"⬇️ {i}", data=f"yt:{r['id']}"), btn("▶️ تشغيل", url=r["url"])])
    if smid:
        tg.delete(cid, smid)
    tg.send(cid, "\n".join(lines)[:4000], markup=keyboard(rows))


def callback(ctx, parts):
    # yt:video_id
    if parts[0] == "yt" and len(parts) > 1:
        vid = parts[1]
        cq = ctx.update["callback_query"]
        ctx.tg.answer_callback(cq["id"], "⏳ جاري التحميل… انتظر قليلاً")
        fetch_song(ctx, "أغنية", video_id=vid)


def get_lyrics(ctx, query):
    tg, cid = ctx.tg, ctx.chat_id
    try:
        r = requests.get("https://lrclib.net/api/search", params={"q": query}, timeout=15)
        items = r.json() if r.status_code == 200 else []
        best = next((x for x in items if x.get("plainLyrics")), None)
        if not best:
            tg.send(cid, f"😔 ما لقيت كلمات لـ <b>{esc(query)}</b>. جرّب (اسم الأغنية - الفنان).")
            return
        lyrics = best["plainLyrics"].strip()
        header = f"📝 <b>{esc(best.get('trackName', query))}</b> — {esc(best.get('artistName', ''))}\n\n"
        text = header + esc(lyrics)
        for i in range(0, len(text), 3900):
            tg.send(cid, text[i:i + 3900])
    except Exception:
        tg.send(cid, "⚠️ خدمة الكلمات غير متاحة حالياً، جرّب لاحقاً.")
