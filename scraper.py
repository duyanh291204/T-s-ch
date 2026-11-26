import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from curl_cffi import requests as cffi_requests

VN_TZ = timezone(timedelta(hours=7))
NOW = datetime.now(VN_TZ)
OUTPUT_FILE = Path("news.json")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
APIFY_TOKEN = os.getenv("APIFY_TOKEN", "").strip()
RUN_SOCIAL = os.getenv("RUN_SOCIAL", "true").lower() == "true"

VALID_PUBLISHERS = {"Trẻ", "Kim Đồng", "IPM", "Nhã Nam"}
VALID_TYPES = {"new", "reprint", "gift", "fes"}
VALID_CHANNELS = {"Web", "FB", "IG", "TikTok"}

WEB_SOURCES = [
    {
        "publisher": "Kim Đồng",
        "base": "https://nxbkimdong.com.vn",
        "json_paths": [
            "/collections/sach-moi/products.json?limit=15",
            "/collections/manga-comic/products.json?limit=15",
            "/products.json?limit=15",
        ],
        "html_urls": [
            "https://nxbkimdong.com.vn/blogs/news",
        ],
    },
    {
        "publisher": "IPM",
        "base": "https://ipm.vn",
        "json_paths": [
            "/collections/sach-moi/products.json?limit=15",
            "/products.json?limit=15",
        ],
        "html_urls": [
            "https://ipm.vn/blogs/news",
            "https://ipm.vn/blogs/tin-tuc",
        ],
    },
    {
        "publisher": "Nhã Nam",
        "base": "https://nhanam.vn",
        "json_paths": [
            "/collections/all/products.json?limit=15",
            "/products.json?limit=15",
        ],
        "html_urls": [
            "https://nhanam.vn/sach-moi-xuat-ban",
            "https://nhanam.vn/tin-tuc",
        ],
    },
    {
        "publisher": "Trẻ",
        "base": "https://www.nxbtre.com.vn",
        "json_paths": [],
        "html_urls": [
            "https://www.nxbtre.com.vn/sach-moi",
            "https://www.nxbtre.com.vn/tin-tuc",
        ],
    },
]

SOCIAL_TARGETS = {
    "FB": [
        ("Trẻ", "https://www.facebook.com/nxbtre"),
        ("Trẻ", "https://www.facebook.com/trecomic"),
        ("Kim Đồng", "https://www.facebook.com/nxbkimdong"),
        ("Kim Đồng", "https://www.facebook.com/kimdongcomics"),
        ("IPM", "https://www.facebook.com/ipmvn"),
        ("Nhã Nam", "https://www.facebook.com/nhanampublishing"),
    ],
    "IG": [
        ("Trẻ", "nxbtre"),
        ("Kim Đồng", "nxbkimdong"),
        ("IPM", "ipmvn"),
        ("Nhã Nam", "nhanam.vn"),
    ],
    "TikTok": [
        ("Trẻ", "nxbtre"),
        ("Kim Đồng", "nxbkimdong"),
        ("IPM", "ipmvn"),
        ("Nhã Nam", "nhanam.vn"),
    ],
}


def make_id(url: str, text: str) -> str:
    raw = (url or text[:120]).strip().encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:12]


def parse_price(val) -> int:
    if isinstance(val, (int, float)):
        return max(0, int(val))
    if isinstance(val, str):
        digits = re.sub(r"[^\d]", "", val.split(".")[0])
        return int(digits) if digits else 0
    return 0


def parse_iso_safe(val: str):
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=VN_TZ)
        return dt
    except Exception:
        return None


def load_existing():
    if not OUTPUT_FILE.exists():
        return []
    try:
        data = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data.get("items", [])
        if isinstance(data, list):
            return data
    except Exception as e:
        print(f"[Load existing error]: {e}")
    return []


def scrape_haravan_json(base_url: str, json_paths: list, publisher: str):
    results = []
    seen_handles = set()
    for path in json_paths:
        try:
            r = cffi_requests.get(base_url + path, impersonate="chrome124", timeout=18)
            if r.status_code != 200:
                continue
            ct = r.headers.get("content-type", "")
            if "json" not in ct and not r.text.strip().startswith("{"):
                continue
            products = r.json().get("products", [])
            for p in products:
                handle = p.get("handle", "")
                if handle and handle in seen_handles:
                    continue
                if handle:
                    seen_handles.add(handle)
                url = f"{base_url}/products/{handle}" if handle else base_url
                variants = p.get("variants") or [{}]
                price = parse_price(variants[0].get("price", 0))
                images = p.get("images") or []
                img = images[0].get("src", "") if images else ""
                if img.startswith("//"):
                    img = "https:" + img
                body_text = BeautifulSoup(p.get("body_html") or "", "html.parser").get_text(" ", strip=True)
                title = (p.get("title") or "").strip()
                if not title:
                    continue
                results.append({
                    "publisher": publisher,
                    "channel": "Web",
                    "raw_title": title,
                    "raw_text": f"{title}. Giá: {price}đ. {body_text[:500]}",
                    "price_hint": price,
                    "url": url,
                    "image": img,
                    "published_at": p.get("published_at") or p.get("created_at") or NOW.isoformat(timespec="seconds"),
                })
            if len(results) >= 18:
                break
        except Exception as e:
            print(f"[Web JSON skip] {publisher} {path}: {e}")
    return results


