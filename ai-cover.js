"use strict";

// ============================
// TẠO BÌA NHANH SIÊU TỐC (TẮT THINKING BUDGET -> ~1.5-3s + QUÉT CẢ KỆ NHIỀU CUỐN 1 LẦN!)
// ============================
const GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3.0-flash",
  "gemini-3-flash-preview",
];
let discoveredGeminiModelsCache = { keyHash: "", models: [], at: 0 };

function rankGeminiModelName(name) {
  const low = name.toLowerCase();
  if (
    /embedding|aqa|imagen|veo|tts|audio|robotics|computer-use|deep-research|lyria|gemma|learnlm|vision-001|gemini-1\.|gemini-2\.0-flash(?:-001|-exp)?$/i.test(
      low
    )
  ) {
    return -1;
  }
  if (!low.startsWith("gemini-")) return -1;
  let score = 100;
  // Ưu tiên tốc độ cực cao cho đọc bìa: flash-lite & flash đứng đầu (tránh pro/thinking chậm 20-30s)
  if (low.includes("flash-lite")) score += 680;
  else if (low.includes("flash")) score += 520;
  else if (low.includes("pro")) score += 120;

  if (low.includes("latest")) score += 90;
  const verMatch = low.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (verMatch) {
    const maj = Number(verMatch[1]) || 0;
    const min = Number(verMatch[2]) || 0;
    score += maj * 60 + min * 8;
  }
  if (low.includes("preview") || low.includes("exp")) score -= 25;
  if (low.includes("thinking")) score -= 200;
  return score;
}

