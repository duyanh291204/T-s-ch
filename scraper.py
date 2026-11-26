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
SCHEMA_VERSION = 2

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

# Các từ khoá rác cần loại cứng (khuyến mãi sàn, tuyển creator, nghỉ lễ, bảo trì...)
HARD_SPAM_KEYWORDS = [
    "mã giảm giá",
    "voucher shopee",
    "voucher lazada",
    "black friday",
    "flash sale",
    "mega live",
    "siêu sale",
    "săn sale shopee",
    "sale 25",
    "sale ngày đôi",
    "freeship",
    "ipmate",
    "creator trên tiktok",
    "tiktok shop",
    "group dành riêng cho các creator",
    "tuyển dụng",
    "tuyển cộng tác viên",
    "tuyển nhân viên",
    "thông báo nghỉ lễ",
    "lịch nghỉ tết",
    "lịch nghỉ lễ",
    "bảo trì hệ thống",
    "quà tri ân creator",
    "chúc mừng năm mới",
    "chúc mừng ngày",
    "happy new year",
    "minigame",
    "giveaway",
]

# Từ khoá cho thấy bài viết thực sự là tin phát hành/quà/Fes (giúp giữ lại kể cả khi có nhắc mua trên shopee)
RELEASE_SIGNAL_KEYWORDS = [
    "lịch phát hành",
    "tái bản",
    "in nối bản",
    "bản đặc biệt",
    "bản giới hạn",
    "limited",
    "boxset",
    "pre-order",
    "đặt trước",
    "standee",
    "shikishi",
    "postcard",
    "bookmark",
    "obi",
    "booklet",
    "hội sách",
    "festival",
    "fes",
    "ký tặng",
    "booth",
    "ra mắt tập",
    "tập mới",
]


def strip_emojis(text: str) -> str:
    if not text:
        return ""
    # Xoá các khối emoji / ký hiệu trang trí phổ biến để giao diện sạch sẽ
    cleaned = re.sub(
        r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0000FE0F\U0000200D]+",
        "",
        text,
    )
    return re.sub(r"\s+", " ", cleaned).strip()


def clean_web_snippet(title: str, snippet: str):
    """Dọn rác HTML như 'Mua ngay', 'Thêm vào giỏ' và tách giá tiền sạch."""
    s = re.sub(r"\s+", " ", (snippet or "")).strip()
    price = 0
    m = re.search(r"(\d{1,3}(?:[.,]\d{3})+)\s*(?:đ|₫|vnđ|vnd)?", s, re.IGNORECASE)
    if m:
        digits = re.sub(r"[^\d]", "", m.group(1))
        if digits:
            price = int(digits)
    # Gỡ nút bấm thương mại điện tử
    s = re.sub(r"\b(mua ngay|thêm vào giỏ|xem nhanh|chi tiết|hết hàng|còn hàng|giảm giá)\b", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\d{1,3}(?:[.,]\d{3})+\s*(?:đ|₫|vnđ|vnd)", "", s, flags=re.IGNORECASE)
    # Gỡ lặp lại tiêu đề ở đầu snippet
    t_clean = (title or "").strip()
    if t_clean and s.lower().startswith(t_clean.lower()):
        s = s[len(t_clean) :].strip(" -–:|.,")
    s = re.sub(r"\s+", " ", s).strip()
    return s, price


def is_spam_post(title: str, text: str, channel: str) -> bool:
    combined = f"{title} {text}".lower()
    # Nếu chứa từ khoá rác nặng
    has_spam = any(kw in combined for kw in HARD_SPAM_KEYWORDS)
    if not has_spam:
        return False
    # Ngoại lệ duy nhất: bài có lịch phát hành / hội sách / bản đặc biệt thực sự
    strong_release = any(
        kw in combined
        for kw in ["lịch phát hành", "bản đặc biệt", "boxset", "hội sách", "festival", "tái bản"]
    )
    if strong_release and not any(
        hard in combined for hard in ["mã giảm giá", "ipmate", "tuyển dụng", "creator trên tiktok", "black friday"]
    ):
        return False
    return True


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
            # Tự động xoá tin rác cũ nếu file news.json thuộc phiên bản cũ
            if data.get("version") != SCHEMA_VERSION:
                print(f"[Reset] Nâng cấp news.json lên v{SCHEMA_VERSION}, dọn sạch tin cũ...")
                return []
            return data.get("items", [])
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
                    "raw_text": body_text[:700] if body_text else title,
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
                if not href or not title or len(title) < 8:
                    continue
                if href.startswith(("javascript:", "mailto:", "tel:", "#")):
                    continue
                full_url = urljoin(base, href)
                if full_url in seen_links:
                    continue
                seen_links.add(full_url)

                parent = a.find_parent(["article", "div", "li"])
                raw_snippet = parent.get_text(" ", strip=True)[:500] if parent else title
                clean_snip, price_hint = clean_web_snippet(title, raw_snippet)

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
                    "raw_text": clean_snip or title,
                    "price_hint": price_hint,
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
            "raw_title": strip_emojis(text.splitlines()[0])[:140],
            "raw_text": text[:1600],
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
            "raw_title": strip_emojis(caption.splitlines()[0])[:140],
            "raw_text": caption[:1600],
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
            "raw_title": strip_emojis(desc)[:140],
            "raw_text": desc[:1200],
            "price_hint": 0,
            "url": p.get("webVideoUrl", ""),
            "image": p.get("videoMeta", {}).get("coverUrl", ""),
            "published_at": p.get("createTimeISO") or NOW.isoformat(timespec="seconds"),
        })

    return raw_items