def scrape_html_fallback(url: str, base: str, publisher: str):
    results = []
    try:
        r = cffi_requests.get(url, impersonate="chrome124", timeout=20)
        if r.status_code != 200:
            print(f"[Web HTML {r.status_code}] {url}")
            return results

        soup = BeautifulSoup(r.text, "html.parser")
        seen_links = set()
        selectors = [
            "article a[href]",
            ".product-item a[href]",
            ".product-block a[href]",
            ".item_product_main a[href]",
            ".blog-item a[href]",
            ".news-item a[href]",
            ".book-item a[href]",
            "h3 a[href]",
            "h2 a[href]",
        ]
        for sel in selectors:
            for a in soup.select(sel):
                href = (a.get("href") or "").strip()
                title = (a.get("title") or a.get_text(" ", strip=True)).strip()
                if not href or not title or len(title) < 10:
                    continue
                if href.startswith(("javascript:", "mailto:", "tel:", "#")):
                    continue
                full_url = urljoin(base, href)
                if full_url in seen_links:
                    continue
                seen_links.add(full_url)

                parent = a.find_parent(["article", "div", "li"])
                snippet = parent.get_text(" ", strip=True)[:450] if parent else title
                img_tag = parent.find("img") if parent else None
                img = ""
                if img_tag:
                    img = img_tag.get("data-src") or img_tag.get("data-original") or img_tag.get("src") or ""
                    if img.startswith("//"):
                        img = "https:" + img
                    elif img.startswith("/"):
                        img = urljoin(base, img)

                results.append({
                    "publisher": publisher,
                    "channel": "Web",
                    "raw_title": title[:180],
                    "raw_text": snippet,
                    "price_hint": 0,
                    "url": full_url,
                    "image": img,
                    "published_at": NOW.isoformat(timespec="seconds"),
                })
                if len(results) >= 12:
                    return results
    except Exception as e:
        print(f"[Web HTML error] {url}: {e}")
    return results


def collect_web():
    raw_items = []
    for src in WEB_SOURCES:
        pub = src["publisher"]
        if src["json_paths"]:
            raw_items.extend(scrape_haravan_json(src["base"], src["json_paths"], pub))
        for u in src["html_urls"]:
            raw_items.extend(scrape_html_fallback(u, src["base"], pub))
    return raw_items


def run_apify_actor(actor_id: str, payload: dict):
    endpoint = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
    try:
        r = requests.post(
            endpoint,
            params={"token": APIFY_TOKEN, "timeout": 120},
            json=payload,
            timeout=140,
        )
        if r.status_code in (200, 201):
            data = r.json()
            return data if isinstance(data, list) else []
        print(f"[Apify {actor_id} status {r.status_code}]: {r.text[:200]}")
    except Exception as e:
        print(f"[Apify {actor_id} error]: {e}")
    return []


