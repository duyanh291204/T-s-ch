"use strict";

// ============================
// TAB 3: TIN NXB (Mặc định CHỈ lọc theo tủ sách + chặn tin rác)
// ============================
const CLIENT_SPAM_KEYWORDS = [
  "ipmate",
  "ma giam gia",
  "voucher shopee",
  "voucher lazada",
  "black friday",
  "flash sale",
  "mega live",
  "tiktok shop",
  "creator tren tiktok",
  "group danh rieng cho cac creator",
  "tuyen dung",
  "thong bao nghi le",
  "bao tri he thong",
  "minigame",
  "giveaway",
];

function isJunkNewsItem(item) {
  if (!item || item.manual) return false;
  const hay = normVN(`${item.title || ""} ${item.summary || ""}`);
  return CLIENT_SPAM_KEYWORDS.some((kw) => hay.includes(kw));
}

function extractSeriesKeywords(seriesObj) {
  const rawParts = [];
  if (seriesObj.title) {
    rawParts.push(seriesObj.title);
    // Tách tên Việt / Anh / phụ đề qua dấu —, –, -, :, /, ngoặc
    seriesObj.title.split(/[—–\-:\/()|]+/).forEach((p) => rawParts.push(p));
  }
  if (seriesObj.aliases) {
    seriesObj.aliases.split(/[,;|]+/).forEach((p) => rawParts.push(p));
  }

  const tokens = new Set();
  for (const part of rawParts) {
    let t = normVN(part);
    if (!t) continue;
    // Bỏ các hậu tố tập/phần/phiên bản để khớp rộng hơn
    t = t
      .replace(/\b(phan|tap|vol|volume|season|quyen|bo|boxset|ban dac biet|ban db|limited|tai ban)\s*\d*\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (t.length >= 3) tokens.add(t);
  }
  return [...tokens];
}

function findMatchedSeries(item) {
  if (!state.series.length) return null;
  const hay = normVN(
    `${item.title || ""} ${item.series || ""} ${item.summary || ""} ${item.gift || ""} ${item.searchText || ""}`
  );
  if (!hay) return null;
  const paddedHay = ` ${hay} `;

  for (const s of state.series) {
    const keywords = extractSeriesKeywords(s);
    for (const kw of keywords) {
      if (kw.length <= 4) {
        // Từ khoá ngắn (VD: jojo, orv, opm) bắt buộc khớp nguyên từ để tránh trùng nhầm
        if (paddedHay.includes(` ${kw} `)) return s;
      } else {
        if (hay.includes(kw)) return s;
      }
    }
  }
  return null;
}

function matchesUserShelf(item) {
  return Boolean(findMatchedSeries(item));
}

async function callGeminiSearchNews(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Chưa nhập Gemini API Key trong Cài đặt.");

  const now = new Date();
  const ymText = `tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
  const nextM = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  const nextY = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const nextYmText = `tháng ${nextM}/${nextY}`;

  const activeSeries = (state.series || [])
    .filter((s) => s.status !== "Tạm ngưng")
    .sort((a, b) => (a.status === "Đang theo" ? -1 : 1) - (b.status === "Đang theo" ? -1 : 1))
    .slice(0, 24)
    .map((s) => (s.aliases ? `${s.title} (${s.aliases.split(",")[0].trim()})` : s.title));

  const shelfHint = activeSeries.length
    ? `Ưu tiên tìm tin tập mới, tái bản, bản đặc biệt/limited, quà tặng, Fes cho các bộ đang có trong tủ này: ${activeSeries.join(", ")}. Ngoài ra lấy thêm các tin lịch phát hành manga/light novel/sách nổi bật nhất của 4 NXB trong ${ymText} và ${nextYmText}.`
    : `Tìm các tin lịch phát hành manga, light novel, sách mới, tái bản, bản đặc biệt có quà tặng và sự kiện Fes nổi bật nhất trong ${ymText} và ${nextYmText}.`;

  const promptText = `Hãy dùng Google Search tìm tin phát hành manga, light novel, sách mới nhất tại Việt Nam từ 4 nhà xuất bản: Kim Đồng, NXB Trẻ, IPM, Nhã Nam (gồm cả web chính thức, fanpage Facebook công khai, bài tổng hợp lịch phát hành, Fahasa).
${shelfHint}
Bỏ qua hoàn toàn tin rác, mã giảm giá Shopee/Lazada, tuyển dụng, minigame.
Trả về DUY NHẤT 1 mảng JSON thuần (không bọc markdown, không giải thích thêm), tối đa 16 tin mới & chính xác nhất, mỗi phần tử có cấu trúc:
{"publisher":"Kim Đồng|Trẻ|IPM|Nhã Nam","type":"new|reprint|gift|fes","channel":"Web|FB|IG|TikTok","title":"Tiêu đề ngắn gọn rõ tên truyện và số tập","series":"Tên bộ gốc","summary":"Tóm tắt 1 câu ngắn gọn","gift":"Quà kèm/bản ĐB nếu có hoặc chuỗi rỗng","releaseDate":"YYYY-MM-DD hoặc chuỗi rỗng","price":0,"url":"Link bài viết gốc (nếu có)"}`;

  let modelsToTry = await discoverActiveGeminiModels(key, false);
  modelsToTry = [...modelsToTry].sort((a, b) => {
    const score = (m) => (m.includes("2.5-flash") && !m.includes("lite") ? 3 : m.includes("flash") ? 2 : 1);
    return score(b) - score(a);
  });

  let lastErr = "Không kết nối được Gemini Search.";
  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2400,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        lastErr = `[${model}] ${msg}`;
        if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(msg)) {
          throw new Error("API Key không hợp lệ — kiểm tra lại trong Cài đặt.");
        }
        if (res.status === 429) {
          throw new Error("API Key tạm chạm giới hạn (429) — đợi ~30 giây bấm Quét lại.");
        }
        continue;
      }

      const respParts = data?.candidates?.[0]?.content?.parts || [];
      const textParts = respParts.filter((p) => !p.thought && typeof p.text === "string");
      const rawText = (textParts.length ? textParts : respParts).map((p) => p.text || "").join("\n").trim();
      if (!rawText) {
        lastErr = `[${model}] AI không trả về kết quả.`;
        continue;
      }

      const parsed = extractJsonFromText(rawText);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
      const groundingChunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const fallbackUrls = groundingChunks.map((c) => c?.web?.uri).filter(Boolean);

      const validPubs = ["Trẻ", "Kim Đồng", "IPM", "Nhã Nam"];
      const validTypes = ["new", "reprint", "gift", "fes"];
      const validChans = ["Web", "FB", "IG", "TikTok"];

      const normalized = arr
        .map((it, idx) => {
          let pub = String(it.publisher || "").trim();
          if (/trẻ|tre/i.test(pub)) pub = "Trẻ";
          else if (/kim/i.test(pub)) pub = "Kim Đồng";
          else if (/ipm/i.test(pub)) pub = "IPM";
          else if (/nhã|nha/i.test(pub)) pub = "Nhã Nam";
          if (!validPubs.includes(pub)) pub = "Kim Đồng";

          const type = validTypes.includes(it.type) ? it.type : "new";
          let chan = validChans.includes(it.channel) ? it.channel : "Web";
          let itemUrl = String(it.url || "").trim();
          if (!/^https?:\/\//i.test(itemUrl)) itemUrl = fallbackUrls[idx] || "";
          if (/facebook\.com|fb\.com/i.test(itemUrl)) chan = "FB";
          else if (/instagram\.com/i.test(itemUrl)) chan = "IG";
          else if (/tiktok\.com/i.test(itemUrl)) chan = "TikTok";

          return {
            id: "ai_" + hashStringFast(`${pub}_${it.title || idx}`),
            publisher: pub,
            type,
            channel: chan,
            title: String(it.title || "").trim(),
            series: String(it.series || "").trim(),
            summary: String(it.summary || "").trim(),
            gift: String(it.gift || "").trim(),
            releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(String(it.releaseDate || "").trim())
              ? String(it.releaseDate).trim()
              : "",
            price: Math.max(0, Math.round(Number(it.price) || 0)),
            url: itemUrl,
            image: "",
            manual: false,
          };
        })
        .filter((x) => x.title && !isJunkNewsItem(x));

      return { items: normalized, model };
    } catch (err) {
      lastErr = err?.message || String(err);
      if (/API Key không hợp lệ|429/i.test(lastErr)) throw err;
    }
  }
  throw new Error(lastErr);
}

let isFetchingNews = false;

async function fetchNews(manual = false) {
  if (isFetchingNews) return;
  const titleEl = document.getElementById("newsSyncTitle");
  const metaEl = document.getElementById("newsSyncMeta");
  const refreshBtn = document.getElementById("refreshNewsBtn");

  const cache = state.aiNewsCache || { updatedAt: "", items: [] };
  const cacheAgeMs = cache.updatedAt ? Date.now() - new Date(cache.updatedAt).getTime() : Infinity;

  // Khi mở app (manual=false), ưu tiên nạp ngay tin đã lưu trong 12 giờ qua để tiết kiệm lượt API
  if (!manual && Array.isArray(cache.items) && cache.items.length > 0 && cacheAgeMs < 12 * 3600 * 1000) {
    newsItems = cache.items.filter((it) => !isJunkNewsItem(it));
    newsMeta = { updatedAt: cache.updatedAt, loaded: true, error: "" };
    const timeStr = new Date(cache.updatedAt).toLocaleString("vi-VN", { hour12: false });
    metaEl.textContent = `Gemini AI · Cập nhật: ${timeStr}`;
    renderNews();
    return;
  }

  const key = (state.geminiApiKey || "").trim();
  if (!key) {
    newsItems = Array.isArray(cache.items) ? cache.items : [];
    newsMeta = { updatedAt: cache.updatedAt || "", loaded: false, error: "Chưa có Gemini API Key" };
    titleEl.textContent = "Chưa gắn Gemini API Key";
    metaEl.textContent = "Vào Cài đặt dán API Key miễn phí để AI tự quét tin 4 NXB.";
    renderNews();
    if (manual) {
      showToast("Hãy dán Gemini API Key trong Cài đặt trước nhé.");
      openSettingsModal();
    }
    return;
  }

  isFetchingNews = true;
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Đang quét...";
  }
  titleEl.textContent = "Gemini AI đang tìm tin 4 NXB...";
  metaEl.textContent = "Đang tìm trên Google (Web & bài công khai 4 NXB)...";

  try {
    const res = await callGeminiSearchNews(key);
    newsItems = res.items;
    const nowIso = new Date().toISOString();
    state.aiNewsCache = { updatedAt: nowIso, items: newsItems };
    saveState();
    newsMeta = { updatedAt: nowIso, loaded: true, error: "" };
    const timeStr = new Date(nowIso).toLocaleString("vi-VN", { hour12: false });
    metaEl.textContent = `Gemini AI (${res.model}) · ${timeStr}`;
    if (manual) {
      SFX.success();
      showToast(`Đã quét được ${newsItems.length} tin sạch từ 4 NXB!`);
    }
  } catch (err) {
    if (Array.isArray(cache.items) && cache.items.length > 0) {
      newsItems = cache.items;
    }
    newsMeta = { updatedAt: cache.updatedAt || "", loaded: false, error: err.message };
    titleEl.textContent = "Chưa quét được tin mới";
    metaEl.textContent = err.message || "Lỗi kết nối Gemini API";
    if (manual) {
      SFX.error();
      showToast(err.message || "Lỗi quét tin Gemini AI.");
    }
  } finally {
    isFetchingNews = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Quét tin AI";
    }
  }
  renderNews();
}

function countdownText(dateStr) {
  if (!dateStr) return "";
  const target = new Date(dateStr + "T00:00:00");
  if (isNaN(target.getTime())) return dateStr;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((target - now) / 86400000);
  if (diff > 0) return `${dateStr} (còn ${diff} ngày)`;
  if (diff === 0) return `${dateStr} (hôm nay)`;
  return dateStr;
}

function renderNews() {
  const container = document.getElementById("newsContainer");
  const titleEl = document.getElementById("newsSyncTitle");

  const manualPins = state.pinned
    .filter((p) => p.manual)
    .map((p) => ({
      id: p.id,
      publisher: p.publisher,
      type: p.type,
      channel: p.channel || "Ghim tay",
      title: p.title,
      series: p.series || "",
      summary: p.note || "",
      gift: p.gift || "",
      releaseDate: p.releaseDate || "",
      price: p.estPrice || 0,
      url: p.url || "",
      image: "",
      manual: true,
    }));

  const combined = [...manualPins, ...newsItems];
  const shelfMatchedList = combined.filter((it) => it.manual || matchesUserShelf(it));

  // Cập nhật số đếm trên 2 tab chuyển chế độ + chấm thông báo đỏ CHỈ khi có tin khớp tủ
  const shelfCountEl = document.getElementById("scopeShelfCount");
  const allCountEl = document.getElementById("scopeAllCount");
  if (shelfCountEl) shelfCountEl.textContent = `(${shelfMatchedList.length})`;
  if (allCountEl) allCountEl.textContent = `(${combined.length})`;

  const autoShelfMatchedCount = newsItems.filter((it) => matchesUserShelf(it)).length;
  document.getElementById("newsDot").classList.toggle("show", autoShelfMatchedCount > 0);

  if (newsMeta.loaded) {
    titleEl.textContent = state.series.length
      ? `${autoShelfMatchedCount} tin khớp tủ · ${newsItems.length} tin sạch từ 4 NXB`
      : `Chưa có sách trong tủ · Đã quét ${newsItems.length} tin 4 NXB`;
  }

  const baseList = filters.newsScope === "shelf" ? shelfMatchedList : combined;

  const filtered = baseList.filter((it) => {
    if (filters.newsPub !== "Tất cả" && it.publisher !== filters.newsPub) return false;
    if (filters.newsType !== "Tất cả" && it.type !== filters.newsType) return false;
    if (filters.newsChan !== "Tất cả" && it.channel !== filters.newsChan) return false;
    return true;
  });

  if (!filtered.length) {
    if (filters.newsScope === "shelf" && !state.series.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-title">Tủ sách đang trống</div>
          <div class="empty-desc">
            Tab này mặc định chỉ hiện tin tập mới, tái bản, quà kèm và Fes liên quan đến <strong>truyện & sách bạn đang có</strong>. Thêm sách vào tủ trước để app tự lọc tin cho bạn.
          </div>
          <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" id="emptyGoAddBook">+ Thêm bộ vào tủ</button>
            <button class="btn btn-sm" id="emptySwitchAll">Xem tất cả tin 4 NXB</button>
          </div>
        </div>`;
      container.querySelector("#emptyGoAddBook").addEventListener("click", () => {
        document.querySelector('.tab-btn[data-tab="books"]').click();
        openSeriesForm();
      });
      container.querySelector("#emptySwitchAll").addEventListener("click", () => {
        document.getElementById("scopeAllBtn").click();
      });
      return;
    }

    if (filters.newsScope === "shelf" && state.series.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-title">Chưa có tin mới liên quan tới tủ của bạn</div>
          <div class="empty-desc">
            Hiện chưa có bài mới nào từ Trẻ, Kim Đồng, IPM, Nhã Nam nhắc tới ${state.series.length} đầu sách trong tủ. Mẹo: vào sửa bộ sách và điền thêm <strong>Tên khác / từ khoá</strong> (VD: tên tiếng Anh/Nhật) nếu NXB hay dùng tên khác.
          </div>
          <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-sm" id="emptySwitchAll2">Xem tất cả tin 4 NXB</button>
            <button class="btn btn-sm" id="emptyManualPin">+ Tự ghim lịch săn</button>
          </div>
        </div>`;
      container.querySelector("#emptySwitchAll2").addEventListener("click", () => {
        document.getElementById("scopeAllBtn").click();
      });
      container.querySelector("#emptyManualPin").addEventListener("click", openManualPinForm);
      return;
    }

    container.innerHTML = `
      <div class="empty">
        <div class="empty-title">${combined.length ? "Không có tin khớp bộ lọc" : "Chưa có tin từ 4 NXB"}</div>
        <div class="empty-desc">${
          combined.length
            ? "Thử chọn lại NXB, loại tin hoặc kênh khác."
            : "Bấm nút Quét tin AI ở góc trên để Gemini tự tìm lịch phát hành mới nhất từ 4 NXB."
        }</div>
        <button class="btn btn-sm" id="emptyManualPin">+ Tự ghim lịch săn</button>
      </div>`;
    const btn = document.getElementById("emptyManualPin");
    if (btn) btn.addEventListener("click", openManualPinForm);
    return;
  }

  const pinnedIds = new Set(state.pinned.map((p) => p.id));

  container.innerHTML = `<div class="news-list">${filtered
    .map((it, idx) => {
      const matchedSeries = findMatchedSeries(it);
      const isPinned = pinnedIds.has(it.id);
      const cd = countdownText(it.releaseDate);
      return `
        <article class="news-card fx-card-in ${matchedSeries ? "matched" : ""}" style="--stagger:${idx}">
          <div class="news-head">
            <span class="tag" style="border-left:2px solid ${pubColorVar(it.publisher)}">${esc(it.publisher)}</span>
            <span class="tag ${typeTagClass(it.type)}">${typeLabel(it.type)}</span>
            <span class="tag mono">${esc(it.channel || "Web")}</span>
            ${matchedSeries ? `<span class="tag tag-accent">Khớp: ${esc(matchedSeries.title.slice(0, 26))}</span>` : ""}
            ${cd ? `<span class="small-muted mono" style="margin-left:auto;">${esc(cd)}</span>` : ""}
          </div>
          <div class="news-body">
            <div class="news-text">
              <h3 class="news-title">${esc(it.title)}</h3>
              ${it.summary ? `<p class="news-summary">${esc(it.summary)}</p>` : ""}
              ${it.price ? `<div class="mono small-muted" style="margin-top:5px;">Giá dự kiến: ${fmtMoney(it.price)}</div>` : ""}
            </div>
            ${it.image ? `<img class="news-thumb" src="${esc(it.image)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ""}
          </div>
          ${it.gift ? `<div class="news-gift"><strong>Quà / Kèm:</strong> ${esc(it.gift)}</div>` : ""}
          <div class="news-actions">
            <button class="btn btn-sm ${isPinned ? "btn-accent" : ""}" data-pin="${esc(it.id)}">
              ${isPinned ? "Đã ghim dự chi" : "Ghim dự chi"}
            </button>
            <button class="btn btn-sm" data-import-news="${esc(it.id)}">Đã mua → Vào tủ</button>
            ${
              it.url
                ? `<a class="btn btn-sm" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer" style="margin-left:auto;">Xem gốc</a>`
                : ""
            }
          </div>
        </article>`;
    })
    .join("")}</div>`;

  container.querySelectorAll("[data-pin]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.pin;
      const existing = state.pinned.find((p) => p.id === id);
      if (existing) {
        state.pinned = state.pinned.filter((p) => p.id !== id);
        saveState();
        renderNews();
        renderSpending();
        showToast("Đã bỏ ghim.");
        return;
      }
      const item = combined.find((x) => x.id === id);
      if (!item) return;
      state.pinned.unshift({
        id: item.id,
        title: item.title,
        publisher: item.publisher,
        type: item.type,
        channel: item.channel,
        releaseDate: item.releaseDate || "",
        estPrice: Number(item.price) || 0,
        gift: item.gift || "",
        url: item.url || "",
        manual: false,
      });
      saveState();
      renderNews();
      renderSpending();
      showToast("Đã ghim vào Dự chi.");
    });
  });

  container.querySelectorAll("[data-import-news]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = combined.find((x) => x.id === btn.dataset.importNews);
      if (item) openQuickImportFromNews(item);
    });
  });
}