GEMINI_PROMPT = """
Bạn là hệ thống lọc tin xuất bản manga, light novel và sách tại Việt Nam cho 4 NXB: Trẻ, Kim Đồng, IPM, Nhã Nam.
Đầu vào là danh sách bài viết thô từ Web/FB/IG/TikTok.

QUY TẮC LỌC RÁC NGHIÊM NGẶT:
1. BẮT BUỘC LOẠI BỎ (không đưa vào mảng kết quả):
   - Tin khuyến mãi/mã giảm giá Shopee, Lazada, Tiki, Black Friday, Flash Sale, Freeship, livestream bán hàng.
   - Tin tuyển dụng, tuyển creator/affiliate/IPMATE, mời vào group TikTok Shop, minigame, giveaway.
   - Tin nghỉ lễ, chúc mừng, bảo trì, cảm ơn chung chung, trích dẫn sách vu vơ không gắn phát hành.
2. CHỈ GIỮ LẠI bài viết thực sự nói về:
   - "new": Ra mắt sách/truyện mới, tập mới, lịch phát hành tháng, mở đặt trước (pre-order).
   - "reprint": Tái bản, in nối bản, bản bìa mới/boxset tái bản.
   - "gift": Bản đặc biệt (ĐB/Limited), quà tặng kèm (obi, bookmark, standee, postcard, shikishi, poster, booklet...), merch.
   - "fes": Hội sách, Festival manga/anime, sự kiện ký tặng, booth NXB có quà.
3. Trả về JSON array các object đúng định dạng (KHÔNG DÙNG EMOJI trong title/summary):
[
  {
    "id": "giữ nguyên id đầu vào",
    "publisher": "Trẻ | Kim Đồng | IPM | Nhã Nam",
    "type": "new | reprint | gift | fes",
    "channel": "Web | FB | IG | TikTok",
    "title": "Tiêu đề ngắn gọn, rõ tên sách/sự kiện, không emoji, tối đa 95 ký tự",
    "series": "Tên bộ truyện/đầu sách chính (nếu là bài Lịch phát hành nhiều bộ thì liệt kê các tên bộ nổi bật cách nhau bởi dấu phẩy, kèm cả tên tiếng Anh & tiếng Việt nếu bài có ghi)",
    "summary": "Tóm tắt 1-2 câu ngắn gọn, không emoji, không chứa 'Mua ngay'. Nếu là lịch phát hành thì nêu các mốc ngày nổi bật.",
    "gift": "Quà kèm/merch nếu có, không thì để chuỗi rỗng",
    "releaseDate": "YYYY-MM-DD nếu xác định được ngày ra mắt/Fes, không rõ để chuỗi rỗng",
    "price": 0,
    "url": "giữ nguyên url đầu vào",
    "image": "giữ nguyên image đầu vào",
    "publishedAt": "giữ nguyên published_at đầu vào"
  }
]
Chỉ trả về JSON array hợp lệ.
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

    raw_title = strip_emojis(str(it.get("title") or fb.get("raw_title") or ""))[:110]
    raw_summary = strip_emojis(str(it.get("summary") or fb.get("raw_text") or ""))
    raw_summary = re.sub(r"\b(mua ngay|thêm vào giỏ|xem nhanh)\b", "", raw_summary, flags=re.IGNORECASE)
    raw_summary = re.sub(r"\s+", " ", raw_summary).strip()[:240]

    # Lưu thêm searchBlob (tối đa 1200 ký tự đã bỏ emoji) để app trên iPhone đối chiếu chính xác
    # ngay cả khi 1 bài Lịch phát hành nhắc tên 10-20 bộ truyện ở phần thân bài!
    search_blob = strip_emojis(f"{raw_title} {it.get('series', '')} {fb.get('raw_text', '')}")[:1200]

    return {
        "id": str(it.get("id") or fb.get("id") or make_id(it.get("url", ""), raw_title)),
        "publisher": pub,
        "type": typ,
        "channel": ch,
        "title": raw_title,
        "series": strip_emojis(str(it.get("series") or ""))[:300],
        "summary": raw_summary,
        "gift": strip_emojis(str(it.get("gift") or ""))[:180],
        "releaseDate": str(it.get("releaseDate") or "").strip()[:10],
        "price": price,
        "url": str(it.get("url") or fb.get("url") or "").strip(),
        "image": str(it.get("image") or fb.get("image") or "").strip(),
        "publishedAt": str(it.get("publishedAt") or fb.get("published_at") or NOW.isoformat(timespec="seconds")),
        "searchText": search_blob,
    }


def fallback_keyword_filter(items: list):
    """Bộ lọc dự phòng chặt chẽ nếu Gemini API chưa gắn key hoặc lỗi."""
    out = []
    for it in items:
        title = strip_emojis(it.get("raw_title", ""))
        text = strip_emojis(it.get("raw_text", ""))
        if is_spam_post(title, text, it.get("channel", "Web")):
            continue

        # Với bài MXH (FB/IG/TikTok), chỉ giữ nếu có tín hiệu xuất bản rõ ràng
        if it.get("channel") in ("FB", "IG", "TikTok"):
            low_all = f"{title} {text}".lower()
            if not any(k in low_all for k in RELEASE_SIGNAL_KEYWORDS):
                continue

        low_title = title.lower()
        low_head = f"{title} {text[:260]}".lower()
        if any(k in low_head for k in ["fes", "hội sách", "festival", "booth", "ký tặng", "triển lãm"]):
            t = "fes"
        elif any(k in low_head for k in ["tái bản", "in nối bản"]):
            t = "reprint"
        elif any(
            k in low_head
            for k in ["bản đặc biệt", "bản giới hạn", "limited", "standee", "postcard", "shikishi", "bookmark", "obi", "boxset"]
        ):
            t = "gift"
        else:
            t = "new"

        clean_snip, hint_p = clean_web_snippet(title, text) if it.get("channel") == "Web" else (text[:220], 0)
        out.append(
            normalize_item(
                {
                    "type": t,
                    "title": title,
                    "summary": clean_snip,
                    "price": it.get("price_hint") or hint_p,
                },
                it,
            )
        )
    return out


def extract_json_array(raw_text: str):
    txt = (raw_text or "").strip()
    if txt.startswith("```"):
        txt = re.sub(r"^```(?:json)?\s*", "", txt)
        txt = re.sub(r"\s*```$", "", txt)
    try:
        parsed = json.loads(txt)
        return parsed if isinstance(parsed, list) else None
    except Exception:
        m = re.search(r"\[[\s\S]*\]", txt)
        if m:
            try:
                parsed = json.loads(m.group(0))
                return parsed if isinstance(parsed, list) else None
            except Exception:
                return None
    return None


def call_gemini_batch(batch: list):
    # Gửi phiên bản rút gọn cho Gemini để tiết kiệm token và tránh bị cắt JSON
    slim_batch = [
        {
            "id": x["id"],
            "publisher": x["publisher"],
            "channel": x["channel"],
            "raw_title": x["raw_title"],
            "raw_text": x["raw_text"][:1000],
            "price_hint": x.get("price_hint", 0),
            "url": x["url"],
            "image": x["image"],
            "published_at": x["published_at"],
        }
        for x in batch
    ]

    models_to_try = [
        ("gemini-2.5-flash", {"responseMimeType": "application/json", "temperature": 0.1, "thinkingConfig": {"thinkingBudget": 0}}),
        ("gemini-2.0-flash", {"responseMimeType": "application/json", "temperature": 0.1}),
    ]

    for model_name, gen_cfg in models_to_try:
        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent?key={GEMINI_API_KEY}"
        )
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": GEMINI_PROMPT},
                        {"text": json.dumps(slim_batch, ensure_ascii=False)},
                    ]
                }
            ],
            "generationConfig": gen_cfg,
        }
        try:
            r = requests.post(endpoint, json=payload, timeout=50)
            if r.status_code != 200:
                print(f"[Gemini {model_name} HTTP {r.status_code}]: {r.text[:220]}")
                continue
            cand = r.json().get("candidates", [{}])[0]
            text = cand.get("content", {}).get("parts", [{}])[0].get("text", "")
            parsed = extract_json_array(text)
            if parsed is not None:
                print(f"[Gemini {model_name}] OK: {len(batch)} bài thô -> giữ {len(parsed)} tin sạch.")
                return parsed
            print(f"[Gemini {model_name}] Không parse được JSON: {text[:160]}")
        except Exception as e:
            print(f"[Gemini {model_name} exception]: {e}")
    return None


def classify_with_gemini(new_raw_items: list):
    if not new_raw_items:
        return []
    if not GEMINI_API_KEY:
        print("[Gemini] Chưa gắn GEMINI_API_KEY -> dùng bộ lọc từ khoá chặt.")
        return fallback_keyword_filter(new_raw_items)

    raw_by_id = {x["id"]: x for x in new_raw_items}
    cleaned = []
    # Batch 10 bài/lần để đảm bảo phản hồi nhanh, không bị cắt JSON
    for i in range(0, len(new_raw_items), 10):
        batch = new_raw_items[i : i + 10]
        parsed = call_gemini_batch(batch)
        if parsed is None:
            cleaned.extend(fallback_keyword_filter(batch))
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            fb = raw_by_id.get(item.get("id"))
            norm = normalize_item(item, fb)
            if not is_spam_post(norm["title"], norm["summary"], norm["channel"]):
                cleaned.append(norm)
    return cleaned


def main():
    existing = load_existing()
    existing_ids = {x.get("id") for x in existing}
    existing_urls = {x.get("url") for x in existing if x.get("url")}

    raw = collect_web() + collect_social()
    print(f"[Collector] Gom được {len(raw)} bài thô.")

    deduped_new = []
    seen_now = set()
    spam_dropped = 0
    for item in raw:
        if is_spam_post(item.get("raw_title", ""), item.get("raw_text", ""), item.get("channel", "Web")):
            spam_dropped += 1
            continue
        uid = make_id(item.get("url", ""), item.get("raw_title", ""))
        if uid in existing_ids or (item.get("url") and item.get("url") in existing_urls) or uid in seen_now:
            continue
        seen_now.add(uid)
        item["id"] = uid
        deduped_new.append(item)

    print(f"[Pre-filter] Loại cứng {spam_dropped} tin rác · Còn {len(deduped_new)} bài mới cần xử lý.")
    processed_new = classify_with_gemini(deduped_new)

    cutoff = NOW - timedelta(days=45)
    merged = processed_new + existing
    final_items = []
    seen_final = set()
    for it in merged:
        uid = it.get("id")
        if not uid or uid in seen_final or not it.get("title"):
            continue
        if is_spam_post(it.get("title", ""), it.get("summary", ""), it.get("channel", "Web")):
            continue
        dt = parse_iso_safe(it.get("publishedAt", ""))
        if dt and dt < cutoff:
            continue
        seen_final.add(uid)
        final_items.append(it)
        if len(final_items) >= 250:
            break

    payload = {
        "version": SCHEMA_VERSION,
        "updatedAt": NOW.isoformat(timespec="seconds"),
        "count": len(final_items),
        "publishers": ["Trẻ", "Kim Đồng", "IPM", "Nhã Nam"],
        "items": final_items,
    }
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[Done] Đã ghi {len(final_items)} tin sạch (v{SCHEMA_VERSION}) vào {OUTPUT_FILE}.")


if __name__ == "__main__":
    main()