def collect_social():
    if not APIFY_TOKEN or not RUN_SOCIAL:
        print("[Social] Bỏ qua (chưa gắn APIFY_TOKEN hoặc ngoài khung giờ quét social).")
        return []

    raw_items = []

    # Facebook
    fb_urls = [{"url": u} for _, u in SOCIAL_TARGETS["FB"]]
    fb_map = {u.rstrip("/").lower(): pub for pub, u in SOCIAL_TARGETS["FB"]}
    fb_posts = run_apify_actor(
        "apify~facebook-posts-scraper",
        {"startUrls": fb_urls, "resultsLimit": 5},
    )
    for p in fb_posts:
        page_url = (p.get("facebookUrl") or p.get("pageUrl") or "").rstrip("/").lower()
        pub = next((v for k, v in fb_map.items() if k in page_url), "")
        if not pub:
            continue
        text = (p.get("text") or "").strip()
        if not text:
            continue
        media = p.get("media") or []
        thumb = media[0].get("thumbnail", "") if media and isinstance(media[0], dict) else ""
        raw_items.append({
            "publisher": pub,
            "channel": "FB",
            "raw_title": text.splitlines()[0][:140],
            "raw_text": text[:900],
            "price_hint": 0,
            "url": p.get("url") or p.get("topLevelUrl") or page_url,
            "image": thumb,
            "published_at": p.get("time") or NOW.isoformat(timespec="seconds"),
        })

    # Instagram
    ig_urls = [f"https://www.instagram.com/{h}/" for _, h in SOCIAL_TARGETS["IG"]]
    ig_map = {h.lower(): pub for pub, h in SOCIAL_TARGETS["IG"]}
    ig_posts = run_apify_actor(
        "apify~instagram-scraper",
        {"directUrls": ig_urls, "resultsType": "posts", "resultsLimit": 4},
    )
    for p in ig_posts:
        owner = (p.get("ownerUsername") or "").lower()
        pub = ig_map.get(owner, "")
        if not pub:
            continue
        caption = (p.get("caption") or "").strip()
        if not caption:
            continue
        raw_items.append({
            "publisher": pub,
            "channel": "IG",
            "raw_title": caption.splitlines()[0][:140],
            "raw_text": caption[:900],
            "price_hint": 0,
            "url": p.get("url") or f"https://www.instagram.com/p/{p.get('shortCode', '')}/",
            "image": p.get("displayUrl", ""),
            "published_at": p.get("timestamp") or NOW.isoformat(timespec="seconds"),
        })

    # TikTok
    tt_profiles = [h for _, h in SOCIAL_TARGETS["TikTok"]]
    tt_map = {h.lower(): pub for pub, h in SOCIAL_TARGETS["TikTok"]}
    tt_posts = run_apify_actor(
        "clockworks~free-tiktok-scraper",
        {"profiles": tt_profiles, "resultsPerPage": 4},
    )
    for p in tt_posts:
        author = (p.get("authorMeta", {}).get("name") or "").lower()
        pub = tt_map.get(author, "")
        if not pub:
            continue
        desc = (p.get("text") or "").strip()
        if not desc:
            continue
        raw_items.append({
            "publisher": pub,
            "channel": "TikTok",
            "raw_title": desc[:140],
            "raw_text": desc[:900],
            "price_hint": 0,
            "url": p.get("webVideoUrl", ""),
            "image": p.get("videoMeta", {}).get("coverUrl", ""),
            "published_at": p.get("createTimeISO") or NOW.isoformat(timespec="seconds"),
        })

    return raw_items


GEMINI_PROMPT = """
Bạn là hệ thống lọc tin xuất bản manga, light novel và sách tại Việt Nam cho 4 NXB: Trẻ, Kim Đồng, IPM, Nhã Nam.
Đầu vào là danh sách bài viết thô từ Web/FB/IG/TikTok.

Nhiệm vụ:
1. LOẠI BỎ tin rác: tuyển dụng, thông báo nghỉ lễ, chúc mừng ngày lễ, trích dẫn sách vu vơ không gắn với phát hành/quà/sự kiện, thông báo bảo trì.
2. CHỈ GIỮ LẠI tin liên quan tới:
   - "new": Ra mắt truyện/sách mới, tập mới, lịch phát hành, mở pre-order.
   - "reprint": Tái bản, in nối bản, bản bìa mới/boxset tái bản.
   - "gift": Bản đặc biệt (ĐB/Limited), quà tặng kèm (obi, bookmark, standee, postcard, shikishi, poster, booklet...), merch bán rời.
   - "fes": Hội sách, Festival manga/anime, sự kiện ký tặng, booth NXB có quà.
3. Với mỗi tin hợp lệ, trả về JSON array các object theo đúng cấu trúc:
[
  {
    "id": "giữ nguyên id đầu vào",
    "publisher": "Trẻ | Kim Đồng | IPM | Nhã Nam",
    "type": "new | reprint | gift | fes",
    "channel": "Web | FB | IG | TikTok",
    "title": "Tiêu đề ngắn gọn, rõ ràng, không dùng emoji, tối đa 95 ký tự",
    "series": "Tên bộ truyện/đầu sách chính (nếu xác định được, không thì chuỗi rỗng)",
    "summary": "Tóm tắt 1-2 câu trọng tâm: tập mấy, giá bìa (nếu có), ngày ra, điều kiện lấy quà",
    "gift": "Liệt kê quà kèm/merch nếu có, không có để chuỗi rỗng",
    "releaseDate": "YYYY-MM-DD nếu bài có ghi ngày phát hành/sự kiện, không rõ để chuỗi rỗng",
    "price": 0,
    "url": "giữ nguyên url đầu vào",
    "image": "giữ nguyên image đầu vào",
    "publishedAt": "giữ nguyên published_at đầu vào"
  }
]
Chỉ trả về JSON hợp lệ, không giải thích thêm.
""".strip()