function openManualPinForm() {
  const html = `
    <form id="manualPinForm" class="form-grid">
      <div class="field">
        <label>Tiêu đề tin / Lịch săn *</label>
        <input name="title" required placeholder="VD: Dungeon Meshi tập 14 bản ĐB, Booth Kim Đồng Fes..." />
      </div>
      <div class="form-row-2">
        <div class="field">
          <label>Nhà xuất bản</label>
          <select name="publisher">
            <option value="Trẻ">Trẻ</option>
            <option value="Kim Đồng">Kim Đồng</option>
            <option value="IPM">IPM</option>
            <option value="Nhã Nam">Nhã Nam</option>
          </select>
        </div>
        <div class="field">
          <label>Loại tin</label>
          <select name="type">
            <option value="new">Truyện mới</option>
            <option value="reprint">Tái bản</option>
            <option value="gift">Quà / Bản ĐB</option>
            <option value="fes">Fes / Sự kiện</option>
          </select>
        </div>
      </div>
      <div class="form-row-2">
        <div class="field">
          <label>Ngày ra mắt / Fes</label>
          <input name="releaseDate" type="date" />
        </div>
        <div class="field">
          <label>Dự chi (VNĐ)</label>
          <input name="estPrice" type="number" min="0" value="0" />
        </div>
      </div>
      <div class="field">
        <label>Quà kèm / Ghi chú</label>
        <input name="gift" placeholder="VD: Kèm standee + postcard" />
      </div>
      <div class="field">
        <label>Link bài gốc (tuỳ chọn)</label>
        <input name="url" type="url" placeholder="https://..." />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-sm" id="cancelPinBtn">Huỷ</button>
        <button type="submit" class="btn btn-sm btn-primary">Ghim lịch</button>
      </div>
    </form>`;

  openModal("Ghim lịch săn tay", html, (body) => {
    body.querySelector("#cancelPinBtn").addEventListener("click", closeModal);
    body.querySelector("#manualPinForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.pinned.unshift({
        id: "man_" + uid(),
        title: fd.get("title").trim(),
        publisher: fd.get("publisher"),
        type: fd.get("type"),
        channel: "Ghim tay",
        releaseDate: fd.get("releaseDate") || "",
        estPrice: Math.max(0, Number(fd.get("estPrice")) || 0),
        gift: fd.get("gift").trim(),
        url: fd.get("url").trim(),
        manual: true,
      });
      saveState();
      renderNews();
      renderSpending();
      closeModal();
      showToast("Đã ghim lịch săn.");
    });
  });
}