async function discoverActiveGeminiModels(apiKey, forceRefresh = false) {
  const key = String(apiKey || "").trim();
  const kHash = hashStringFast(key);
  const now = Date.now();
  if (
    !forceRefresh &&
    discoveredGeminiModelsCache.keyHash === kHash &&
    discoveredGeminiModelsCache.models.length &&
    now - discoveredGeminiModelsCache.at < 1000 * 60 * 45
  ) {
    return discoveredGeminiModelsCache.models;
  }

  // Nếu đã có model chạy ngon được lưu trong máy & không ép làm mới -> dùng ngay khỏi tốn thêm 1 request GET /models!
  const savedModel = String(state.geminiModel || "").trim();
  if (!forceRefresh && savedModel && rankGeminiModelName(savedModel) > 0) {
    const fastList = [savedModel, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== savedModel)].slice(0, 5);
    discoveredGeminiModelsCache = { keyHash: kHash, models: fastList, at: now };
    return fastList;
  }

  const found = [];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=100`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(msg)) {
        throw new Error("API Key không hợp lệ — kiểm tra lại Key đã dán trong Cài đặt.");
      }
    } else if (Array.isArray(data.models)) {
      const scored = [];
      for (const m of data.models) {
        const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
        if (!methods.includes("generateContent")) continue;
        const shortName = String(m.name || "").replace(/^models\//, "").trim();
        const sc = rankGeminiModelName(shortName);
        if (sc > 0) scored.push({ name: shortName, score: sc });
      }
      scored.sort((a, b) => b.score - a.score);
      scored.forEach((x) => {
        if (!found.includes(x.name)) found.push(x.name);
      });
    }
  } catch (err) {
    if (/API Key không hợp lệ/i.test(err?.message || "")) throw err;
  }

  const ordered = [];
  found.forEach((m) => { if (!ordered.includes(m)) ordered.push(m); });
  GEMINI_FALLBACK_MODELS.forEach((m) => { if (!ordered.includes(m)) ordered.push(m); });

  const finalList = ordered.slice(0, 5);
  discoveredGeminiModelsCache = { keyHash: kHash, models: finalList, at: now };
  return finalList;
}

function extractJsonFromText(rawText) {
  const cleaned = String(rawText || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let start = -1;
  let end = -1;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
    end = cleaned.lastIndexOf("]");
  } else if (firstBrace !== -1) {
    start = firstBrace;
    end = cleaned.lastIndexOf("}");
  }
  if (start !== -1 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  throw new Error("AI trả về sai định dạng JSON.");
}

// Nén ảnh gọn 720px @ 0.72 (~45KB) -> upload chớp nhoáng trên 4G/Wi-Fi, vẫn đủ nét đọc chữ giá bìa
async function prepareImageForAI(file, maxDim = 720, quality = 0.72) {
  const dataUrl = await compressImageFile(file, maxDim, maxDim, quality);
  const commaIdx = dataUrl.indexOf(",");
  return {
    dataUrl,
    base64: commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl,
    mimeType: "image/jpeg",
  };
}

// Gọi Gemini với thinkingBudget=0 (tắt suy luận dài dòng) -> giảm từ 30s xuống ~1.5-3s!
async function callGeminiFastJson(apiKey, parts, maxTokens = 280) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Chưa nhập Gemini API Key.");
  const t0 = performance.now();
  let modelsToTry = await discoverActiveGeminiModels(key, false);
  let firstMeaningfulErr = "";
  let lastErr = "Không kết nối được Gemini API.";
  let triedFreshDiscovery = false;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    // Tắt thinking cho 2.5/3.x để phản hồi siêu tốc; nếu model từ chối field thinkingConfig -> thử lại không có field đó
    const genCfgs = [];
    const baseCfg = {
      temperature: 0.1,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    };
    if (/gemini-(?:2\.5|3)/i.test(model)) {
      genCfgs.push({ ...baseCfg, thinkingConfig: { thinkingBudget: 0 } });
    }
    genCfgs.push(baseCfg);

    for (const gCfg of genCfgs) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: gCfg,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.error?.message || `HTTP ${res.status}`;
          lastErr = `[${model}] ${msg}`;
          if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(msg)) {
            throw new Error("API Key không hợp lệ — kiểm tra lại Key trong Cài đặt.");
          }
          // Nếu chỉ lỗi tham số thinkingConfig -> thử lại gCfg tiếp theo của cùng model
          if (res.status === 400 && /thinking|unknown name/i.test(msg) && gCfg.thinkingConfig) {
            continue;
          }
          if (res.status === 429 && !firstMeaningfulErr) {
            firstMeaningfulErr = "API Key chạm giới hạn lượt/phút (429) — đợi ~30 giây thử lại.";
          } else if (!firstMeaningfulErr && !/no longer available|not found|not supported/i.test(msg)) {
            firstMeaningfulErr = lastErr;
          }
          // Nếu model cũ đã lưu bị gỡ -> tự quét lại danh sách model sống
          if (!triedFreshDiscovery && i === 0 && /no longer available|not found/i.test(msg)) {
            triedFreshDiscovery = true;
            state.geminiModel = "";
            modelsToTry = await discoverActiveGeminiModels(key, true);
            i = -1;
          }
          break;
        }

        const respParts = data?.candidates?.[0]?.content?.parts || [];
        const textParts = respParts.filter((p) => !p.thought && typeof p.text === "string");
        const rawText = (textParts.length ? textParts : respParts)
          .map((p) => p.text || "")
          .join("\n")
          .trim();
        if (!rawText) {
          lastErr = `[${model}] AI không trả về dữ liệu.`;
          break;
        }
        const parsed = extractJsonFromText(rawText);
        if (state.geminiModel !== model) {
          state.geminiModel = model;
          saveState();
        }
        const elapsedSec = ((performance.now() - t0) / 1000).toFixed(1);
        return { data: parsed, model, elapsedSec };
      } catch (err) {
        lastErr = err?.message || String(err);
        if (/API Key không hợp lệ/i.test(lastErr)) throw err;
        break;
      }
    }
  }
  throw new Error(firstMeaningfulErr || lastErr);
}

async function callGeminiReadCovers(apiKey, imagesList) {
  if (!imagesList || !imagesList.length) throw new Error("Chưa có ảnh bìa nào để đọc.");
  const promptText = `Đọc bìa manga/sách Việt Nam trong ảnh, trả về JSON gọn (không markdown):
{"seriesTitle":"Tên bộ (bỏ số tập/quà)","volumeNumber":1,"author":"Tác giả hoặc rỗng","publisher":"Kim Đồng|Trẻ|IPM|Nhã Nam|Khác","category":"Manga|Light Novel|Sách|Artbook","coverPrice":0,"editionHint":"Bản thường|Limited|Boxset|Tái bản|Bìa cứng","aliases":"Tên gốc/Anh nếu có","note":""}
Chú ý: nhận diện NXB qua logo/mã (KĐ=8935244/52x, Trẻ=8934974, IPM=8935250, Nhã Nam=8935235); coverPrice là số nguyên VNĐ đúng theo chữ Giá trên bìa (0 nếu không thấy).`;

  const parts = [{ text: promptText }];
  imagesList.forEach((imgObj) => {
    parts.push({ inline_data: { mime_type: imgObj.mimeType || "image/jpeg", data: imgObj.base64 } });
  });
  const res = await callGeminiFastJson(apiKey, parts, 260);
  return { ...(res.data || {}), _model: res.model, _elapsedSec: res.elapsedSec };
}

async function callGeminiReadShelfBatch(apiKey, imgObj) {
  const promptText = `Nhìn ảnh kệ sách hoặc nhiều cuốn manga/sách Việt Nam này. Liệt kê TẤT CẢ các bộ truyện/sách nhìn thấy, gộp các tập cùng bộ thành 1 mục, trả về JSON:
{"items":[{"seriesTitle":"Tên bộ","fromVol":1,"toVol":10,"publisher":"Kim Đồng|Trẻ|IPM|Nhã Nam|Khác","category":"Manga|Light Novel|Sách|Artbook","coverPrice":35000}]}
Nếu chỉ thấy số lượng cuốn mà không đọc rõ số tập từng cuốn, đặt fromVol=1 và toVol=số cuốn thấy được. Không thêm markdown.`;

  const parts = [
    { text: promptText },
    { inline_data: { mime_type: imgObj.mimeType || "image/jpeg", data: imgObj.base64 } },
  ];
  const res = await callGeminiFastJson(apiKey, parts, 900);
  const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
  return { items: list, model: res.model, elapsedSec: res.elapsedSec };
}

async function testGeminiApiKey(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Hãy dán API Key trước.");
  const modelsToTry = await discoverActiveGeminiModels(key, true);
  let firstMeaningfulErr = "";
  let lastErr = "Không kết nối được.";
  for (const model of modelsToTry) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "OK" }] }],
            generationConfig: { maxOutputTokens: 8 },
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        state.geminiModel = model;
        return { ok: true, model };
      }
      const msg = data?.error?.message || `HTTP ${res.status}`;
      lastErr = `[${model}] ${msg}`;
      if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(msg)) {
        throw new Error("API Key không đúng.");
      }
      if (res.status === 429 && !firstMeaningfulErr) {
        firstMeaningfulErr = "Key đúng nhưng đang chạm giới hạn miễn phí (429) — chờ 30s thử lại.";
      }
    } catch (e) {
      lastErr = e?.message || String(e);
      if (/API Key không đúng/i.test(lastErr)) throw e;
    }
  }
  throw new Error(firstMeaningfulErr || lastErr);
}

function openQuickCoverModal(initialTab = "single") {
  let mode = initialTab === "shelf" ? "shelf" : "single"; // "single" | "shelf"
  let frontFile = null;
  let frontCoverData = "";
  let frontAiObj = null;
  let backAiObj = null;
  let backThumbData = "";
  let shelfAiObj = null;
  let shelfThumbData = "";
  let isReading = false;

  const hasKey = Boolean((state.geminiApiKey || "").trim());

  const html = `
    <div class="form-grid">
      ${
        !hasKey
          ? `<div class="missing-strip" id="qcNoKeyBox">
               <strong>Cần 1 Gemini API Key miễn phí để AI đọc ảnh bìa</strong>
               <div class="small-muted" style="margin-top:4px;">
                 Lấy miễn phí trong 30 giây tại
                 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style="text-decoration:underline; font-weight:600;">aistudio.google.com/apikey</a>
                 rồi dán vào đây:
               </div>
               <div style="display:flex; gap:6px; margin-top:7px;">
                 <input type="text" id="qcQuickKeyInput" placeholder="Dán AIzaSy..." style="flex:1; padding:6px 8px; border:1px solid var(--line-strong); border-radius:2px; background:var(--surface);" />
                 <button type="button" class="btn btn-sm btn-primary" id="qcQuickSaveKeyBtn">Lưu Key</button>
               </div>
             </div>`
          : ""
      }

      <div class="scope-switch" id="qcModeSwitch" style="margin-bottom:2px;">
        <button type="button" class="${mode === "single" ? "active" : ""}" data-qcm="single">1 cuốn (Lấy bìa + giá)</button>
        <button type="button" class="${mode === "shelf" ? "active" : ""}" data-qcm="shelf">Cả kệ / Nhiều cuốn (1 ảnh)</button>
      </div>

      <!-- MODE 1: SINGLE BOOK -->
      <div id="qcSinglePane" class="form-grid" style="${mode === "single" ? "" : "display:none;"}">
        <div class="small-muted">
          Chụp <strong>Bìa trước</strong> (làm ảnh bìa + đọc tên, tác giả, NXB trong ~2 giây). Cần tự lấy đúng giá in sau sách thì chụp thêm <strong>Bìa sau</strong>.
        </div>
        <div class="qc-grid">
          <div class="qc-slot">
            <div class="qc-slot-label">
              <span>1. Bìa trước</span>
              <button type="button" class="small-muted" id="qcCropFrontBtn" style="display:none; text-decoration:underline;">Cắt lại</button>
            </div>
            <div class="qc-preview" id="qcFrontPrev">
              <span>Chưa có bìa trước</span>
              <span style="font-size:10px; margin-top:4px;">(Lưu làm ảnh bìa tủ)</span>
            </div>
            <div class="qc-slot-btns">
              <label class="btn btn-sm btn-primary" style="margin:0;">
                Chụp cam
                <input type="file" id="qcFrontCamIn" accept="image/*" capture="environment" style="display:none;" />
              </label>
              <label class="btn btn-sm" style="margin:0;">
                Chọn ảnh
                <input type="file" id="qcFrontLibIn" accept="image/*" style="display:none;" />
              </label>
            </div>
          </div>

          <div class="qc-slot">
            <div class="qc-slot-label">
              <span>2. Bìa sau</span>
              <span class="small-muted" style="font-weight:400; text-transform:none;">tuỳ chọn</span>
            </div>
            <div class="qc-preview" id="qcBackPrev">
              <span>Chưa có bìa sau</span>
              <span style="font-size:10px; margin-top:4px;">(Lấy giá bìa & NXB)</span>
            </div>
            <div class="qc-slot-btns">
              <label class="btn btn-sm" style="margin:0;">
                Chụp sau
                <input type="file" id="qcBackCamIn" accept="image/*" capture="environment" style="display:none;" />
              </label>
              <label class="btn btn-sm" style="margin:0;">
                Chọn ảnh
                <input type="file" id="qcBackLibIn" accept="image/*" style="display:none;" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- MODE 2: SHELF BATCH SCAN -->
      <div id="qcShelfPane" class="form-grid" style="${mode === "shelf" ? "" : "display:none;"}">
        <div class="small-muted">
          Dành cho tủ hàng trăm cuốn: chụp <strong>1 tấm cả tầng kệ sách hoặc 1 xấp truyện</strong> → AI quét một phát ra hết các bộ & số tập rồi nhập hàng loạt trong 3 giây!
        </div>
        <div class="qc-slot">
          <div class="qc-preview" id="qcShelfPrev" style="aspect-ratio:4/3;">
            <span>Chụp ngang 1 tầng kệ (rõ chữ gáy hoặc bìa)</span>
            <span style="font-size:10px; margin-top:4px;">Nên chụp mỗi lần 1 tầng ~10–25 cuốn để AI đọc chuẩn nhất</span>
          </div>
          <div class="qc-slot-btns">
            <label class="btn btn-sm btn-primary" style="margin:0;">
              Chụp tầng kệ
              <input type="file" id="qcShelfCamIn" accept="image/*" capture="environment" style="display:none;" />
            </label>
            <label class="btn btn-sm" style="margin:0;">
              Chọn ảnh kệ
              <input type="file" id="qcShelfLibIn" accept="image/*" style="display:none;" />
            </label>
          </div>
        </div>
      </div>

      <div class="qc-status-box" id="qcStatusBox" style="display:none;"></div>

      <div class="modal-actions" style="justify-content:space-between; flex-wrap:wrap; margin-top:4px;">
        <button type="button" class="btn btn-sm" id="qcOpenSettingsBtn">Cài đặt API Key</button>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-sm" id="qcSkipAiBtn" style="display:none;">Tự điền</button>
          <button type="button" class="btn btn-sm btn-primary" id="qcAnalyzeBtn" disabled>Đọc nhanh bằng AI</button>
        </div>
      </div>
    </div>`;

  openModal("Tạo bìa nhanh (AI siêu tốc)", html, (body) => {
    const singlePane = body.querySelector("#qcSinglePane");
    const shelfPane = body.querySelector("#qcShelfPane");
    const frontPrev = body.querySelector("#qcFrontPrev");
    const backPrev = body.querySelector("#qcBackPrev");
    const shelfPrev = body.querySelector("#qcShelfPrev");
    const cropFrontBtn = body.querySelector("#qcCropFrontBtn");
    const statusBox = body.querySelector("#qcStatusBox");
    const analyzeBtn = body.querySelector("#qcAnalyzeBtn");
    const skipAiBtn = body.querySelector("#qcSkipAiBtn");

    const setStatus = (msg, cls = "", loading = false) => {
      if (!msg) {
        statusBox.style.display = "none";
        return;
      }
      statusBox.className = "qc-status-box" + (cls ? " " + cls : "");
      statusBox.innerHTML = (loading ? '<span class="qc-spinner"></span>' : "") + msg;
      statusBox.style.display = "block";
    };

    const updateButtons = () => {
      if (mode === "shelf") {
        analyzeBtn.disabled = !shelfAiObj || isReading;
        analyzeBtn.textContent = "Quét cả kệ bằng AI";
        skipAiBtn.style.display = "none";
        return;
      }
      const hasAnyImg = Boolean(frontAiObj || backAiObj);
      analyzeBtn.disabled = !hasAnyImg || isReading;
      skipAiBtn.style.display = frontCoverData ? "" : "none";
      if (frontAiObj && backAiObj) analyzeBtn.textContent = "Đọc nhanh 2 bìa";
      else if (frontAiObj) analyzeBtn.textContent = "Đọc nhanh bìa trước";
      else if (backAiObj) analyzeBtn.textContent = "Đọc nhanh bìa sau";
      else analyzeBtn.textContent = "Đọc nhanh bằng AI";
    };

    body.querySelector("#qcModeSwitch").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-qcm]");
      if (!btn) return;
      mode = btn.dataset.qcm;
      body.querySelectorAll("#qcModeSwitch button").forEach((b) => b.classList.toggle("active", b === btn));
      singlePane.style.display = mode === "single" ? "grid" : "none";
      shelfPane.style.display = mode === "shelf" ? "grid" : "none";
      setStatus("");
      updateButtons();
    });

    const saveKeyBtn = body.querySelector("#qcQuickSaveKeyBtn");
    if (saveKeyBtn) {
      saveKeyBtn.addEventListener("click", () => {
        const val = (body.querySelector("#qcQuickKeyInput")?.value || "").trim();
        if (!val) {
          SFX.error();
          showToast("Hãy dán API Key vào ô trống trước nhé.");
          return;
        }
        state.geminiApiKey = val;
        state.geminiModel = "";
        saveState();
        SFX.success();
        const noKeyBox = body.querySelector("#qcNoKeyBox");
        if (noKeyBox) noKeyBox.style.display = "none";
        showToast("Đã lưu Gemini API Key!");
      });
    }

    body.querySelector("#qcOpenSettingsBtn").addEventListener("click", openSettingsModal);

    const onPickFront = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      SFX.shutter();
      frontFile = f;
      setStatus("Đang nén ảnh siêu nhẹ...", "", true);
      try {
        const [coverUrl, aiObj] = await Promise.all([
          compressImageFile(f, 360, 540, 0.78),
          prepareImageForAI(f, 720, 0.72),
        ]);
        frontCoverData = coverUrl;
        frontAiObj = aiObj;
        frontPrev.classList.add("has-img");
        frontPrev.innerHTML = `<img src="${esc(frontCoverData)}" alt="Bìa trước" />`;
        cropFrontBtn.style.display = "";
        setStatus("Đã nạp <strong>bìa trước</strong> — chụp thêm bìa sau (để lấy giá) hoặc bấm <strong>Đọc nhanh</strong>!", "ok");
        updateButtons();
      } catch {
        SFX.error();
        setStatus("Không đọc được tệp ảnh này, thử chọn lại nhé.", "err");
      }
    };

    const onPickBack = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      SFX.shutter();
      setStatus("Đang nén ảnh bìa sau...", "", true);
      try {
        const [thumbUrl, aiObj] = await Promise.all([
          compressImageFile(f, 300, 450, 0.68),
          prepareImageForAI(f, 720, 0.72),
        ]);
        backThumbData = thumbUrl;
        backAiObj = aiObj;
        backPrev.classList.add("has-img");
        backPrev.innerHTML = `<img src="${esc(backThumbData)}" alt="Bìa sau" />`;
        setStatus("Đã nạp <strong>bìa sau</strong> — bấm <strong>Đọc nhanh</strong> ngay!", "ok");
        updateButtons();
      } catch {
        SFX.error();
        setStatus("Không đọc được tệp ảnh bìa sau.", "err");
      }
    };

    const onPickShelf = async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      SFX.shutter();
      setStatus("Đang nén ảnh tầng kệ...", "", true);
      try {
        // Ảnh cả kệ cần nét hơn chút (~1024px) để đọc rõ tên gáy nhiều cuốn
        const [thumbUrl, aiObj] = await Promise.all([
          compressImageFile(f, 520, 400, 0.72),
          prepareImageForAI(f, 1024, 0.76),
        ]);
        shelfThumbData = thumbUrl;
        shelfAiObj = aiObj;
        shelfPrev.classList.add("has-img");
        shelfPrev.innerHTML = `<img src="${esc(shelfThumbData)}" alt="Ảnh tầng kệ" />`;
        setStatus("Đã nạp ảnh tầng kệ — bấm <strong>Quét cả kệ bằng AI</strong>!", "ok");
        updateButtons();
      } catch {
        SFX.error();
        setStatus("Không đọc được tệp ảnh kệ.", "err");
      }
    };

    body.querySelector("#qcFrontCamIn").addEventListener("change", onPickFront);
    body.querySelector("#qcFrontLibIn").addEventListener("change", onPickFront);
    body.querySelector("#qcBackCamIn").addEventListener("change", onPickBack);
    body.querySelector("#qcBackLibIn").addEventListener("change", onPickBack);
    body.querySelector("#qcShelfCamIn").addEventListener("change", onPickShelf);
    body.querySelector("#qcShelfLibIn").addEventListener("change", onPickShelf);

    cropFrontBtn.addEventListener("click", async () => {
      if (!frontFile) return;
      const cropped = await openImageCropper(frontFile, {
        ratio: 2 / 3, maxW: 360, maxH: 540, quality: 0.78, title: "Cắt ảnh bìa lưu vào Tủ",
      });
      if (cropped) {
        frontCoverData = cropped;
        frontPrev.innerHTML = `<img src="${esc(frontCoverData)}" alt="Bìa trước" />`;
        SFX.pop();
      }
    });

    skipAiBtn.addEventListener("click", () => {
      openQuickCoverConfirmModal(
        {
          seriesTitle: "", volumeNumber: 1, author: "",
          publisher: state.lastEntry?.publisher || "Kim Đồng",
          category: state.lastEntry?.category || "Manga",
          coverPrice: state.lastEntry?.coverPrice || 35000,
          editionHint: "Bản thường", aliases: "", note: "", aiSuccess: false,
        },
        frontCoverData, frontFile
      );
    });

    analyzeBtn.addEventListener("click", async () => {
      if (isReading) return;
      const key = (state.geminiApiKey || "").trim();
      if (!key) {
        SFX.error();
        setStatus('Chưa có Gemini API Key. Dán Key miễn phí ở trên hoặc vào <strong>Cài đặt API Key</strong>.', "err");
        return;
      }
      isReading = true;
      updateButtons();

      if (mode === "shelf") {
        setStatus("Đang quét nhanh tất cả đầu truyện trong ảnh kệ...", "", true);
        try {
          const res = await callGeminiReadShelfBatch(key, shelfAiObj);
          isReading = false;
          if (!res.items.length) {
            SFX.error();
            updateButtons();
            setStatus("Chưa đọc rõ chữ trên gáy sách — thử chụp gần hơn một chút nhé.", "err");
            return;
          }
          SFX.success();
          openShelfBatchConfirmModal(res.items, res.model, res.elapsedSec);
        } catch (err) {
          isReading = false;
          updateButtons();
          SFX.error();
          setStatus(`Lỗi quét kệ: ${esc(err?.message || "Thử lại sau vài giây.")}`, "err");
        }
        return;
      }

      const imgs = [];
      if (frontAiObj) imgs.push(frontAiObj);
      if (backAiObj) imgs.push(backAiObj);
      if (!imgs.length) return;
      setStatus("Đang đọc bìa siêu tốc...", "", true);
      try {
        const info = await callGeminiReadCovers(key, imgs);
        isReading = false;
        SFX.success();
        openQuickCoverConfirmModal({ ...info, aiSuccess: true }, frontCoverData, frontFile);
      } catch (err) {
        isReading = false;
        updateButtons();
        SFX.error();
        setStatus(`Lỗi đọc ảnh: ${esc(err?.message || "Thử lại sau vài giây.")}`, "err");
      }
    });
  });
}

// Xác nhận & nhập hàng loạt các bộ AI đọc được từ 1 tấm ảnh chụp cả tầng kệ
function openShelfBatchConfirmModal(rawItems, modelName = "", elapsedSec = "") {
  const last = { ...DEFAULT_STATE.lastEntry, ...(state.lastEntry || {}) };
  const validPubs = ["Trẻ", "Kim Đồng", "IPM", "Nhã Nam", "Khác"];
  const validCats = ["Manga", "Light Novel", "Sách", "Artbook"];
  const items = rawItems.map((it, idx) => {
    const title = String(it.seriesTitle || it.title || "").trim();
    const fromV = Math.max(1, Math.round(Number(it.fromVol) || 1));
    const toV = Math.max(fromV, Math.round(Number(it.toVol) || fromV));
    const pub = validPubs.includes(it.publisher) ? it.publisher : last.publisher || "Kim Đồng";
    const cat = validCats.includes(it.category) ? it.category : "Manga";
    const cp = Math.max(0, Math.round(Number(it.coverPrice) || 0)) || last.coverPrice || 35000;
    const existing = state.series.find((s) => normVN(s.title) === normVN(title));
    return { idx, title, fromV, toV, pub, cat, cp, existing };
  }).filter((x) => x.title);

  const html = `
    <form id="shelfBatchForm" class="form-grid">
      <div class="qc-status-box ok">
        Quét xong <strong>${items.length} bộ</strong> trong <strong>${esc(elapsedSec || "?")}s</strong>${modelName ? ` (${esc(modelName)})` : ""}! Chỉnh nhanh số tập nếu cần rồi bấm nhập 1 phát:
      </div>

      <div class="qc-batch-list">
        ${items
          .map(
            (it, i) => `
            <div class="qc-batch-row">
              <input type="checkbox" name="pick_${i}" checked />
              <div style="min-width:0;">
                <input type="text" name="title_${i}" value="${esc(it.title)}" style="width:100%; padding:4px 6px; border:1px solid var(--line); border-radius:2px; background:var(--surface-2); font-size:13px; font-weight:600;" />
                <div style="display:flex; gap:5px; margin-top:4px; align-items:center; flex-wrap:wrap;">
                  <select name="pub_${i}" style="padding:2px 4px; border:1px solid var(--line); border-radius:2px; background:var(--surface); font-size:11.5px;">
                    ${validPubs.map((p) => `<option value="${p}" ${it.pub === p ? "selected" : ""}>${p}</option>`).join("")}
                  </select>
                  <span class="small-muted">Tập</span>
                  <input type="number" name="from_${i}" min="1" value="${it.fromV}" style="width:48px; padding:2px 4px; border:1px solid var(--line); border-radius:2px; font-size:12px;" />
                  <span class="small-muted">–</span>
                  <input type="number" name="to_${i}" min="1" value="${it.toV}" style="width:52px; padding:2px 4px; border:1px solid var(--line); border-radius:2px; font-size:12px;" />
                  ${it.existing ? `<span class="tag tag-forest">Đã có trong tủ</span>` : ""}
                </div>
              </div>
              <input type="number" name="price_${i}" min="0" value="${it.cp}" title="Giá bìa/tập" style="width:74px; padding:4px 5px; border:1px solid var(--line); border-radius:2px; font-size:12px; text-align:right;" class="mono" />
            </div>`
          )
          .join("")}
      </div>

      <div class="form-row-2">
        <div class="field">
          <label>Chiết khấu chung (%)</label>
          <input name="discount" type="number" min="0" max="100" value="${last.discount ?? 15}" />
        </div>
        <div class="field">
          <label>Mục mặc định</label>
          <input name="secName" value="Bản thường" />
        </div>
      </div>

      <label class="check-inline">
        <input type="checkbox" id="shelfBatchLegacyChk" checked />
        <span>Mua từ trước (không cộng vào hạn mức tháng này)</span>
      </label>

      <div class="modal-actions" style="justify-content:space-between;">
        <button type="button" class="btn btn-sm" id="sbRetakeBtn">Chụp kệ khác</button>
        <button type="submit" class="btn btn-sm btn-primary">Nhập tất cả đã chọn</button>
      </div>
    </form>`;

  openModal(`Kết quả quét kệ (${items.length} bộ)`, html, (body) => {
    body.querySelector("#sbRetakeBtn").addEventListener("click", () => openQuickCoverModal("shelf"));
    body.querySelector("#shelfBatchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const disc = Math.min(100, Math.max(0, Number(fd.get("discount")) || 0));
      const secName = (fd.get("secName") || "Bản thường").trim();
      const isLegacy = Boolean(body.querySelector("#shelfBatchLegacyChk")?.checked);

      const picked = [];
      for (let i = 0; i < items.length; i++) {
        if (!fd.get(`pick_${i}`)) continue;
        const title = String(fd.get(`title_${i}`) || "").trim();
        if (!title) continue;
        const from = Math.max(1, Math.round(Number(fd.get(`from_${i}`)) || 1));
        const to = Math.max(from, Math.min(from + 150, Math.round(Number(fd.get(`to_${i}`)) || from)));
        const pub = String(fd.get(`pub_${i}`) || "Khác");
        const cp = Math.max(0, Math.round(Number(fd.get(`price_${i}`)) || 0));
        picked.push({ title, from, to, pub, cat: items[i].cat, cp });
      }
      if (!picked.length) {
        SFX.error();
        showToast("Chọn ít nhất 1 bộ để nhập nhé.");
        return;
      }
      pushUndo(`quét kệ nhập ${picked.length} bộ`);
      let totalVolsAdded = 0;
      picked.forEach((it) => {
        let s = state.series.find((x) => normVN(x.title) === normVN(it.title));
        if (!s) {
          s = {
            id: uid(),
            title: it.title,
            author: "",
            publisher: it.pub,
            category: it.cat,
            status: "Đang theo",
            aliases: "",
            note: "",
            cover: "",
            createdAt: todayISO(),
            sections: [],
          };
          state.series.unshift(s);
        }
        s.sections = s.sections || [];
        let sec = s.sections.find((x) => normVN(x.name) === normVN(secName));
        if (!sec) {
          sec = { id: uid(), name: secName, image: "", note: "", volumes: [] };
          s.sections.push(sec);
        }
        totalVolsAdded += addBatchVolumesToSection(sec, {
          from: it.from,
          to: it.to,
          priceMode: "unit",
          coverInput: it.cp,
          paidInput: 0,
          discount: disc,
          date: todayISO(),
          isLegacy,
          image: "",
          note: "",
        });
      });

      saveState();
      renderBooks();
      renderNews();
      renderSpending();
      closeModal();
      SFX.success();
      spawnCelebration(undefined, undefined, 22);
      notifyCapooEvent("added");
      showToast(`Đã nhập ${picked.length} bộ (${totalVolsAdded} tập) từ ảnh kệ!`, { undoable: true });
    });
  });
}

function openQuickCoverConfirmModal(info, initialCoverData = "", initialCoverFile = null) {
  const last = { ...DEFAULT_STATE.lastEntry, ...(state.lastEntry || {}) };
  const cleanTitle = String(info.seriesTitle || "").trim();
  const matchedExisting = cleanTitle
    ? state.series.find((s) => {
        const a = normVN(s.title);
        const b = normVN(cleanTitle);
        return a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)));
      })
    : null;

  let currentCoverData = initialCoverData || "";
  let currentFile = initialCoverFile || null;

  const validPubs = ["Trẻ", "Kim Đồng", "IPM", "Nhã Nam", "Khác"];
  const validCats = ["Manga", "Light Novel", "Sách", "Artbook"];
  const defPub = validPubs.includes(info.publisher) ? info.publisher : last.publisher || "Kim Đồng";
  const defCat = validCats.includes(info.category) ? info.category : last.category || "Manga";
  const defSec = (info.editionHint || "").trim() || last.sectionName || "Bản thường";
  const parsedPrice = Math.max(0, Math.round(Number(info.coverPrice) || 0));
  const defCoverPrice = parsedPrice > 0 ? parsedPrice : last.coverPrice || 35000;
  const defCk = last.discount ?? 15;
  const defPaid = Math.round(defCoverPrice * (1 - defCk / 100));
  const defVol = Number(info.volumeNumber) > 0 ? Number(info.volumeNumber) : 1;

  const bannerHtml = info.aiSuccess
    ? `<div class="qc-status-box ok">
         Đọc xong trong <strong>${esc(info._elapsedSec || "?")}s</strong>${parsedPrice > 0 ? ` · Bắt được giá <strong>${fmtMoney(parsedPrice)}</strong>` : " · Kiểm tra lại giá bìa bên dưới nhé"}!
       </div>`
    : "";

  const existingMatchHtml = matchedExisting
    ? `<div class="quick-box" style="border-color:var(--forest); background:var(--forest-soft);">
         <div style="font-size:12.5px; font-weight:600; color:var(--forest);">
           Trùng với bộ đang có: "${esc(matchedExisting.title)}"
         </div>
         <div class="field" style="margin-top:7px;">
           <label>Thêm vào mục:</label>
           <select id="qcExistingSecSel">
             ${(matchedExisting.sections || [])
               .map((sec) => `<option value="${sec.id}">${esc(sec.name)} (${(sec.volumes || []).length} tập)</option>`)
               .join("")}
             <option value="__new__">+ Tạo mục mới ("${esc(defSec)}")</option>
           </select>
         </div>
       </div>`
    : "";

  const html = `
    <form id="qcConfirmForm" class="form-grid">
      ${bannerHtml}
      ${existingMatchHtml}

      <div style="display:flex; gap:12px; align-items:flex-start;">
        <div class="cover-preview" id="qcConfCoverBox" style="width:72px; height:108px;">
          ${currentCoverData ? `<img src="${esc(currentCoverData)}" alt="" />` : "Chưa có"}
        </div>
        <div style="flex:1; min-width:0; display:flex; flex-direction:column; gap:7px;">
          <div class="field">
            <label>Tên bộ truyện / sách *</label>
            <input name="seriesTitle" required value="${esc(cleanTitle)}" placeholder="Nhập tên bộ..." />
          </div>
          <div class="field">
            <label>Tác giả</label>
            <input name="author" value="${esc(info.author || "")}" placeholder="Tác giả..." />
          </div>
        </div>
      </div>

      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${currentFile ? `<button type="button" class="btn btn-sm" id="qcConfCropBtn">Cắt lại bìa</button>` : ""}
        <label class="btn btn-sm" style="margin:0;">
          Đổi ảnh khác
          <input type="file" id="qcConfFileIn" accept="image/*" style="display:none;" />
        </label>
        <button type="button" class="btn btn-sm btn-danger" id="qcConfClearBtn" style="${currentCoverData ? "" : "display:none;"}">Bỏ ảnh</button>
      </div>

      <div class="form-row-2">
        <div class="field">
          <label>Từ tập</label>
          <input name="volFrom" type="number" step="0.5" value="${esc(defVol)}" />
        </div>
        <div class="field">
          <label>Đến tập (nhập nhiều tập luôn)</label>
          <input name="volTo" type="number" min="1" placeholder="1 tập thì để trống" />
        </div>
      </div>

      <div class="form-row-2">
        <div class="field">
          <label>Mục (Bản thường / ĐB...)</label>
          <input name="secName" value="${esc(defSec)}" />
        </div>
        <div class="field">
          <label>Nhà xuất bản</label>
          <select name="publisher">
            ${validPubs.map((p) => `<option value="${p}" ${defPub === p ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="field">
        <label>Danh mục</label>
        <select name="category">
          ${validCats.map((c) => `<option value="${c}" ${defCat === c ? "selected" : ""}>${c}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <div class="form-row-2">
          <div>
            <label>Giá bìa / tập (VNĐ)</label>
            <input name="coverPrice" id="qcConfCoverPrice" type="number" min="0" value="${defCoverPrice}" />
          </div>
          <div>
            <label>Thực chi / tập (VNĐ)</label>
            <input name="paidPrice" id="qcConfPaidPrice" type="number" min="0" value="${defPaid}" />
          </div>
        </div>
        <div class="ck-row" id="qcConfCkRow">
          ${CK_PRESETS.map((pct) => `<button type="button" class="ck-btn mono" data-qcck="${pct}">-${pct}%</button>`).join("")}
        </div>
      </div>

      ${
        !matchedExisting
          ? `<div class="field">
               <label>Tên khác / Từ khoá bắt tin NXB</label>
               <input name="aliases" value="${esc(info.aliases || "")}" placeholder="VD: tên tiếng Anh/Nhật..." />
             </div>`
          : ""
      }

      <div class="field">
        <label>Ghi chú</label>
        <input name="note" value="${esc(info.note || "")}" placeholder="Quà kèm, obi, bản in..." />
      </div>

      <label class="check-inline">
        <input type="checkbox" id="qcConfLegacyChk" />
        <span>Mua từ trước (không tính vào hạn mức tháng này)</span>
      </label>

      <div class="modal-actions" style="justify-content:space-between; flex-wrap:wrap;">
        <button type="button" class="btn btn-sm" id="qcSaveAndNextBtn">Lưu & Chụp tiếp</button>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-sm" id="qcRetakeBtn">Chụp lại</button>
          <button type="submit" class="btn btn-sm btn-primary">${
            matchedExisting ? "+ Thêm vào bộ này" : "Lưu vào Tủ"
          }</button>
        </div>
      </div>
    </form>`;

  openModal("Xác nhận thông tin từ bìa", html, (body) => {
    const form = body.querySelector("#qcConfirmForm");
    const coverBox = body.querySelector("#qcConfCoverBox");
    const clearBtn = body.querySelector("#qcConfClearBtn");
    const cpIn = body.querySelector("#qcConfCoverPrice");
    const ppIn = body.querySelector("#qcConfPaidPrice");
    const ckRow = body.querySelector("#qcConfCkRow");

    const syncCk = () => {
      const cp = Math.max(0, Number(cpIn.value) || 0);
      const pp = Math.max(0, Number(ppIn.value) || 0);
      ckRow.querySelectorAll(".ck-btn").forEach((b) => {
        const p = Number(b.dataset.qcck);
        b.classList.toggle("active", cp > 0 && pp === Math.round(cp * (1 - p / 100)));
      });
    };
    ckRow.querySelectorAll(".ck-btn").forEach((b) => {
      b.addEventListener("click", () => {
        const p = Number(b.dataset.qcck);
        const cp = Math.max(0, Number(cpIn.value) || 0);
        ppIn.value = Math.round(cp * (1 - p / 100));
        syncCk();
      });
    });
    cpIn.addEventListener("input", syncCk);
    ppIn.addEventListener("input", syncCk);
    syncCk();

    const cropBtn = body.querySelector("#qcConfCropBtn");
    if (cropBtn && currentFile) {
      cropBtn.addEventListener("click", async () => {
        const cropped = await openImageCropper(currentFile, {
          ratio: 2 / 3, maxW: 360, maxH: 540, quality: 0.78, title: "Cắt ảnh bìa",
        });
        if (cropped) {
          currentCoverData = cropped;
          coverBox.innerHTML = `<img src="${esc(cropped)}" alt="" />`;
          clearBtn.style.display = "";
          SFX.pop();
        }
      });
    }

    clearBtn.addEventListener("click", () => {
      currentCoverData = "";
      coverBox.innerHTML = "Chưa có";
      clearBtn.style.display = "none";
    });

    body.querySelector("#qcConfFileIn").addEventListener("change", async (e) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      currentFile = f;
      const cropped = await openImageCropper(f, {
        ratio: 2 / 3, maxW: 360, maxH: 540, quality: 0.78, title: "Cắt ảnh bìa",
      });
      if (cropped) {
        currentCoverData = cropped;
        coverBox.innerHTML = `<img src="${esc(cropped)}" alt="" />`;
        clearBtn.style.display = "";
        SFX.pop();
      }
    });

    body.querySelector("#qcRetakeBtn").addEventListener("click", () => openQuickCoverModal("single"));

    const commitSave = (snapNext) => {
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const title = fd.get("seriesTitle").trim();
      if (!title) return;
      const author = (fd.get("author") || "").trim();
      const publisher = fd.get("publisher");
      const category = fd.get("category");
      const secName = (fd.get("secName") || "Bản thường").trim();
      const volFrom = Number(fd.get("volFrom")) || 1;
      const rawTo = String(fd.get("volTo") || "").trim();
      const volTo = rawTo && Number(rawTo) > volFrom ? Math.min(volFrom + 150, Math.round(Number(rawTo))) : volFrom;
      const coverPrice = Math.max(0, Number(fd.get("coverPrice")) || 0);
      const paidPrice = Math.max(0, Number(fd.get("paidPrice")) || 0);
      const note = (fd.get("note") || "").trim();
      const aliases = (fd.get("aliases") || "").trim();
      const isLegacy = Boolean(body.querySelector("#qcConfLegacyChk")?.checked);
      const disc = coverPrice > 0 ? Math.max(0, Math.min(100, Math.round((1 - paidPrice / coverPrice) * 100))) : 0;

      const volCount = volTo > volFrom ? volTo - Math.round(volFrom) + 1 : 1;
      pushUndo(`tạo nhanh "${title}" (${volCount} tập)`);

      let targetSeries = matchedExisting;
      if (!targetSeries) {
        targetSeries = {
          id: uid(),
          title,
          author,
          publisher,
          category,
          status: "Đang theo",
          aliases,
          note: "",
          cover: currentCoverData,
          createdAt: todayISO(),
          sections: [],
        };
        state.series.unshift(targetSeries);
      } else {
        if (author && !targetSeries.author) targetSeries.author = author;
        if (currentCoverData && !targetSeries.cover) targetSeries.cover = currentCoverData;
      }

      const existingSecSel = body.querySelector("#qcExistingSecSel");
      const pickedSecId = existingSecSel ? existingSecSel.value : "__new__";
      targetSeries.sections = targetSeries.sections || [];
      let sec =
        pickedSecId !== "__new__"
          ? targetSeries.sections.find((x) => x.id === pickedSecId)
          : targetSeries.sections.find((x) => normVN(x.name) === normVN(secName));
      if (!sec) {
        sec = { id: uid(), name: secName, image: "", note: "", volumes: [] };
        targetSeries.sections.push(sec);
      }
      sec.volumes = sec.volumes || [];

      if (volTo > volFrom) {
        const added = addBatchVolumesToSection(sec, {
          from: Math.round(volFrom),
          to: volTo,
          priceMode: "unit",
          coverInput: coverPrice,
          paidInput: 0,
          discount: disc,
          date: todayISO(),
          isLegacy,
          image: "",
          note,
        });
        // Gắn ảnh bìa chụp cho tập đầu tiên trong loạt
        const firstAdded = sec.volumes[sec.volumes.length - added];
        if (firstAdded && currentCoverData) firstAdded.image = currentCoverData;
      } else {
        sec.volumes.push({
          id: uid(),
          number: volFrom,
          coverPrice,
          paidPrice,
          date: todayISO(),
          isLegacy,
          image: currentCoverData,
          readState: "Chưa đọc",
          lentTo: "",
          note,
          groupId: "",
          groupLabel: "",
        });
      }

      state.lastEntry = {
        publisher,
        category,
        sectionName: secName,
        coverPrice,
        discount: coverPrice > 0 ? disc : last.discount,
      };

      saveState();
      renderBooks();
      renderNews();
      renderSpending();
      SFX.success();
      spawnCelebration(undefined, undefined, 16);

      if (snapNext) {
        showToast(`Đã lưu "${title}" (${volCount} tập) — chụp tiếp!`, { undoable: true });
        openQuickCoverModal("single");
      } else {
        openSeriesDetail(targetSeries.id);
        notifyCapooEvent("added");
        showToast(`Đã lưu "${title}" (${volCount} tập).`, { undoable: true });
      }
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      commitSave(false);
    });

    body.querySelector("#qcSaveAndNextBtn").addEventListener("click", () => commitSave(true));
  });
}