def normalize_item(it: dict, fallback_raw: dict = None) -> dict:
    fb = fallback_raw or {}
    pub = it.get("publisher") if it.get("publisher") in VALID_PUBLISHERS else fb.get("publisher", "Trẻ")
    if pub not in VALID_PUBLISHERS:
        pub = "Trẻ"
    typ = it.get("type") if it.get("type") in VALID_TYPES else "new"
    ch = it.get("channel") if it.get("channel") in VALID_CHANNELS else fb.get("channel", "Web")
    if ch not in VALID_CHANNELS:
        ch = "Web"
    price = parse_price(it.get("price", 0)) or parse_price(fb.get("price_hint", 0))
    return {
        "id": str(it.get("id") or fb.get("id") or make_id(it.get("url", ""), it.get("title", ""))),
        "publisher": pub,
        "type": typ,
        "channel": ch,
        "title": str(it.get("title") or fb.get("raw_title") or "")[:110].strip(),
        "series": str(it.get("series") or "").strip(),
        "summary": str(it.get("summary") or fb.get("raw_text") or "")[:240].strip(),
        "gift": str(it.get("gift") or "").strip(),
        "releaseDate": str(it.get("releaseDate") or "").strip()[:10],
        "price": price,
        "url": str(it.get("url") or fb.get("url") or "").strip(),
        "image": str(it.get("image") or fb.get("image") or "").strip(),
        "publishedAt": str(it.get("publishedAt") or fb.get("published_at") or NOW.isoformat(timespec="seconds")),
    }


def fallback_keyword_filter(items: list):
    spam_words = ["tuyển dụng", "nghỉ lễ", "bảo trì", "thông báo nghỉ", "chúc mừng năm mới"]
    out = []
    for it in items:
        txt = (it["raw_title"] + " " + it["raw_text"]).lower()
        if any(s in txt for s in spam_words):
            continue
        if any(k in txt for k in ["fes", "hội sách", "festival", "booth", "ký tặng", "triển lãm"]):
            t = "fes"
        elif any(k in txt for k in ["tái bản", "in nối bản"]):
            t = "reprint"
        elif any(k in txt for k in ["bản đặc biệt", "limited", "standee", "postcard", "shikishi", "bookmark", "quà tặng", "obi", "boxset"]):
            t = "gift"
        else:
            t = "new"
        out.append(normalize_item({"type": t}, it))
    return out


def classify_with_gemini(new_raw_items: list):
    if not new_raw_items:
        return []
    if not GEMINI_API_KEY:
        print("[Gemini] Chưa gắn GEMINI_API_KEY -> dùng bộ lọc từ khoá cơ bản.")
        return fallback_keyword_filter(new_raw_items)

    raw_by_id = {x["id"]: x for x in new_raw_items}
    cleaned = []
    for i in range(0, len(new_raw_items), 20):
        batch = new_raw_items[i : i + 20]
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        )
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": GEMINI_PROMPT},
                        {"text": json.dumps(batch, ensure_ascii=False)},
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }
        try:
            r = requests.post(endpoint, json=payload, timeout=60)
            if r.status_code != 200:
                print(f"[Gemini error {r.status_code}]: {r.text[:200]}")
                cleaned.extend(fallback_keyword_filter(batch))
                continue
            text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text)
            if isinstance(parsed, list):
                for item in parsed:
                    if isinstance(item, dict):
                        cleaned.append(normalize_item(item, raw_by_id.get(item.get("id"))))
        except Exception as e:
            print(f"[Gemini exception]: {e}")
            cleaned.extend(fallback_keyword_filter(batch))
    return cleaned


def main():
    existing = load_existing()
    existing_ids = {x.get("id") for x in existing}
    existing_urls = {x.get("url") for x in existing if x.get("url")}

    raw = collect_web() + collect_social()
    print(f"[Collector] Gom được {len(raw)} bài thô.")

    deduped_new = []
    seen_now = set()
    for item in raw:
        uid = make_id(item.get("url", ""), item.get("raw_title", ""))
        if uid in existing_ids or (item.get("url") and item.get("url") in existing_urls) or uid in seen_now:
            continue
        seen_now.add(uid)
        item["id"] = uid
        deduped_new.append(item)

    print(f"[Dedup] Có {len(deduped_new)} bài mới cần xử lý.")
    processed_new = classify_with_gemini(deduped_new)

    cutoff = NOW - timedelta(days=45)
    merged = processed_new + existing
    final_items = []
    seen_final = set()
    for it in merged:
        uid = it.get("id")
        if not uid or uid in seen_final or not it.get("title"):
            continue
        dt = parse_iso_safe(it.get("publishedAt", ""))
        if dt and dt < cutoff:
            continue
        seen_final.add(uid)
        final_items.append(it)
        if len(final_items) >= 250:
            break

    payload = {
        "updatedAt": NOW.isoformat(timespec="seconds"),
        "count": len(final_items),
        "publishers": ["Trẻ", "Kim Đồng", "IPM", "Nhã Nam"],
        "items": final_items,
    }
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[Done] Đã ghi {len(final_items)} tin vào {OUTPUT_FILE}.")


if __name__ == "__main__":
    main()
