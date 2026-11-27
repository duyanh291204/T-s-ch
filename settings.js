"use strict";

// ============================
// SETTINGS & BACKUP
// ============================
function openSettingsModal() {
  const html = `
    <div class="form-grid">
      <div class="field">
        <label>Bảng màu giấy (giao diện)</label>
        <div class="cat-color-row" id="themePickerRow" style="margin-top:4px; grid-template-columns:repeat(3, minmax(0, 1fr));">
          ${THEME_LIST.map((t) => `
            <button type="button" class="cat-color-btn ${state.theme === t.id ? "active" : ""}" data-themeid="${t.id}">
              <span class="cat-swatch-dot" style="background:${t.bg}; border-color:${t.ink};"></span>
              <span>${t.label}</span>
            </button>`).join("")}
        </div>
      </div>

      <div class="field">
        <label>Hiệu ứng & Chuyển động</label>
        <div class="scope-switch" id="fxLevelSwitch" style="margin-bottom:0;">
          <button type="button" class="${isRichFx() ? "active" : ""}" data-fxval="rich">Phong phú (mượt)</button>
          <button type="button" class="${!isRichFx() ? "active" : ""}" data-fxval="minimal">Gọn nhẹ (tắt bớt)</button>
        </div>
      </div>

      <div class="field">
        <label>Âm thanh ứng dụng</label>
        <div class="scope-switch" id="soundSwitch" style="margin-bottom:0;">
          <button type="button" class="${isSoundOn() ? "active" : ""}" data-sndval="on">Bật âm thanh</button>
          <button type="button" class="${!isSoundOn() ? "active" : ""}" data-sndval="off">Tắt (im lặng)</button>
        </div>
      </div>

      <div class="field">
        <label>Mèo béo Capoo (trên thanh Tất cả / Truyện / Sách)</label>
        <div class="scope-switch" id="catEnableSwitch" style="margin-bottom:0;">
          <button type="button" class="${state.catEnabled !== false ? "active" : ""}" data-caten="on">Hiện mèo béo</button>
          <button type="button" class="${state.catEnabled === false ? "active" : ""}" data-caten="off">Ẩn tạm</button>
        </div>
        <div class="cat-color-row" id="catColorRow">
          ${CAT_COLOR_LIST.map((c) => {
            const cur = getCapooColorKey();
            return `
              <button type="button" class="cat-color-btn ${cur === c.id ? "active" : ""}" data-catcolor="${c.id}">
                <span class="cat-swatch-dot" style="background:${c.body}; border-color:${c.ink};"></span>
                <span>${c.label}</span>
              </button>`;
          }).join("")}
        </div>
      </div>

      <div class="divider"></div>
      <div class="field">
        <label>Gemini API Key (miễn phí — dùng cho Tạo bìa & Quét tin 4 NXB)</label>
        <input id="setGeminiKey" type="password" autocomplete="off" value="${esc(state.geminiApiKey || "")}" placeholder="AIzaSy..." />
        <div class="small-muted" style="margin-top:4px;">
          Lấy miễn phí tại <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;">aistudio.google.com/apikey</a>. Key chỉ lưu trên máy bạn để AI đọc ảnh bìa sách.
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn btn-sm btn-primary" id="saveGeminiKeyBtn">Lưu Key</button>
        <button type="button" class="btn btn-sm" id="testGeminiKeyBtn">Kiểm tra Key</button>
        <button type="button" class="btn btn-sm" id="toggleGeminiKeyBtn">Hiện Key</button>
      </div>

      <div class="divider"></div>
      <div class="panel-title">Bộ nhớ & Sao lưu iPhone</div>
      <div class="boxset-hint mono" id="storageHealthBox">Đang kiểm tra dung lượng...</div>
      <div class="small-muted">Dữ liệu đã được lưu trên <strong>IndexedDB</strong> (dung lượng lớn, chống tràn 5MB của Safari) và tự chống trùng lặp ảnh. Nên xuất 1 file sao lưu vào iCloud Drive mỗi tháng.</div>
      <div class="small-muted mono" id="lastBackupMeta"></div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <button class="btn btn-sm btn-primary" id="exportJsonBtn">Lưu iCloud / Xuất .json</button>
        <button class="btn btn-sm" id="importJsonBtn">Nhập file sao lưu (.json)</button>
        <button class="btn btn-sm" id="recoverShadowBtn">Khôi phục bản chữ khẩn cấp</button>
      </div>

      <div class="divider"></div>
      <div class="panel-title">Thử nhanh & Dọn dẹp</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <button class="btn btn-sm" id="loadSampleBtn">Nạp 3 bộ mẫu test</button>
        ${undoStack.length ? `<button class="btn btn-sm" id="settingsUndoBtn">Hoàn tác bước gần nhất (${undoStack.length})</button>` : ""}
        <button class="btn btn-sm btn-danger" id="wipeAllBtn">Xoá toàn bộ dữ liệu</button>
      </div>
    </div>`;

  openModal("Cài đặt & Sao lưu", html, (body) => {
    const themePickerRow = body.querySelector("#themePickerRow");
    if (themePickerRow) {
      themePickerRow.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-themeid]");
        if (!btn) return;
        const info = getThemeInfo(btn.dataset.themeid);
        state.theme = info.id;
        SFX.lamp(info.dark);
        triggerThemeWash(btn, info.dark);
        applyTheme();
        saveState();
        themePickerRow.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        showToast(`Đã đổi bảng màu: ${info.label}`);
      });
    }

    const fxSwitch = body.querySelector("#fxLevelSwitch");
    if (fxSwitch) {
      fxSwitch.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-fxval]");
        if (!btn) return;
        state.fxLevel = btn.dataset.fxval;
        applyFxLevel();
        saveState();
        fxSwitch.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        if (state.fxLevel === "rich") spawnCelebrationFromEl(btn, 12);
        showToast(state.fxLevel === "rich" ? "Đã bật hiệu ứng phong phú." : "Đã chuyển sang chế độ gọn nhẹ.");
      });
    }

    const sndSwitch = body.querySelector("#soundSwitch");
    if (sndSwitch) {
      sndSwitch.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-sndval]");
        if (!btn) return;
        state.soundEnabled = btn.dataset.sndval === "on";
        applySoundUI();
        saveState();
        sndSwitch.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        if (state.soundEnabled) SFX.pop();
        showToast(state.soundEnabled ? "Đã bật âm thanh ứng dụng." : "Đã tắt âm thanh.");
      });
    }

    const catEnSw = body.querySelector("#catEnableSwitch");
    if (catEnSw) {
      catEnSw.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-caten]");
        if (!btn) return;
        state.catEnabled = btn.dataset.caten === "on";
        saveState();
        applyCatVisibility();
        catEnSw.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        if (state.catEnabled) SFX.catWake();
        showToast(state.catEnabled ? "Boss mèo đã lên sân!" : "Đã tạm ẩn mèo béo.");
      });
    }
    const catColorRow = body.querySelector("#catColorRow");
    if (catColorRow) {
      catColorRow.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-catcolor]");
        if (!btn) return;
        const colId = btn.dataset.catcolor;
        state.catCoat = colId;
        state.catEnabled = true;
        saveState();
        applyCatVisibility();
        catColorRow.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        if (catEnSw) {
          catEnSw.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.caten === "on"));
        }
        triggerCapooExpression("love", 1.5);
        SFX.catWake();
        const info = CAT_COLORS[colId];
        showToast(`Đã đổi màu mèo: ${info ? info.label : colId}!`);
      });
    }

    const keyIn = body.querySelector("#setGeminiKey");
    body.querySelector("#toggleGeminiKeyBtn").addEventListener("click", (e) => {
      const isHidden = keyIn.type === "password";
      keyIn.type = isHidden ? "text" : "password";
      e.currentTarget.textContent = isHidden ? "Ẩn Key" : "Hiện Key";
    });

    body.querySelector("#saveGeminiKeyBtn").addEventListener("click", () => {
      const val = keyIn.value.trim();
      state.geminiApiKey = val;
      state.geminiModel = "";
      saveState();
      SFX.success();
      showToast(val ? "Đã lưu Gemini API Key." : "Đã xoá Gemini API Key.");
    });

    body.querySelector("#testGeminiKeyBtn").addEventListener("click", async () => {
      const val = keyIn.value.trim();
      if (!val) {
        SFX.error();
        showToast("Hãy dán Gemini API Key trước nhé.");
        return;
      }
      showToast("Đang kiểm tra API Key...");
      try {
        const res = await testGeminiApiKey(val);
        state.geminiApiKey = val;
        saveState();
        SFX.success();
        showToast(`Key hoạt động ngon lành (${res.model})! Đã tự lưu.`);
      } catch (err) {
        SFX.error();
        showToast(`Lỗi Key: ${err?.message || "Không hợp lệ"}`);
      }
    });
              const healthEl = body.querySelector("#storageHealthBox");
    if (healthEl) {
      const bytes = estimateStateBytes(state);
      const mb = (bytes / (1024 * 1024)).toFixed(2);
      const imgCount = Object.keys(state.images || {}).length;
      healthEl.textContent = `Kho lưu: ${storageEngine} · Đang dùng ${mb} MB (${imgCount} ảnh riêng biệt)`;
    }
    const setUndoBtn = body.querySelector("#settingsUndoBtn");
    if (setUndoBtn) {
      setUndoBtn.addEventListener("click", () => performUndo());
    }

    const lastBkEl = body.querySelector("#lastBackupMeta");
    if (lastBkEl) {
      lastBkEl.textContent = state.lastBackupAt
        ? `Lần sao lưu gần nhất: ${state.lastBackupAt}`
        : "Chưa xuất file sao lưu lần nào.";
    }

    body.querySelector("#exportJsonBtn").addEventListener("click", async () => {
      const fileName = `tusach-backup-${todayISO()}.json`;
      const jsonText = JSON.stringify(state, null, 2);
      const blob = new Blob([jsonText], { type: "application/json" });

      state.lastBackupAt = new Date().toLocaleString("vi-VN", { hour12: false });
      saveState();
      if (lastBkEl) lastBkEl.textContent = `Lần sao lưu gần nhất: ${state.lastBackupAt}`;

      // Ưu tiên bảng Chia sẻ gốc trên iPhone để lưu thẳng vào iCloud Drive / Tệp
      try {
        const file = new File([blob], fileName, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: "Sao lưu Tủ Sách", files: [file] });
          showToast("Đã mở bảng chia sẻ lưu file.");
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }

      // Fallback tải file chuẩn (trì hoãn revokeObjectURL 15s để Safari iOS không cắt mất file)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      showToast("Đã xuất file sao lưu .json.");
    });

    body.querySelector("#recoverShadowBtn").addEventListener("click", () => {
      const sh = readTextOnlyShadow();
      if (!sh || !Array.isArray(sh.series) || !sh.series.length) {
        showToast("Chưa có bản dự phòng khẩn cấp nào trên máy.");
        return;
      }
      const shCount = sh.series.length;
      const shVols = sh.series.reduce((acc, x) => acc + getAllSeriesVolumes(x).length, 0);
      if (!confirm(`Tìm thấy bản dự phòng chữ (${shCount} bộ · ${shVols} tập, không gồm ảnh). Khôi phục bản này?`)) {
        return;
      }
      state = migrateStateData(sh);
      saveState();
      renderAll();
      closeModal();
      showToast("Đã khôi phục bản dự phòng khẩn cấp.");
    });
    body.querySelector("#importJsonBtn").addEventListener("click", () => {
      document.getElementById("importFileInput").click();
    });
    body.querySelector("#loadSampleBtn").addEventListener("click", () => {
      if (state.series.length && !confirm("Thêm 3 bộ mẫu vào tủ hiện tại?")) return;
      const d = todayISO();
      state.series.push(
        {
          id: uid(),
          title: "Dungeon Meshi — Mỹ Vị Hầm Ngục",
          publisher: "Kim Đồng",
          category: "Manga",
          status: "Đã full",
          aliases: "Dungeon Meshi, Mỹ Vị Hầm Ngục",
          note: "Bản in có áo bọc",
          cover: "",
          createdAt: d,
          sections: [
            {
              id: uid(),
              name: "Manga — Bản thường",
              note: "",
              volumes: [1, 2, 3].map((n) => ({
                id: uid(),
                number: n,
                coverPrice: 40000,
                paidPrice: 34000,
                date: d,
                image: "",
                note: "",
              })),
            },
            {
              id: uid(),
              name: "Limited",
              note: "Bản đặc biệt kèm postcard",
              volumes: [
                { id: uid(), number: 4, coverPrice: 75000, paidPrice: 75000, date: d, image: "", note: "Kèm postcard" },
              ],
            },
          ],
        },
        {
          id: uid(),
          title: "JoJo's Bizarre Adventure — Phần 1",
          publisher: "Kim Đồng",
          category: "Manga",
          status: "Đang theo",
          aliases: "JoJo, Phantom Blood",
          note: "Bìa cứng",
          cover: "",
          createdAt: d,
          sections: [
            {
              id: uid(),
              name: "Boxset",
              note: "Hộp cứng 3 tập",
              volumes: [1, 2, 3].map((n) => ({
                id: uid(),
                number: n,
                coverPrice: 120000,
                paidPrice: 102000,
                date: d,
                image: "",
                note: "Boxset tập 1–3",
              })),
            },
          ],
        },
        {
          id: uid(),
          title: "Rừng Na Uy",
          publisher: "Nhã Nam",
          category: "Sách",
          status: "Đã full",
          aliases: "Norwegian Wood",
          note: "",
          cover: "",
          createdAt: d,
          sections: [
            {
              id: uid(),
              name: "Tái bản",
              note: "Bìa mới",
              volumes: [
                { id: uid(), number: 1, coverPrice: 149000, paidPrice: 118000, date: d, image: "", note: "Kèm bookmark" },
              ],
            },
          ],
        }
      );
      state.giftGroups.push({
        id: uid(),
        title: "Dungeon Meshi — Mỹ Vị Hầm Ngục",
        publisher: "Kim Đồng",
        cover: "",
        note: "Săn tại Fes & kèm bản ĐB",
        createdAt: d,
        gifts: [
          {
            id: uid(),
            name: "Standee Acrylic Marcille",
            quantity: 1,
            price: 95000,
            source: "Săn tại Fes",
            status: "Đã có",
            date: d,
            image: "",
            note: "Mua tại booth Kim Đồng",
          },
          {
            id: uid(),
            name: "Bộ Postcard bản ĐB tập 4",
            quantity: 2,
            price: 0,
            source: "Kèm bản ĐB",
            status: "Đã có",
            date: d,
            image: "",
            note: "Kèm sách",
          },
        ],
      });
      saveState();
      renderAll();
      closeModal();
      showToast("Đã nạp 3 bộ mẫu + bộ quà mẫu.");
    });
    body.querySelector("#wipeAllBtn").addEventListener("click", () => {
      if (!confirm("Xoá sạch toàn bộ sách, quà và mục đã ghim?")) return;
      pushUndo("xoá toàn bộ tủ sách");
      state = structuredClone(DEFAULT_STATE);
      saveState();
      applyTheme();
      renderAll();
      closeModal();
      showToast("Đã đặt lại sạch sẽ.", { undoable: true });
    });
  });
}

document.getElementById("importFileInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.series)) throw new Error("Sai định dạng");
      pushUndo("nhập file sao lưu");
      state = migrateStateData(parsed);
      saveState();
      applyTheme();
      renderAll();
      closeModal();
      showToast("Đã khôi phục dữ liệu thành công.");
    } catch {
      showToast("File sao lưu không hợp lệ.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});