function openQuickImportFromNews(item) {
  const defaultTarget = item.type === "gift" || item.type === "fes" ? "merch" : "book";
  const defaultSecName =
    item.type === "reprint" ? "Tái bản" : item.type === "gift" ? "Limited" : "Bản thường";

  const html = `
    <form id="quickImportForm" class="form-grid">
      <div class="field">
        <label>Nhập vào mục</label>
        <select name="target" id="qiTarget">
          <option value="book" ${defaultTarget === "book" ? "selected" : ""}>Tủ sách (Sách / Truyện)</option>
          <option value="merch" ${defaultTarget === "merch" ? "selected" : ""}>Quà & Đồ (Quà kèm / Fes)</option>
        </select>
      </div>
      <div class="field">
        <label id="qiNameLabel">Tên bộ truyện / sách *</label>
        <input name="name" required value="${esc(item.series || item.title)}" />
      </div>
      <div class="field" id="qiGiftNameWrap" style="display:none;">
        <label>Tên món quà *</label>
        <input name="giftName" value="${esc(item.gift || item.title)}" />
      </div>
      <div class="field">
        <div class="form-row-2">
          <div>
            <label>Giá bìa (VNĐ)</label>
            <input name="coverPrice" id="qiCoverIn" type="number" min="0" value="${Number(item.price) || 0}" />
          </div>
          <div>
            <label>Thực chi (VNĐ)</label>
            <input name="paidPrice" id="qiPaidIn" type="number" min="0" value="${Number(item.price) || 0}" />
          </div>
        </div>
        <div class="ck-row" id="qiCkRow">
          ${CK_PRESETS.map((pct) => `<button type="button" class="ck-btn mono" data-qck="${pct}">-${pct}%</button>`).join("")}
        </div>
      </div>
      <div id="qiBookExtra" class="form-grid">
        <div class="field">
          <label>Tên mục trong bộ (VD: Bản thường, Boxset, Limited, Tái bản)</label>
          <input name="sectionName" id="qiSecNameInput" value="${esc(defaultSecName)}" />
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Từ tập</label>
            <input name="volFrom" type="number" step="0.5" value="1" />
          </div>
          <div class="field">
            <label>Đến tập (để trống nếu 1 tập)</label>
            <input name="volTo" type="number" min="1" placeholder="1 tập thì bỏ trống" />
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-sm" id="qiCancel">Huỷ</button>
        <button type="submit" class="btn btn-sm btn-primary">Xác nhận nhập kho</button>
      </div>
    </form>`;

  openModal("Đã mua → Nhập kho nhanh", html, (body) => {
    const targetSel = body.querySelector("#qiTarget");
    const bookExtra = body.querySelector("#qiBookExtra");
    const giftNameWrap = body.querySelector("#qiGiftNameWrap");
    const nameLabel = body.querySelector("#qiNameLabel");

    const toggleExtra = () => {
      const isBook = targetSel.value === "book";
      bookExtra.style.display = isBook ? "grid" : "none";
      giftNameWrap.style.display = isBook ? "none" : "";
      nameLabel.textContent = isBook ? "Tên bộ truyện / sách *" : "Thuộc truyện / sách có quà *";
    };
    targetSel.addEventListener("change", toggleExtra);
    toggleExtra();

    const qiCover = body.querySelector("#qiCoverIn");
    const qiPaid = body.querySelector("#qiPaidIn");
    body.querySelectorAll("#qiCkRow .ck-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const pct = Number(b.dataset.qck);
        const cp = Math.max(0, Number(qiCover.value) || 0);
        qiPaid.value = Math.round(cp * (1 - pct / 100));
      });
    });
              body.querySelector("#qiCancel").addEventListener("click", closeModal);
    body.querySelector("#quickImportForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = fd.get("name").trim();
      const coverPrice = Math.max(0, Number(fd.get("coverPrice")) || 0);
      const paidPrice = Math.max(0, Number(fd.get("paidPrice")) || 0);

      if (fd.get("target") === "book") {
        let existing = state.series.find((s) => normVN(s.title) === normVN(name));
        if (!existing) {
          existing = {
            id: uid(),
            title: name,
            publisher: item.publisher || "Khác",
            category: "Manga",
            status: "Đang theo",
            aliases: "",
            note: "",
            cover: "",
            sections: [],
            createdAt: todayISO(),
          };
          state.series.unshift(existing);
        }
        const secName = (fd.get("sectionName") || "Bản thường").trim();
        existing.sections = existing.sections || [];
        let sec = existing.sections.find((x) => normVN(x.name) === normVN(secName));
        if (!sec) {
          sec = { id: uid(), name: secName, image: "", note: "", volumes: [] };
          existing.sections.push(sec);
        }
        const f = Number(fd.get("volFrom")) || 1;
        const rawTo = (fd.get("volTo") || "").trim();
        if (rawTo && Number(rawTo) > f) {
          addBatchVolumesToSection(sec, {
            from: f,
            to: Number(rawTo),
            priceMode: "total",
            coverInput: coverPrice,
            paidInput: paidPrice,
            discount: 0,
            date: todayISO(),
            image: "",
            note: item.gift ? `Quà: ${item.gift}` : "",
          });
        } else {
          sec.volumes.push({
            id: uid(),
            number: f,
            coverPrice,
            paidPrice,
            date: todayISO(),
            image: "",
            note: item.gift ? `Quà: ${item.gift}` : "",
          });
        }
        showToast(`Đã nhập "${name}" (${secName}) vào Tủ sách.`);
      } else {
        let group = state.giftGroups.find((g) => normVN(g.title) === normVN(name));
        if (!group) {
          const matchedS = state.series.find((s) => normVN(s.title) === normVN(name));
          group = {
            id: uid(),
            title: name,
            publisher: item.publisher || matchedS?.publisher || "Khác",
            cover: matchedS?.cover || "",
            note: "",
            createdAt: todayISO(),
            gifts: [],
          };
          state.giftGroups.unshift(group);
        }
        const gName = (fd.get("giftName") || item.gift || item.title).trim();
        group.gifts.unshift({
          id: uid(),
          name: gName,
          quantity: 1,
          price: paidPrice,
          source: item.type === "fes" ? "Săn tại Fes" : "Kèm bản ĐB",
          status: "Đã có",
          date: todayISO(),
          image: "",
          note: "",
        });
        showToast(`Đã nhập quà "${gName}" vào "${name}".`);
      }
      state.pinned = state.pinned.filter((p) => p.id !== item.id);
      saveState();
      renderBooks();
      renderMerch();
      renderNews();
      renderSpending();
      closeModal();
    });
  });
}
