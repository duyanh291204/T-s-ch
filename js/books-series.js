"use strict";

// ============================
// TAB 1: TỦ SÁCH (Đầu sách -> Các mục -> Tập + Ảnh + Giá)
// ============================
function renderBooks() {
  const container = document.getElementById("booksContainer");
  const q = normVN(filters.bookSearch);

  // Đếm riêng Truyện vs Sách trên thanh switch trên cùng
  const allCount = state.series.length;
  const sachCount = state.series.filter((s) => isBookItem(s)).length;
  const truyenCount = allCount - sachCount;
  const elAll = document.getElementById("cntAllBooks");
  const elTr = document.getElementById("cntTruyen");
  const elSa = document.getElementById("cntSach");
  if (elAll) elAll.textContent = `(${allCount})`;
  if (elTr) elTr.textContent = `(${truyenCount})`;
  if (elSa) elSa.textContent = `(${sachCount})`;

  // Ẩn thanh lọc loại phụ khi đang xem riêng Sách chữ
  const catRow = document.getElementById("bookCatChips");
  if (catRow) {
    catRow.style.display = filters.bookGroup === "sach" ? "none" : "flex";
    const sachChip = catRow.querySelector('[data-cat="Sách"]');
    if (sachChip) sachChip.style.display = filters.bookGroup === "truyen" ? "none" : "";
  }

  let list = state.series.filter((s) => {
    if (filters.bookGroup === "truyen" && isBookItem(s)) return false;
    if (filters.bookGroup === "sach" && !isBookItem(s)) return false;
    if (filters.bookGroup !== "sach" && filters.bookCat !== "Tất cả" && s.category !== filters.bookCat) {
      return false;
    }
    if (filters.bookPub !== "Tất cả") {
      const known = ["Trẻ", "Kim Đồng", "IPM", "Nhã Nam"];
      if (filters.bookPub === "Khác") {
        if (known.includes(s.publisher)) return false;
      } else if (s.publisher !== filters.bookPub) {
        return false;
      }
    }
    if (q) {
      const secNames = (s.sections || []).map((sec) => sec.name).join(" ");
      const hay = normVN(`${s.title} ${s.author || ""} ${s.publisher} ${s.category} ${s.aliases || ""} ${secNames} ${s.note || ""}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sắp xếp danh sách
  if (filters.bookSort === "name") {
    list = [...list].sort((a, b) => (a.title || "").localeCompare(b.title || "", "vi"));
  } else if (filters.bookSort === "vols") {
    list = [...list].sort((a, b) => getAllSeriesVolumes(b).length - getAllSeriesVolumes(a).length);
  } else if (filters.bookSort === "spent") {
    const sumS = (x) => getAllSeriesVolumes(x).reduce((acc, v) => acc + (Number(v.paidPrice) || 0), 0);
    list = [...list].sort((a, b) => sumS(b) - sumS(a));
  }

  const totalVols = list.reduce((a, s) => a + getAllSeriesVolumes(s).length, 0);
  const unitLabel = filters.bookGroup === "truyen" ? "bộ truyện" : filters.bookGroup === "sach" ? "đầu sách" : "bộ";
  document.getElementById("bookCountLabel").textContent = `${list.length} ${unitLabel} · ${totalVols} tập`;

  if (!list.length) {
    const emptyHeading =
      filters.bookGroup === "truyen"
        ? "Chưa có bộ truyện nào"
        : filters.bookGroup === "sach"
        ? "Chưa có đầu sách chữ nào"
        : state.series.length
        ? "Không tìm thấy kết quả khớp bộ lọc"
        : "Tủ sách đang trống";
    container.innerHTML = `
      <div class="empty">
        <div class="empty-title">${emptyHeading}</div>
        <div class="empty-desc">${
          state.series.length
            ? "Bấm + Thêm bộ để bổ sung hoặc chuyển tab Truyện / Sách phía trên."
            : "Bấm + Thêm bộ để tạo đầu truyện hoặc sách, sau đó tạo các mục (bản thường, boxset, limit, tái bản...) bên trong."
        }</div>
        <button class="btn btn-primary" id="emptyAddBookBtn">+ Thêm ${filters.bookGroup === "sach" ? "sách" : "bộ truyện"}</button>
      </div>`;
    const btn = document.getElementById("emptyAddBookBtn");
    if (btn) btn.addEventListener("click", () => openSeriesForm());
    return;
  }

  if (state.bookView === "grid") {
    container.innerHTML = `<div class="book-grid">${list
      .map((s, idx) => {
        const vols = getAllSeriesVolumes(s);
        const secCount = (s.sections || []).length;
        const spent = vols.reduce((a, v) => a + (Number(v.paidPrice) || 0), 0);
        const coverSrc = resolveImg(s.cover);
        const holo = isSpecialSeries(s);
        const isFull = isSeriesFull(s);
        const totV = Math.round(Number(s.totalVolumes) || 0);
        const progPct = totV > 0 ? Math.min(100, Math.round((vols.length / totV) * 100)) : 0;
        const badgeTxt = totV > 0 ? `${vols.length}/${totV}` : `${vols.length} tập`;
        const coverHtml = coverSrc
          ? `<img src="${esc(coverSrc)}" alt="${esc(s.title)}" loading="lazy" referrerpolicy="no-referrer" />`
          : `<div class="typo-cover" style="border-left-color:${pubColorVar(s.publisher)}">
               <div class="typo-pub mono">${esc(s.publisher)}</div>
               <div class="typo-title">${esc(s.title)}</div>
               <div class="typo-cat mono">${esc(s.category)}</div>
             </div>`;
        return `
          <article class="book-card fx-card-in" style="--stagger:${idx}" data-id="${s.id}">
            <div class="book-cover ${holo ? "is-holo" : ""}">
              ${coverHtml}
              ${isFull ? `<span class="hanko-full">FULL</span>` : ""}
              ${holo ? `<span class="holo-pill mono">ĐB</span>` : ""}
              <span class="cover-badge mono">${badgeTxt}</span>
              ${totV > 0 ? `<div class="book-prog-bar"><div class="book-prog-fill ${isFull ? "is-done" : ""}" style="width:${progPct}%"></div></div>` : ""}
            </div>
            <div class="book-info">
              <div class="book-name">${esc(s.title)}</div>
              <div class="book-meta">
                <span>${secCount ? `${secCount} mục` : esc(s.publisher)}</span>
                <span class="mono">${fmtMoney(spent)}</span>
              </div>
            </div>
          </article>`;
      })
      .join("")}</div>`;
  } else if (state.bookView === "shelf") {
    const perShelf = window.innerWidth >= 720 ? 10 : 6;
    const rows = [];
    for (let i = 0; i < list.length; i += perShelf) {
      rows.push(list.slice(i, i + perShelf));
    }
    container.innerHTML = `<div class="shelf-wrap">${rows
      .map((rowItems, rIdx) => {
        const rowVolTotal = rowItems.reduce((a, s) => a + getAllSeriesVolumes(s).length, 0);
        return `
          <div class="shelf-unit">
            <div class="shelf-bay-meta mono">
              <span>Kệ ${rIdx + 1}</span>
              <span>${rowItems.length} bộ · ${rowVolTotal} tập</span>
            </div>
            <div class="shelf-row">
              ${rowItems
                .map((s, idx) => {
                  const vols = getAllSeriesVolumes(s);
                  const vCount = vols.length;
                  const holo = isSpecialSeries(s);
                  const coverSrc = resolveImg(s.cover);
                  // Số lát sách xếp phía sau thể hiện độ dày thật của bộ (1-4: 0 lát, 5-14: 1 lát, 15-29: 2 lát, 30+: 3 lát)
                  const sliceCount = vCount >= 30 ? 3 : vCount >= 15 ? 2 : vCount >= 5 ? 1 : 0;
                  const baseH =
                    s.category === "Artbook" ? 190 : s.category === "Sách" ? 182 : s.category === "Light Novel" ? 176 : 170;
                  const jitter = ((s.title || "").length * 5 + idx * 3) % 9 - 4;
                  const heightPx = baseH + jitter;
                  const titleBoxH = Math.max(46, heightPx - 18 - (coverSrc ? 41 : 0) - 10 - 24);
                  const pubShort =
                    s.publisher === "Kim Đồng" ? "KĐ" : s.publisher === "Nhã Nam" ? "NN" : s.publisher.slice(0, 3);
                  const pal = rgbToSpinePalette(pubFallbackRGB(s.publisher));
                  const slicesHtml = sliceCount
                    ? `<span class="shelf-stack-slices">${Array.from(
                        { length: sliceCount },
                        (_, k) => `<span class="shelf-slice" style="height:${heightPx - 3 - k * 2}px; opacity:${(0.88 - k * 0.14).toFixed(2)};"></span>`
                      ).join("")}</span>`
                    : "";
                  return `
                    <button type="button" class="shelf-book-group fx-card-in" style="--stagger:${rIdx * perShelf + idx}; --sp-bg:${pal.bg}; --sp-slice:${pal.slice}; --sp-accent:${pal.accent};" data-shelf-id="${s.id}" title="${esc(s.title)} (${vCount} tập)">
                      <span class="shelf-spine-main ${holo ? "sp-gold" : ""}" style="height:${heightPx}px;">
                        <span class="sp-top-cap mono">${esc(pubShort)}${holo ? '<span class="sp-gold-dot">✦</span>' : ""}</span>
                        ${coverSrc ? `<span class="sp-thumb-win"><img src="${esc(coverSrc)}" alt="" loading="lazy" /></span>` : ""}
                        <span class="sp-title-vert" style="height:${titleBoxH}px; max-height:${titleBoxH}px;"><span style="height:${titleBoxH}px; max-height:${titleBoxH}px;">${esc(s.title)}</span></span>
                        <span class="sp-vol-box mono">${vCount}</span>
                      </span>
                      ${slicesHtml}
                    </button>`;
                })
                .join("")}
            </div>
            <div class="shelf-plank"></div>
          </div>`;
      })
      .join("")}</div>`;

    // Nhuộm màu gáy từ ảnh bìa thật (giữ màu trong trẻo, không xỉn)
    container.querySelectorAll("[data-shelf-id]").forEach((el) => {
      const s = list.find((x) => x.id === el.dataset.shelfId);
      if (!s) return;
      const cSrc = resolveImg(s.cover);
      if (cSrc) {
        extractDominantColor(cSrc, s.publisher).then((rgb) => {
          if (!el.isConnected) return;
          const pal = rgbToSpinePalette(rgb);
          el.style.setProperty("--sp-bg", pal.bg);
          el.style.setProperty("--sp-slice", pal.slice);
          el.style.setProperty("--sp-accent", pal.accent);
        });
      }
      el.addEventListener("click", () => {
        SFX.shelfPull();
        el.classList.add("pulled");
        setTimeout(() => {
          el.classList.remove("pulled");
          openSeriesDetail(s.id);
        }, 160);
      });
    });
    return;
  } else {
    container.innerHTML = `<div class="book-list">${list
      .map((s, idx) => {
        const vols = getAllSeriesVolumes(s);
        const secCount = (s.sections || []).length;
        const spent = vols.reduce((a, v) => a + (Number(v.paidPrice) || 0), 0);
        return `
          <div class="book-row fx-card-in" style="--stagger:${idx}" data-id="${s.id}">
            <div class="row-thumb" style="border-left:2px solid ${pubColorVar(s.publisher)}">
              ${resolveImg(s.cover) ? `<img src="${esc(resolveImg(s.cover))}" alt="" referrerpolicy="no-referrer" />` : `<span class="mono">${esc(s.publisher.slice(0, 3))}</span>`}
            </div>
            <div style="min-width:0;">
              <div style="font-weight:600; display:flex; align-items:center; gap:5px; min-width:0;"><span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(s.title)}</span>${isSeriesFull(s) ? `<span class="hanko-inline">FULL</span>` : ""}</div>
              <div class="small-muted" style="margin-top:2px;">${esc(s.publisher)} · ${esc(s.category)} · ${secCount} mục · ${esc(s.status || "Đang theo")}</div>
            </div>
            <div style="text-align:right;">
              <div class="mono" style="font-size:12.5px; font-weight:600;">${vols.length} tập</div>
              <div class="mono small-muted">${fmtMoney(spent)}</div>
            </div>
          </div>`;
      })
      .join("")}</div>`;
  }

  container.querySelectorAll("[data-id]").forEach((el) => {
    el.addEventListener("click", () => { SFX.openBook(); openSeriesDetail(el.dataset.id); });
  });
}

// Helper đọc từng dòng khi Nhập nhanh nhiều bộ từ danh sách
// Hỗ trợ linh hoạt:
//   "Chainsaw Man"
//   "Chainsaw Man - 16 tập" / "Chainsaw Man (1-16)"
//   "Chainsaw Man | 1-16 | 45000"
//   "Chainsaw Man | Kim Đồng | 1-16 | 45000 | 15"
function parseBatchSeriesLines(rawText, defaults) {
  const lines = (rawText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pubMap = {
    tre: "Trẻ",
    "nxb tre": "Trẻ",
    kim: "Kim Đồng",
    "kim dong": "Kim Đồng",
    "nxb kim dong": "Kim Đồng",
    ipm: "IPM",
    "nha nam": "Nhã Nam",
    nn: "Nhã Nam",
  };
  const parsePub = (str) => {
    const k = normVN(str);
    return pubMap[k] || null;
  };
  const parseRange = (str) => {
    const s = (str || "").trim();
    let m = s.match(/^(\d+)\s*[-–~]\s*(\d+)$/);
    if (m) return { from: Math.max(1, Number(m[1])), to: Math.max(1, Number(m[2])) };
    m = s.match(/^(\d+)\s*(?:tập|tap|q|quyển|quyen|vol)?$/i);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 300) {
      return { from: 1, to: Number(m[1]) };
    }
    return null;
  };

  const parsed = [];
  for (const line of lines) {
    let title = line;
    let publisher = defaults.publisher;
    let from = defaults.defaultFrom;
    let to = defaults.defaultTo;
    let coverPrice = defaults.coverPrice;
    let discount = defaults.discount;

    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      title = parts[0] || "";
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        const maybePub = parsePub(p);
        if (maybePub) {
          publisher = maybePub;
          continue;
        }
        if (/^\d{1,2}\s*%$/.test(p)) {
          discount = Math.min(100, Math.max(0, Number(p.replace("%", "").trim())));
          continue;
        }
        const rng = parseRange(p);
        if (rng && (p.includes("-") || p.includes("–") || /tập|tap|q|vol/i.test(p) || Number(p) <= 300)) {
          if (Number(p) <= 300 && i >= 3 && from && to) {
            // Nếu đã có range trước đó và số nhỏ <= 100 ở cuối -> hiểu là % chiết khấu
            if (Number(p) <= 100) {
              discount = Number(p);
              continue;
            }
          }
          from = rng.from;
          to = Math.max(rng.from, rng.to);
          continue;
        }
        const digits = Number(p.replace(/[^\d]/g, ""));
        if (digits >= 1000) {
          coverPrice = digits;
        } else if (digits > 0 && digits <= 100 && p.match(/^\d+$/)) {
          discount = digits;
        }
      }
    } else {
      // Cú pháp tự nhiên không cần dấu |:
      // "Chainsaw Man (1-16)", "Chainsaw Man - 16 tập", "Chainsaw Man 1-16"
      let m = line.match(/^(.*?)\s*[\(\[]\s*(\d+)\s*[-–~]\s*(\d+)\s*[\)\]]\s*$/);
      if (m) {
        title = m[1].trim();
        from = Math.max(1, Number(m[2]));
        to = Math.max(from, Number(m[3]));
      } else {
        m = line.match(/^(.*?)\s*[-–:,]?\s*(\d+)\s*[-–~]\s*(\d+)\s*(?:tập|tap|vol)?$/i);
        if (m && m[1].trim().length >= 2) {
          title = m[1].trim();
          from = Math.max(1, Number(m[2]));
          to = Math.max(from, Number(m[3]));
        } else {
          m = line.match(/^(.*?)\s*[-–:,(\s]+(\d+)\s*(?:tập|tap|quyển|quyen)\)?$/i);
          if (m && m[1].trim().length >= 2) {
            title = m[1].trim();
            from = 1;
            to = Math.max(1, Number(m[2]));
          }
        }
      }
    }

    if (!title) continue;
    const volCount = from && to && to >= from ? Math.min(150, to - from + 1) : 0;
    const paidPerVol = Math.round(coverPrice * (1 - discount / 100));
    parsed.push({
      title,
      publisher,
      from: volCount ? from : 0,
      to: volCount ? from + volCount - 1 : 0,
      volCount,
      coverPrice,
      discount,
      paidPerVol,
      totalPaid: paidPerVol * volCount,
    });
  }
  return parsed;
}

function openSeriesForm(existingId = null, initialMode = "single") {
  const s = existingId ? state.series.find((x) => x.id === existingId) : null;
  let currentCover = resolveImg(s?.cover || "");
  const last = { ...DEFAULT_STATE.lastEntry, ...(state.lastEntry || {}) };
  const defCat = s ? s.category : filters.bookGroup === "sach" ? "Sách" : last.category || "Manga";
  const defPub = s ? s.publisher : last.publisher || "Kim Đồng";
  const defSecName = defCat === "Sách" ? "Sách chữ" : last.sectionName || "Bản thường";
  const isCreate = !s;

  const modeSwitchHtml = isCreate
    ? `<div class="scope-switch" id="addSeriesModeSwitch" style="margin-bottom:12px;">
         <button type="button" class="${initialMode === "single" ? "active" : ""}" data-smode="single">Nhập 1 bộ (đủ tập)</button>
         <button type="button" class="${initialMode === "batch" ? "active" : ""}" data-smode="batch">Nhập nhiều bộ nhanh</button>
       </div>`
    : "";

  const quickVolBlockHtml = isCreate
    ? `<div class="quick-box">
         <div class="quick-box-head">
           <span class="quick-box-title">Nhập luôn Mục & Tập (tuỳ chọn)</span>
           <label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; margin:0; cursor:pointer;">
             <input type="checkbox" id="quickVolEnable" checked style="width:15px; height:15px;" />
             <span>Thêm tập ngay</span>
           </label>
         </div>
         <div id="quickVolFields" class="form-grid" style="gap:9px;">
           <div class="field">
             <label>Tên mục</label>
             <input name="quickSecName" id="quickSecNameInput" value="${esc(defSecName)}" placeholder="VD: Bản thường, Boxset, Limited..." />
             <div class="preset-chips" id="quickSecPresets">
               ${["Bản thường", "Boxset", "Limited", "Tái bản", "Bìa cứng"]
                 .map((p) => `<button type="button" class="preset-chip" data-qsec="${esc(p)}">${esc(p)}</button>`)
                 .join("")}
             </div>
           </div>
           <div class="form-row-2">
             <div class="field">
               <label>Từ tập</label>
               <input name="quickFrom" id="quickFromIn" type="number" min="1" value="1" />
             </div>
             <div class="field">
               <label>Đến tập</label>
               <input name="quickTo" id="quickToIn" type="number" min="1" value="1" />
             </div>
           </div>
           <div class="form-row-2">
             <div class="field">
               <label id="quickCoverPriceLabel">Giá bìa / tập (VNĐ)</label>
               <input name="quickCoverPrice" id="quickCoverPriceIn" type="number" min="0" value="${last.coverPrice ?? 35000}" />
             </div>
             <div class="field">
               <label>Chiết khấu (%)</label>
               <input name="quickDiscount" id="quickDiscountIn" type="number" min="0" max="100" value="${last.discount ?? 15}" />
             </div>
           </div>
           <div class="ck-row" id="quickCkRow">
             ${CK_PRESETS.map((pct) => `<button type="button" class="ck-btn mono" data-sck="${pct}">-${pct}%</button>`).join("")}
           </div>
           <label class="check-inline">
             <input type="checkbox" id="quickLegacyChk" />
             <span>Mua từ trước (không tính vào hạn mức tháng này)</span>
           </label>
           <div class="small-muted mono" id="quickVolSummary"></div>
         </div>
       </div>`
    : "";

  const singleFormHtml = `
    <form id="seriesForm" class="form-grid" style="${initialMode === "batch" && isCreate ? "display:none;" : ""}">
      <div class="field">
        <label>Tên bộ truyện / Đầu sách *</label>
        <input name="title" id="seriesTitleInput" required value="${esc(s?.title || "")}" placeholder="VD: Dungeon Meshi, Chainsaw Man, Rừng Na Uy..." />
      </div>
      <div class="field">
        <label>Tác giả (tuỳ chọn)</label>
        <input name="author" id="seriesAuthorInput" value="${esc(s?.author || "")}" placeholder="VD: Tatsuki Fujimoto, Haruki Murakami..." />
      </div>
      <div class="form-row-2">
        <div class="field">
          <label>Nhà xuất bản</label>
          <select name="publisher" id="seriesPubSel">
            ${["Trẻ", "Kim Đồng", "IPM", "Nhã Nam", "Khác"]
              .map((p) => `<option value="${p}" ${defPub === p ? "selected" : ""}>${p}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field">
          <label>Danh mục</label>
          <select name="category" id="seriesCatSel">
            ${["Manga", "Light Novel", "Sách", "Artbook"]
              .map((c) => `<option value="${c}" ${defCat === c ? "selected" : ""}>${c}</option>`)
              .join("")}
          </select>
        </div>
      </div>
      <div class="form-row-2">
        <div class="field">
          <label>Trạng thái theo dõi</label>
          <select name="status">
            ${["Đang theo", "Đã full", "Tạm ngưng"]
              .map((st) => `<option value="${st}" ${s?.status === st ? "selected" : ""}>${st}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field">
          <label>Tổng số tập bộ (tuỳ chọn)</label>
          <input name="totalVolumes" type="number" min="0" value="${s?.totalVolumes ? esc(s.totalVolumes) : ""}" placeholder="VD: 20 (tự đóng dấu FULL)" />
        </div>
      </div>
      ${quickVolBlockHtml}
      <div class="field">
        <label>Ảnh bìa đại diện (tuỳ chọn)</label>
        <div class="cover-preview-wrap">
          <div class="cover-preview" id="coverPreviewBox">
            ${currentCover ? `<img src="${esc(currentCover)}" alt="" referrerpolicy="no-referrer" />` : "Bìa chữ"}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <label class="btn btn-sm" style="margin:0;">
              ${currentCover ? "Đổi ảnh" : "Chọn ảnh từ máy"}
              <input type="file" id="coverFileInput" accept="image/*" style="display:none;" />
            </label>
            <button type="button" class="btn btn-sm btn-danger" id="clearCoverBtn" style="${currentCover ? "" : "display:none;"}">Xoá ảnh</button>
            <button type="button" class="btn btn-sm" id="undoCoverBtn" style="display:none;">Hoàn tác ảnh</button>
          </div>
        </div>
      </div>
      <div class="field">
        <label>Tên khác / Từ khoá bắt tin NXB (cách nhau dấu phẩy, tuỳ chọn)</label>
        <input name="aliases" value="${esc(s?.aliases || "")}" placeholder="VD: Mỹ Vị Hầm Ngục, Dungeon Meshi, JoJo, ORV..." />
      </div>
      <div class="field">
        <label>Ghi chú</label>
        <textarea name="note" placeholder="Bản in, bọc plastic, chỗ hay mua...">${esc(s?.note || "")}</textarea>
      </div>
      <div class="modal-actions" style="justify-content:space-between; flex-wrap:wrap;">
        <div>
          ${isCreate ? `<button type="button" class="btn btn-sm" id="saveAndNextSeriesBtn">Lưu & Nhập bộ tiếp</button>` : `<button type="button" class="btn btn-sm" id="cancelSeriesBtn">Huỷ</button>`}
        </div>
        <div style="display:flex; gap:8px;">
          ${isCreate ? `<button type="button" class="btn btn-sm" id="cancelSeriesBtn">Huỷ</button>` : ""}
          <button type="submit" class="btn btn-sm btn-primary">${s ? "Lưu thay đổi" : "Lưu & Mở bộ"}</button>
        </div>
      </div>
    </form>`;

  const batchFormHtml = isCreate
    ? `<form id="batchSeriesForm" class="form-grid" style="${initialMode === "batch" ? "" : "display:none;"}">
         <div class="small-muted">
           Mỗi dòng là 1 bộ truyện/sách — dán từ Ghi chú iPhone hoặc gõ nhanh. Hỗ trợ:<br/>
           <code>Chainsaw Man - 16 tập</code> · <code>Vagabond (1-12)</code> · <code>Rừng Na Uy</code><br/>
           Hoặc đủ cột: <code>Tên bộ | NXB | 1-10 | 45000 | 15</code>
         </div>
         <div class="field">
           <label>Danh sách bộ truyện / sách *</label>
           <textarea class="bulk-textarea" id="batchLinesInput" placeholder="Chainsaw Man - 16 tập&#10;Dungeon Meshi (1-14)&#10;JoJo Phần 1 | Kim Đồng | 1-3 | 120000 | 15&#10;Rừng Na Uy"></textarea>
         </div>
         <div class="form-row-2">
           <div class="field">
             <label>NXB mặc định</label>
             <select id="batchPubSel">
               ${["Trẻ", "Kim Đồng", "IPM", "Nhã Nam", "Khác"]
                 .map((p) => `<option value="${p}" ${defPub === p ? "selected" : ""}>${p}</option>`)
                 .join("")}
             </select>
           </div>
           <div class="field">
             <label>Danh mục mặc định</label>
             <select id="batchCatSel">
               ${["Manga", "Light Novel", "Sách", "Artbook"]
                 .map((c) => `<option value="${c}" ${defCat === c ? "selected" : ""}>${c}</option>`)
                 .join("")}
             </select>
           </div>
         </div>
         <div class="form-row-2">
           <div class="field">
             <label>Tên mục mặc định</label>
             <input id="batchSecInput" value="${esc(defSecName)}" placeholder="Bản thường" />
           </div>
           <div class="field">
             <label>Số tập mặc định (khi dòng chỉ ghi tên)</label>
             <input id="batchDefVols" type="number" min="0" value="1" />
           </div>
         </div>
         <div class="form-row-2">
           <div class="field">
             <label>Giá bìa mặc định / tập</label>
             <input id="batchDefPrice" type="number" min="0" value="${last.coverPrice ?? 35000}" />
           </div>
           <div class="field">
             <label>Chiết khấu mặc định (%)</label>
             <input id="batchDefCk" type="number" min="0" max="100" value="${last.discount ?? 15}" />
           </div>
         </div>
         <div class="ck-row" id="batchCkRow">
           ${CK_PRESETS.map((pct) => `<button type="button" class="ck-btn mono" data-batchck="${pct}">-${pct}%</button>`).join("")}
         </div>
         <label class="check-inline">
           <input type="checkbox" id="batchLegacyChk" checked />
           <span>Mua từ trước (không tính vào hạn mức tháng này)</span>
         </label>
         <div class="boxset-hint mono" id="batchPreviewSummary">Gõ hoặc dán danh sách ở trên để xem trước.</div>
         <div class="modal-actions">
           <button type="button" class="btn btn-sm" id="cancelBatchBtn">Huỷ</button>
           <button type="submit" class="btn btn-sm btn-primary" id="submitBatchBtn">Nhập tất cả vào tủ</button>
         </div>
       </form>`
    : "";

  openModal(s ? "Sửa đầu sách" : "Thêm đầu sách", modeSwitchHtml + singleFormHtml + batchFormHtml, (body) => {
    const singleForm = body.querySelector("#seriesForm");
    const batchForm = body.querySelector("#batchSeriesForm");
    const previewBox = body.querySelector("#coverPreviewBox");
    const clearBtn = body.querySelector("#clearCoverBtn");

    // Mode switch (1 bộ vs Nhập nhiều bộ)
    const modeSwitch = body.querySelector("#addSeriesModeSwitch");
    if (modeSwitch) {
      modeSwitch.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-smode]");
        if (!btn) return;
        const isBatch = btn.dataset.smode === "batch";
        modeSwitch.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        singleForm.style.display = isBatch ? "none" : "grid";
        if (batchForm) batchForm.style.display = isBatch ? "grid" : "none";
      });
    }

    const setPreview = (url) => {
      currentCover = url || "";
      previewBox.innerHTML = currentCover
        ? `<img src="${esc(currentCover)}" alt="" referrerpolicy="no-referrer" />`
        : "Bìa chữ";
      clearBtn.style.display = currentCover ? "" : "none";
    };

    const undoCoverBtn = body.querySelector("#undoCoverBtn");
    let clearedCoverBackup = "";

    body.querySelector("#cancelSeriesBtn").addEventListener("click", closeModal);
    clearBtn.addEventListener("click", () => {
      if (currentCover) clearedCoverBackup = currentCover;
      setPreview("");
      if (undoCoverBtn && clearedCoverBackup) undoCoverBtn.style.display = "";
      showToast("Đã xoá ảnh bìa — bấm 'Hoàn tác ảnh' nếu lỡ tay.");
    });

    if (undoCoverBtn) {
      undoCoverBtn.addEventListener("click", () => {
        if (!clearedCoverBackup) return;
        setPreview(clearedCoverBackup);
        clearedCoverBackup = "";
        undoCoverBtn.style.display = "none";
        showToast("Đã khôi phục ảnh bìa.");
      });
    }

    body.querySelector("#coverFileInput").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const cropped = await openImageCropper(file, { ratio: 2 / 3, maxW: 360, maxH: 540, quality: 0.76, title: "Cắt ảnh bìa" });
      if (cropped) {
        setPreview(cropped);
        if (undoCoverBtn) undoCoverBtn.style.display = "none";
      }
    });

    // Quick Volume block inside Single Series Form
    const qEnable = body.querySelector("#quickVolEnable");
    const qFields = body.querySelector("#quickVolFields");
    const qSecIn = body.querySelector("#quickSecNameInput");
    const qFromIn = body.querySelector("#quickFromIn");
    const qToIn = body.querySelector("#quickToIn");
    const qPriceIn = body.querySelector("#quickCoverPriceIn");
    const qDiscIn = body.querySelector("#quickDiscountIn");
    const qCkRow = body.querySelector("#quickCkRow");
    const qSummary = body.querySelector("#quickVolSummary");

    const updateQuickVolPreview = () => {
      if (!qEnable || !qFields) return;
      qFields.style.display = qEnable.checked ? "grid" : "none";
      if (!qEnable.checked) return;
      const f = Math.round(Number(qFromIn.value) || 0);
      const t = Math.round(Number(qToIn.value) || 0);
      const cp = Math.max(0, Number(qPriceIn.value) || 0);
      const d = Math.min(100, Math.max(0, Number(qDiscIn.value) || 0));
      qCkRow.querySelectorAll(".ck-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.sck) === d);
      });
      const count = t - f + 1;
      if (count < 1) {
        qSummary.textContent = "Đến tập phải >= Từ tập.";
        return;
      }
      const paid = Math.round(cp * (1 - d / 100));
      qSummary.textContent = `Tạo mục "${qSecIn.value.trim() || "Bản thường"}" gồm ${count} tập · ${fmtMoney(paid)}/tập (Tổng ${fmtMoney(paid * count)})`;
    };

    if (qEnable) {
      qEnable.addEventListener("change", updateQuickVolPreview);
      [qSecIn, qFromIn, qToIn, qPriceIn, qDiscIn].forEach((el) => el.addEventListener("input", updateQuickVolPreview));
      body.querySelectorAll("#quickSecPresets [data-qsec]").forEach((btn) => {
        btn.addEventListener("click", () => {
          qSecIn.value = btn.dataset.qsec;
          updateQuickVolPreview();
        });
      });
      qCkRow.querySelectorAll(".ck-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          qDiscIn.value = btn.dataset.sck;
          updateQuickVolPreview();
        });
      });
      updateQuickVolPreview();
    }

    const handleSaveSingle = (continueAdding) => {
      if (!singleForm.reportValidity()) return;
      const fd = new FormData(singleForm);
      const title = fd.get("title").trim();
      if (!title) return;
      const publisher = fd.get("publisher");
      const category = fd.get("category");

      if (s) {
        pushUndo(`sửa "${s.title}"`);
        s.title = title;
        s.author = (fd.get("author") || "").trim();
        s.publisher = publisher;
        s.category = category;
        s.status = fd.get("status");
        s.totalVolumes = Math.max(0, Math.round(Number(fd.get("totalVolumes")) || 0));
        s.aliases = (fd.get("aliases") || "").trim();
        s.note = fd.get("note").trim();
        s.cover = currentCover;
        saveState();
        renderBooks();
        renderNews();
        renderSpending();
        openSeriesDetail(s.id);
        showToast("Đã cập nhật đầu sách.", { undoable: true });
        return;
      }

      const newS = {
        id: uid(),
        title,
        author: (fd.get("author") || "").trim(),
        publisher,
        category,
        status: fd.get("status"),
        totalVolumes: Math.max(0, Math.round(Number(fd.get("totalVolumes")) || 0)),
        aliases: (fd.get("aliases") || "").trim(),
        note: fd.get("note").trim(),
        cover: currentCover,
        sections: [],
        createdAt: todayISO(),
      };

      let addedVols = 0;
      if (qEnable && qEnable.checked) {
        const f = Math.round(Number(qFromIn.value) || 1);
        const t = Math.round(Number(qToIn.value) || f);
        if (t >= f && t - f <= 150) {
          const secName = (qSecIn.value || "Bản thường").trim();
          const cp = Math.max(0, Number(qPriceIn.value) || 0);
          const disc = Math.min(100, Math.max(0, Number(qDiscIn.value) || 0));
          const sec = { id: uid(), name: secName, image: "", note: "", volumes: [] };
          addedVols = addBatchVolumesToSection(sec, {
            from: f,
            to: t,
            priceMode: "unit",
            coverInput: cp,
            paidInput: 0,
            discount: disc,
            date: todayISO(),
            isLegacy: Boolean(body.querySelector("#quickLegacyChk")?.checked),
            image: "",
            note: "",
          });
          newS.sections.push(sec);
          state.lastEntry = {
            publisher,
            category,
            sectionName: secName,
            coverPrice: cp,
            discount: disc,
          };
        }
      } else {
        state.lastEntry = { ...last, publisher, category };
      }

      state.series.unshift(newS);
      saveState();
      renderBooks();
      renderNews();
      renderSpending();

      SFX.success();
      spawnCelebration(undefined, undefined, 16);
      if (continueAdding) {
        showToast(`Đã lưu "${title}"${addedVols ? ` (${addedVols} tập)` : ""} — nhập tiếp bộ mới!`);
        openSeriesForm(null, "single");
        setTimeout(() => {
          const inp = document.getElementById("seriesTitleInput");
          if (inp) inp.focus();
        }, 30);
      } else {
        openSeriesDetail(newS.id);
        notifyCapooEvent("added");
        showToast(`Đã thêm "${title}"${addedVols ? ` (${addedVols} tập)` : ""}.`);
      }
    };

    singleForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSaveSingle(false);
    });

    const saveNextBtn = body.querySelector("#saveAndNextSeriesBtn");
    if (saveNextBtn) {
      saveNextBtn.addEventListener("click", () => handleSaveSingle(true));
    }

    // Batch Multi-Series Import Form
    if (batchForm) {
      const linesIn = body.querySelector("#batchLinesInput");
      const bPub = body.querySelector("#batchPubSel");
      const bCat = body.querySelector("#batchCatSel");
      const bSec = body.querySelector("#batchSecInput");
      const bDefVols = body.querySelector("#batchDefVols");
      const bDefPrice = body.querySelector("#batchDefPrice");
      const bDefCk = body.querySelector("#batchDefCk");
      const bCkRow = body.querySelector("#batchCkRow");
      const bSummary = body.querySelector("#batchPreviewSummary");

      const getBatchDefaults = () => {
        const dv = Math.max(0, Math.round(Number(bDefVols.value) || 0));
        return {
          publisher: bPub.value,
          category: bCat.value,
          sectionName: (bSec.value || "Bản thường").trim(),
          defaultFrom: dv >= 1 ? 1 : 0,
          defaultTo: dv >= 1 ? dv : 0,
          coverPrice: Math.max(0, Number(bDefPrice.value) || 0),
          discount: Math.min(100, Math.max(0, Number(bDefCk.value) || 0)),
        };
      };

      const updateBatchPreview = () => {
        const defs = getBatchDefaults();
        bCkRow.querySelectorAll(".ck-btn").forEach((b) => {
          b.classList.toggle("active", Number(b.dataset.batchck) === defs.discount);
        });
        const items = parseBatchSeriesLines(linesIn.value, defs);
        if (!items.length) {
          bSummary.textContent = "Gõ hoặc dán danh sách ở trên để xem trước.";
          return;
        }
        const totalV = items.reduce((acc, x) => acc + x.volCount, 0);
        const totalP = items.reduce((acc, x) => acc + x.totalPaid, 0);
        bSummary.textContent = `Sẽ thêm ${items.length} bộ · ${totalV} tập · Tổng thực chi ${fmtMoney(totalP)}`;
      };

      bCkRow.querySelectorAll(".ck-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          bDefCk.value = btn.dataset.batchck;
          updateBatchPreview();
        });
      });

      [linesIn, bPub, bCat, bSec, bDefVols, bDefPrice, bDefCk].forEach((el) =>
        el.addEventListener("input", updateBatchPreview)
      );
      updateBatchPreview();

      body.querySelector("#cancelBatchBtn").addEventListener("click", closeModal);
      batchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const defs = getBatchDefaults();
        const items = parseBatchSeriesLines(linesIn.value, defs);
        if (!items.length) {
          showToast("Hãy nhập ít nhất 1 tên truyện/sách.");
          return;
        }
        pushUndo(`nhập nhanh ${items.length} bộ`);
        let totalCreatedVols = 0;
        // Duyệt ngược để thứ tự đầu danh sách vẫn đứng trên cùng
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i];
          const newS = {
            id: uid(),
            title: it.title,
            publisher: it.publisher,
            category: defs.category,
            status: "Đang theo",
            aliases: "",
            note: "",
            cover: "",
            sections: [],
            createdAt: todayISO(),
          };
          if (it.volCount > 0) {
            const sec = { id: uid(), name: defs.sectionName, image: "", note: "", volumes: [] };
            totalCreatedVols += addBatchVolumesToSection(sec, {
              from: it.from,
              to: it.to,
              priceMode: "unit",
              coverInput: it.coverPrice,
              paidInput: 0,
              discount: it.discount,
              date: todayISO(),
              isLegacy: Boolean(body.querySelector("#batchLegacyChk")?.checked),
              image: "",
              note: "",
            });
            newS.sections.push(sec);
          }
          state.series.unshift(newS);
        }
        state.lastEntry = {
          publisher: defs.publisher,
          category: defs.category,
          sectionName: defs.sectionName,
          coverPrice: defs.coverPrice,
          discount: defs.discount,
        };
        saveState();
        renderBooks();
        renderNews();
        renderSpending();
        closeModal();
        SFX.success();
        spawnCelebration(undefined, undefined, 22);
        notifyCapooEvent("added");
        showToast(`Đã nhập nhanh ${items.length} bộ (${totalCreatedVols} tập)!`);
      });
    }
  });
}

// Cấp 1 bên trong Manga / Sách: Quản lý CÁC MỤC (Manga, Boxset, Limited, Tái bản...)
