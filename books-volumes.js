"use strict";

function openSeriesDetail(seriesId) {
  const s = state.series.find((x) => x.id === seriesId);
  if (!s) return;
  const sections = s.sections || [];
  const allVols = getAllSeriesVolumes(s);
  const totalCover = allVols.reduce((a, v) => a + (Number(v.coverPrice) || 0), 0);
  const totalPaid = allVols.reduce((a, v) => a + (Number(v.paidPrice) || 0), 0);
  const diff = totalCover - totalPaid;

  const sectionsHtml = sections.length
    ? `<div class="section-list">${sections
        .map((sec) => {
          const vols = sec.volumes || [];
          const secPaid = vols.reduce((a, v) => a + (Number(v.paidPrice) || 0), 0);
          const imgCount = vols.filter((v) => v.image).length;
          const secImg = resolveImg(sec.image);
          return `
            <div class="section-card" data-open-sec="${sec.id}" style="cursor:pointer;">
              ${
                secImg
                  ? `<button type="button" class="sec-thumb" data-zoom-sec="${sec.id}" title="Xem ảnh mục">
                       <img src="${esc(secImg)}" alt="${esc(sec.name)}" loading="lazy" />
                     </button>`
                  : ""
              }
              <div style="min-width:0; flex:1;">
                <div class="section-card-title">
                  <span>${esc(sec.name)}</span>
                  <span class="tag mono">${vols.length} tập</span>
                </div>
                <div class="section-card-sub mono">
                  Thực chi ${fmtMoney(secPaid)}${imgCount ? ` · ${imgCount} ảnh tập` : ""}${sec.note ? ` · ${esc(sec.note)}` : ""}
                </div>
              </div>
              <span class="section-arrow">Mở →</span>
            </div>`;
        })
        .join("")}</div>`
    : `<div class="empty" style="padding:20px 14px; margin:10px 0;">
         <div class="empty-title" style="font-size:13px;">Chưa có mục nào</div>
         <div class="empty-desc" style="margin-bottom:10px;">Tạo các mục như <strong>Manga</strong>, <strong>Boxset</strong>, <strong>Limited</strong>, <strong>Tái bản</strong>... (kèm ảnh mục) rồi bấm vào để thêm tập và giá.</div>
         <button type="button" class="btn btn-sm btn-primary" id="emptyCreateSecBtn">+ Tạo mục đầu tiên</button>
       </div>`;

  const seriesCoverSrc = resolveImg(s.cover);
  const seriesHolo = isSpecialSeries(s);
  const fbRgb = pubFallbackRGB(s.publisher);

  const html = `
    <div class="ambient-hero" id="seriesAmbientHero" style="--amb-rgb:${fbRgb.join(",")}">
      <div style="display:flex; gap:13px; align-items:flex-start;">
        <div class="ambient-cover ${seriesHolo ? "is-holo" : ""}" id="seriesHeroCover" style="${seriesCoverSrc ? "" : `border-left:3px solid ${pubColorVar(s.publisher)}`}">
          ${seriesCoverSrc ? `<img src="${esc(seriesCoverSrc)}" alt="" referrerpolicy="no-referrer" />` : `<span class="mono" style="text-align:center; padding:4px;">${esc(s.publisher)}</span>`}
          ${isSeriesFull(s) ? `<span class="hanko-full">FULL</span>` : ""}
          ${seriesHolo ? `<span class="holo-pill mono">ĐB</span>` : ""}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:15.5px; font-weight:700; line-height:1.3;">${esc(s.title)}</div>
          ${s.author ? `<div class="small-muted" style="margin-top:2px;">Tác giả: ${esc(s.author)}</div>` : ""}
          <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:6px;">
            <span class="tag">${esc(s.publisher)}</span>
            <span class="tag">${esc(s.category)}</span>
            <span class="tag">${esc(s.status || "Đang theo")}</span>
          </div>
          <div class="mono small-muted" style="margin-top:8px;">
            ${sections.length} mục · ${allVols.length} tập · Thực chi ${fmtMoney(totalPaid)}<br/>
            Giá bìa ${fmtMoney(totalCover)} (${diff >= 0 ? `tiết kiệm ${fmtMoney(diff)}` : `chênh +${fmtMoney(-diff)}`})
          </div>
        </div>
      </div>
      ${s.note ? `<div class="small-muted" style="margin-top:9px; padding:7px 9px; background:var(--surface); border:1px solid var(--line);">${esc(s.note)}</div>` : ""}
    </div>

    <div class="divider"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <span class="panel-title">Các mục (${sections.length})</span>
      <button type="button" class="btn btn-sm btn-primary" id="addSectionBtn">+ Tạo mục</button>
    </div>
    ${sectionsHtml}

    <div class="modal-actions" style="justify-content:space-between;">
      <button type="button" class="btn btn-sm btn-danger" id="delSeriesBtn">Xoá bộ này</button>
      <button type="button" class="btn btn-sm" id="editSeriesBtn">Sửa thông tin bộ</button>
    </div>`;

  let detachGyro = null;
  openModal(s.title, html, (body) => {
    const heroEl = body.querySelector("#seriesAmbientHero");
    const heroCov = body.querySelector("#seriesHeroCover");
    if (heroEl && seriesCoverSrc) {
      extractDominantColor(seriesCoverSrc, s.publisher).then((rgb) => {
        if (heroEl.isConnected) heroEl.style.setProperty("--amb-rgb", rgb.join(","));
      });
    }
    if (heroCov) {
      detachGyro = attachHeroGyroTilt(heroCov);
      if (seriesCoverSrc) {
        heroCov.style.cursor = "zoom-in";
        heroCov.addEventListener("click", () => openImageLightbox(seriesCoverSrc, s.title, () => openSeriesDetail(seriesId)));
      }
    }
    body.querySelector("#addSectionBtn").addEventListener("click", () => openSectionForm(seriesId));
    const emptyBtn = body.querySelector("#emptyCreateSecBtn");
    if (emptyBtn) emptyBtn.addEventListener("click", () => openSectionForm(seriesId));
    body.querySelector("#editSeriesBtn").addEventListener("click", () => openSeriesForm(seriesId));
    body.querySelector("#delSeriesBtn").addEventListener("click", () => {
      if (!confirm(`Xoá bộ "${s.title}" cùng toàn bộ ${sections.length} mục và ${allVols.length} tập?`)) return;
      pushUndo(`xoá bộ "${s.title}"`);
      state.series = state.series.filter((x) => x.id !== seriesId);
      saveState();
      renderBooks();
      renderNews();
      renderSpending();
      closeModal();
      SFX.del();
      notifyCapooEvent("deleted");
      showToast(`Đã xoá "${s.title}".`, { undoable: true });
    });
    body.querySelectorAll("[data-zoom-sec]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const secObj = (s.sections || []).find((x) => x.id === btn.dataset.zoomSec);
        const imgUrl = resolveImg(secObj?.image);
        if (imgUrl) {
          openImageLightbox(imgUrl, `${s.title} — ${secObj.name}`, () => openSeriesDetail(seriesId));
        }
      });
    });
    body.querySelectorAll("[data-open-sec]").forEach((el) => {
      el.addEventListener("click", () => { SFX.openBook(); openSectionDetail(seriesId, el.dataset.openSec); });
    });
  }, () => { if (typeof detachGyro === "function") detachGyro(); });
}

// Form tạo / sửa Mục bên trong đầu sách (có thêm Ảnh đại diện mục!)
function openSectionForm(seriesId, sectionId = null) {
  const s = state.series.find((x) => x.id === seriesId);
  if (!s) return;
  const sec = sectionId ? (s.sections || []).find((x) => x.id === sectionId) : null;
  const presets = ["Manga", "Bản thường", "Boxset", "Limited", "Tái bản", "Bìa cứng", "Artbook", "Sách chữ"];
  let currentSecImg = resolveImg(sec?.image || "");

  const html = `
    <form id="sectionForm" class="form-grid">
      <div class="field">
        <label>Tên mục *</label>
        <input name="name" id="secNameInput" required value="${esc(sec?.name || "")}" placeholder="VD: Manga, Boxset, Limited, Tái bản..." />
        <div class="preset-chips">
          ${presets.map((p) => `<button type="button" class="preset-chip" data-preset="${esc(p)}">${esc(p)}</button>`).join("")}
        </div>
      </div>

      <div class="field">
        <label>Ảnh minh họa mục (VD: ảnh hộp Boxset, ảnh bản ĐB/tái bản...)</label>
        <div class="cover-preview-wrap">
          <div class="cover-preview" id="secImgPreview" style="cursor:${currentSecImg ? "zoom-in" : "default"};">
            ${currentSecImg ? `<img src="${esc(currentSecImg)}" alt="" />` : "Chưa có"}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <label class="btn btn-sm" style="margin:0;">
              ${currentSecImg ? "Đổi ảnh" : "Chọn ảnh"}
              <input type="file" id="secImgInput" accept="image/*" style="display:none;" />
            </label>
            <button type="button" class="btn btn-sm btn-danger" id="clearSecImgBtn" style="${currentSecImg ? "" : "display:none;"}">Xoá ảnh</button>
            <button type="button" class="btn btn-sm" id="undoSecImgBtn" style="display:none;">Hoàn tác ảnh</button>
          </div>
        </div>
      </div>

      <div class="field">
        <label>Ghi chú mục (tuỳ chọn)</label>
        <input name="note" value="${esc(sec?.note || "")}" placeholder="VD: Bản có áo bọc, hộp cứng, in lần đầu..." />
      </div>
      <div class="modal-actions" style="justify-content:space-between;">
        <button type="button" class="btn btn-sm" id="backFromSecFormBtn">Quay lại</button>
        <button type="submit" class="btn btn-sm btn-primary">${sec ? "Lưu mục" : "Tạo mục"}</button>
      </div>
    </form>`;

  openModal(`${s.title} — ${sec ? "Sửa mục" : "Tạo mục mới"}`, html, (body) => {
    const nameInput = body.querySelector("#secNameInput");
    const previewEl = body.querySelector("#secImgPreview");
    const clearBtn = body.querySelector("#clearSecImgBtn");

    const setSecPreview = (url) => {
      currentSecImg = url || "";
      previewEl.innerHTML = currentSecImg ? `<img src="${esc(currentSecImg)}" alt="" />` : "Chưa có";
      previewEl.style.cursor = currentSecImg ? "zoom-in" : "default";
      clearBtn.style.display = currentSecImg ? "" : "none";
    };

    previewEl.addEventListener("click", () => {
      if (!currentSecImg) return;
      openImageLightbox(currentSecImg, `${s.title} — ${nameInput.value || "Mục"}`, () =>
        openSectionForm(seriesId, sectionId)
      );
    });

    const undoSecImgBtn = body.querySelector("#undoSecImgBtn");
    let clearedSecImgBackup = "";

    clearBtn.addEventListener("click", () => {
      if (currentSecImg) clearedSecImgBackup = currentSecImg;
      setSecPreview("");
      if (undoSecImgBtn && clearedSecImgBackup) undoSecImgBtn.style.display = "";
      showToast("Đã xoá ảnh mục — bấm 'Hoàn tác ảnh' nếu lỡ tay.");
    });

    if (undoSecImgBtn) {
      undoSecImgBtn.addEventListener("click", () => {
        if (!clearedSecImgBackup) return;
        setSecPreview(clearedSecImgBackup);
        clearedSecImgBackup = "";
        undoSecImgBtn.style.display = "none";
        showToast("Đã khôi phục ảnh mục.");
      });
    }

    body.querySelector("#secImgInput").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const cropped = await openImageCropper(file, { ratio: 2 / 3, maxW: 360, maxH: 540, quality: 0.76, title: "Cắt ảnh mục" });
      if (cropped) {
        setSecPreview(cropped);
        if (undoSecImgBtn) undoSecImgBtn.style.display = "none";
      }
    });

    body.querySelectorAll("[data-preset]").forEach((chip) => {
      chip.addEventListener("click", () => {
        nameInput.value = chip.dataset.preset;
        nameInput.focus();
      });
    });
    body.querySelector("#backFromSecFormBtn").addEventListener("click", () => {
      if (sec) openSectionDetail(seriesId, sec.id);
      else openSeriesDetail(seriesId);
    });
    body.querySelector("#sectionForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = fd.get("name").trim();
      if (!name) return;
      s.sections = s.sections || [];
      if (sec) {
        pushUndo(`sửa mục "${sec.name}"`);
        sec.name = name;
        sec.image = currentSecImg;
        sec.note = fd.get("note").trim();
        saveState();
        renderBooks();
        openSectionDetail(seriesId, sec.id);
        showToast("Đã cập nhật mục.");
      } else {
        const newSec = {
          id: uid(),
          name,
          image: currentSecImg,
          note: fd.get("note").trim(),
          volumes: [],
        };
        s.sections.push(newSec);
        saveState();
        renderBooks();
        openSectionDetail(seriesId, newSec.id);
        showToast(`Đã tạo mục "${name}".`);
      }
    });
  });
}

// Helper tìm các số tập bị thiếu ("lủng tập") trong 1 mục
function findMissingVolumes(vols) {
  const ints = [...new Set(vols.map((v) => Math.floor(Number(v.number))).filter((n) => n >= 1 && Number.isFinite(n)))].sort(
    (a, b) => a - b
  );
  if (ints.length < 2) return [];
  const minV = ints[0];
  const maxV = ints[ints.length - 1];
  if (maxV - minV > 200) return [];
  const have = new Set(ints);
  const missing = [];
  for (let n = minV; n <= maxV; n++) {
    if (!have.has(n)) missing.push(n);
  }
  return missing;
}


// Cấp 2: Bên trong 1 Mục -> ảnh mục, + Tập tiếp 1 chạm, Thẻ ảnh / Ô gọn, phát hiện lủng tập
function openSectionDetail(seriesId, sectionId) {
  const s = state.series.find((x) => x.id === seriesId);
  if (!s) return;
  const sec = (s.sections || []).find((x) => x.id === sectionId);
  if (!sec) return openSeriesDetail(seriesId);

  const vols = [...(sec.volumes || [])].sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));
  const totalCover = vols.reduce((a, v) => a + (Number(v.coverPrice) || 0), 0);
  const totalPaid = vols.reduce((a, v) => a + (Number(v.paidPrice) || 0), 0);
  const diff = totalCover - totalPaid;
  const missing = findMissingVolumes(vols);
  const lentCount = vols.filter((v) => (v.lentTo || "").trim()).length;
  const viewMode = state.volView || "cards";
  const secImg = resolveImg(sec.image);
  const maxNum = vols.reduce((m, x) => Math.max(m, Math.floor(Number(x.number) || 0)), 0);
  const nextQuickNum = maxNum + 1;
  const lastVol = vols[vols.length - 1];

  const missingHtml = missing.length
    ? `<div class="missing-strip">
         <strong>Phát hiện thiếu ${missing.length} tập ở giữa</strong> (chạm để thêm nhanh):
         <div class="missing-chips">
           ${missing
             .slice(0, 14)
             .map((n) => `<button type="button" class="missing-chip mono" data-add-missing="${n}">+ Tập ${n}</button>`)
             .join("")}
           ${missing.length > 14 ? `<span class="small-muted mono">...+${missing.length - 14} tập</span>` : ""}
         </div>
       </div>`
    : "";

  let volsHtml = "";
  if (!vols.length) {
    volsHtml = `<div class="empty" style="padding:20px 14px; margin:10px 0;">
         <div class="empty-title" style="font-size:13px;">Mục "${esc(sec.name)}" chưa có tập nào</div>
         <div class="empty-desc">Bấm <strong>+ T.1</strong> để thêm nhanh 1 chạm, <strong>+ 1 tập</strong> để thêm kèm ảnh/CK%, hoặc <strong>+ Nhiều tập</strong> cho loạt tập / Boxset.</div>
       </div>`;
  } else if (viewMode === "compact") {
    volsHtml = `<div class="vol-compact-grid">${vols
      .map((v) => {
        const numStr = String(v.number).padStart(2, "0");
        const isLent = Boolean((v.lentTo || "").trim());
        const isSeal = v.readState === "Nguyên seal";
        const kPrice = v.paidPrice >= 1000 ? `${Math.round(v.paidPrice / 1000)}k` : `${v.paidPrice}đ`;
        return `
          <button type="button" class="vol-compact-cell ${isLent ? "is-lent" : isSeal ? "is-seal" : ""}" data-vol-id="${v.id}" title="Tập ${esc(v.number)}">
            <span class="vol-compact-num mono">${esc(numStr)}</span>
            <span class="vol-compact-price mono">${isLent ? "Mượn" : isSeal ? "Seal" : kPrice}</span>
          </button>`;
      })
      .join("")}</div>`;
  } else {
    volsHtml = `<div class="vol-card-grid">${vols
      .map((v, idx) => {
        const numStr = String(v.number).padStart(2, "0");
        const volImg = resolveImg(v.image);
        const isLent = Boolean((v.lentTo || "").trim());
        const flagHtml = isLent
          ? `<span class="vol-flag lent">Mượn: ${esc(v.lentTo)}</span>`
          : v.readState === "Nguyên seal"
          ? `<span class="vol-flag seal">Nguyên seal</span>`
          : v.readState === "Đã đọc"
          ? `<span class="vol-flag">Đã đọc</span>`
          : "";
        const mediaHtml = volImg
          ? `<img src="${esc(volImg)}" alt="Tập ${esc(v.number)}" loading="lazy" />
             ${flagHtml}
             <span class="vol-card-badge mono">T.${esc(numStr)}</span>`
          : `${flagHtml}
             <span class="vol-card-num-big mono">${esc(numStr)}</span>
             <span class="small-muted" style="font-size:10px; margin-top:2px;">Tập ${esc(v.number)}</span>`;
        return `
          <button type="button" class="vol-card fx-card-in" style="--stagger:${idx}" data-vol-id="${v.id}">
            <div class="vol-card-media ${isSpecialSection(sec) ? "is-holo" : ""}">${mediaHtml}</div>
            <div class="vol-card-body">
              <div class="vol-card-label">Tập ${esc(v.number)}</div>
              <div class="vol-card-price mono">${fmtMoney(v.paidPrice)}</div>
            </div>
          </button>`;
      })
      .join("")}</div>`;
  }

  const html = `
    <div class="crumb-bar">
      <button type="button" class="btn btn-sm" id="backToSeriesBtn">← ${esc(s.title.slice(0, 24))}</button>
      <div style="display:flex; gap:5px;">
        <button type="button" class="btn btn-sm" id="editSecBtn">Sửa mục</button>
        <button type="button" class="btn btn-sm btn-danger" id="delSecBtn">Xoá mục</button>
      </div>
    </div>

    <div style="display:flex; align-items:flex-start; gap:11px;">
      ${
        secImg
          ? `<button type="button" class="sec-thumb" id="secDetailImgZoom" style="width:52px; height:72px;" title="Xem ảnh lớn">
               <img src="${esc(secImg)}" alt="${esc(sec.name)}" />
             </button>`
          : ""
      }
      <div style="flex:1; min-width:0;">
        <div style="font-size:15px; font-weight:700;">${esc(sec.name)}</div>
        <div class="mono small-muted" style="margin-top:3px;">
          ${vols.length} tập · Thực chi ${fmtMoney(totalPaid)} · Giá bìa ${fmtMoney(totalCover)}
          ${diff > 0 ? ` (tiết kiệm ${fmtMoney(diff)})` : ""}
          ${lentCount ? ` · Đang cho mượn ${lentCount}` : ""}
        </div>
        ${sec.note ? `<div class="small-muted" style="margin-top:3px;">${esc(sec.note)}</div>` : ""}
      </div>
    </div>

    ${missingHtml}

    <div class="divider"></div>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
      <div class="seg" id="volViewSeg">
        <button type="button" class="${viewMode === "cards" ? "active" : ""}" data-vmode="cards">Thẻ ảnh</button>
        <button type="button" class="${viewMode === "compact" ? "active" : ""}" data-vmode="compact">Ô gọn</button>
      </div>
      <div style="display:flex; gap:5px; flex-wrap:wrap;">
        <button type="button" class="btn btn-sm btn-accent mono" id="quickAddNextVolBtn" title="Thêm nhanh 1 chạm theo giá tập trước">+ T.${nextQuickNum}</button>
        <button type="button" class="btn btn-sm" id="addBulkVolBtn">+ Nhiều tập</button>
        <button type="button" class="btn btn-sm btn-primary" id="addOneVolBtn">+ 1 tập</button>
      </div>
    </div>

    ${volsHtml}`;

  openModal(`${s.title} / ${sec.name}`, html, (body) => {
    body.querySelector("#backToSeriesBtn").addEventListener("click", () => openSeriesDetail(seriesId));
    body.querySelector("#editSecBtn").addEventListener("click", () => openSectionForm(seriesId, sectionId));
    const secZoom = body.querySelector("#secDetailImgZoom");
    if (secZoom && secImg) {
      secZoom.addEventListener("click", () =>
        openImageLightbox(secImg, `${s.title} — ${sec.name}`, () => openSectionDetail(seriesId, sectionId))
      );
    }
    body.querySelector("#delSecBtn").addEventListener("click", () => {
      if (!confirm(`Xoá mục "${sec.name}" cùng ${vols.length} tập bên trong?`)) return;
      pushUndo(`xoá mục "${sec.name}"`);
      s.sections = (s.sections || []).filter((x) => x.id !== sectionId);
      saveState();
      renderBooks();
      renderSpending();
      openSeriesDetail(seriesId);
      SFX.del();
      showToast(`Đã xoá mục "${sec.name}".`, { undoable: true });
    });
    body.querySelectorAll("#volViewSeg [data-vmode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.volView = btn.dataset.vmode;
        saveState();
        openSectionDetail(seriesId, sectionId);
      });
    });
    body.querySelectorAll("[data-add-missing]").forEach((btn) => {
      btn.addEventListener("click", () => openVolumeForm(seriesId, sectionId, null, Number(btn.dataset.addMissing)));
    });

    // 1-Tap Quick Add Next Volume!
    body.querySelector("#quickAddNextVolBtn").addEventListener("click", (ev) => {
      SFX.pop();
      spawnCelebrationFromEl(ev.currentTarget, 12);
      const last = { ...DEFAULT_STATE.lastEntry, ...(state.lastEntry || {}) };
      const cp = lastVol ? Number(lastVol.coverPrice) || 0 : Number(last.coverPrice) || 35000;
      const pp = lastVol
        ? Number(lastVol.paidPrice) || 0
        : Math.round(cp * (1 - (Number(last.discount) || 0) / 100));
      sec.volumes = sec.volumes || [];
      sec.volumes.push({
        id: uid(),
        number: nextQuickNum,
        coverPrice: cp,
        paidPrice: pp,
        date: todayISO(),
        image: "",
        readState: "Chưa đọc",
        lentTo: "",
        note: "",
        groupId: "",
        groupLabel: "",
      });
      saveState();
      renderBooks();
      renderSpending();
      openSectionDetail(seriesId, sectionId);
      notifyCapooEvent("added");
      showToast(`Đã thêm nhanh Tập ${nextQuickNum} (${fmtMoney(pp)}).`);
    });

    body.querySelector("#addOneVolBtn").addEventListener("click", () => openVolumeForm(seriesId, sectionId));
    body.querySelector("#addBulkVolBtn").addEventListener("click", () => openBulkVolumeForm(seriesId, sectionId));
    body.querySelectorAll("[data-vol-id]").forEach((btn) => {
      btn.addEventListener("click", () => { SFX.openBook(); openVolumeForm(seriesId, sectionId, btn.dataset.volId); });
    });
  });
}

// Thêm / sửa 1 tập trong Mục (Tính giá theo CK 0–30% + Ảnh riêng + Lưu & Tập tiếp)
function openVolumeForm(seriesId, sectionId, volId = null, prefillVolNum = null) {
  const s = state.series.find((x) => x.id === seriesId);
  const sec = s ? (s.sections || []).find((x) => x.id === sectionId) : null;
  if (!s || !sec) return;
  const v = volId ? (sec.volumes || []).find((x) => x.id === volId) : null;
  const maxNum = (sec.volumes || []).reduce((m, x) => Math.max(m, Number(x.number) || 0), 0);
  const lastVol = (sec.volumes || [])[(sec.volumes || []).length - 1];
  const groupSiblings = v?.groupId
    ? (sec.volumes || []).filter((x) => x.groupId === v.groupId)
    : [];
  let currentImg = resolveImg(v?.image || "");
  const defaultNum = v ? v.number : prefillVolNum ?? maxNum + 1;

  const html = `
    <form id="volForm" class="form-grid">
      <div class="form-row-2">
        <div class="field">
          <label>Số tập *</label>
          <input name="number" type="number" step="0.5" required value="${esc(defaultNum)}" />
        </div>
        <div class="field">
          <label>Tình trạng</label>
          <select name="readState">
            ${["Chưa đọc", "Đang đọc", "Đã đọc", "Nguyên seal"]
              .map((rs) => `<option value="${rs}" ${(v?.readState || "Chưa đọc") === rs ? "selected" : ""}>${rs}</option>`)
              .join("")}
          </select>
        </div>
      </div>

      <div class="field">
        <label>Ảnh tập truyện / sách (tuỳ chọn)</label>
        <div class="cover-preview-wrap">
          <div class="cover-preview" id="volImgPreview" style="cursor:${currentImg ? "zoom-in" : "default"};">
            ${currentImg ? `<img src="${esc(currentImg)}" alt="" />` : "Chưa có"}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <label class="btn btn-sm" style="margin:0;">
              ${currentImg ? "Đổi ảnh" : "Chọn ảnh"}
              <input type="file" id="volImgInput" accept="image/*" style="display:none;" />
            </label>
            <button type="button" class="btn btn-sm btn-danger" id="clearVolImgBtn" style="${currentImg ? "" : "display:none;"}">Xoá ảnh</button>
            <button type="button" class="btn btn-sm" id="undoVolImgBtn" style="display:none;">Hoàn tác ảnh</button>
          </div>
        </div>
      </div>

      <div class="field">
        <div class="form-row-2">
          <div>
            <label>Giá bìa (VNĐ)</label>
            <input name="coverPrice" id="volCoverInput" type="number" min="0" value="${v ? v.coverPrice : lastVol?.coverPrice ?? 35000}" />
          </div>
          <div>
            <label>Thực chi (VNĐ)</label>
            <input name="paidPrice" id="volPaidInput" type="number" min="0" value="${v ? v.paidPrice : lastVol?.paidPrice ?? 30000}" />
          </div>
        </div>
        <div style="margin-top:7px;">
          <label style="margin-bottom:2px;">Tính nhanh theo chiết khấu (CK):</label>
          <div class="ck-row" id="volCkRow">
            ${CK_PRESETS.map((pct) => `<button type="button" class="ck-btn mono" data-ck="${pct}">-${pct}%</button>`).join("")}
          </div>
          <div class="ck-meta mono" id="volCkMeta"></div>
        </div>
      </div>

      <div class="form-row-2">
        <div class="field">
          <label>Ngày mua</label>
          <input name="date" id="volDateInput" type="date" value="${esc(v?.date || todayISO())}" />
        </div>
        <div class="field">
          <label>Đang cho mượn (để trống nếu ở nhà)</label>
          <input name="lentTo" value="${esc(v?.lentTo || "")}" placeholder="VD: Minh, Huy..." />
        </div>
      </div>
      <label class="check-inline">
        <input type="checkbox" name="isLegacy" id="volLegacyChk" ${v?.isLegacy ? "checked" : ""} />
        <span>Mua từ trước (không tính vào hạn mức tháng này)</span>
      </label>

      <div class="field">
        <label>Ghi chú (Obi, bookmark, nơi mua...)</label>
        <input name="note" value="${esc(v?.note || "")}" placeholder="VD: Kèm obi + postcard, mua Shopee" />
      </div>

      <div class="modal-actions" style="justify-content:space-between; flex-wrap:wrap;">
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${v ? `<button type="button" class="btn btn-sm btn-danger" id="delVolBtn">Xoá tập</button>` : `<button type="button" class="btn btn-sm" id="saveAndNextVolBtn">Lưu & Tập tiếp</button>`}
          ${
            groupSiblings.length > 1
              ? `<button type="button" class="btn btn-sm btn-danger" id="delVolGroupBtn">Xoá cả đợt (${groupSiblings.length} tập)</button>`
              : ""
          }
        </div>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn-sm" id="backSecBtn">Quay lại</button>
          <button type="submit" class="btn btn-sm btn-primary">${v ? "Lưu" : "Thêm tập"}</button>
        </div>
      </div>
    </form>`;

  openModal(`${sec.name} — ${v ? `Tập ${v.number}` : `Thêm tập ${defaultNum}`}`, html, (body) => {
    const form = body.querySelector("#volForm");
    const previewEl = body.querySelector("#volImgPreview");
    const clearBtn = body.querySelector("#clearVolImgBtn");
    const coverIn = body.querySelector("#volCoverInput");
    const paidIn = body.querySelector("#volPaidInput");
    const ckRow = body.querySelector("#volCkRow");
    const ckMeta = body.querySelector("#volCkMeta");
    let activeCk = null;

    const refreshCkInfo = () => {
      const cp = Math.max(0, Number(coverIn.value) || 0);
      const pp = Math.max(0, Number(paidIn.value) || 0);
      ckRow.querySelectorAll(".ck-btn").forEach((b) => {
        const p = Number(b.dataset.ck);
        const expected = Math.round(cp * (1 - p / 100));
        b.classList.toggle("active", cp > 0 && pp === expected);
      });
      if (cp > 0 && pp <= cp) {
        const saved = cp - pp;
        const pct = ((saved / cp) * 100).toFixed(1).replace(/\.0$/, "");
        ckMeta.style.color = "var(--forest)";
        ckMeta.textContent = saved > 0 ? `Đang giảm ${pct}% (tiết kiệm ${fmtMoney(saved)})` : "Mua đúng giá bìa (0%)";
      } else if (cp > 0 && pp > cp) {
        ckMeta.style.color = "var(--accent)";
        ckMeta.textContent = `Chênh cao hơn giá bìa +${fmtMoney(pp - cp)}`;
      } else {
        ckMeta.textContent = "";
      }
    };

    ckRow.querySelectorAll(".ck-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pct = Number(btn.dataset.ck);
        activeCk = pct;
        const cp = Math.max(0, Number(coverIn.value) || 0);
        paidIn.value = Math.round(cp * (1 - pct / 100));
        refreshCkInfo();
      });
    });

    coverIn.addEventListener("input", () => {
      if (activeCk !== null) {
        const cp = Math.max(0, Number(coverIn.value) || 0);
        paidIn.value = Math.round(cp * (1 - activeCk / 100));
      }
      refreshCkInfo();
    });

    paidIn.addEventListener("input", () => {
      activeCk = null;
      refreshCkInfo();
    });
    refreshCkInfo();

    const setVolPreview = (url) => {
      currentImg = url || "";
      previewEl.innerHTML = currentImg ? `<img src="${esc(currentImg)}" alt="" />` : "Chưa có";
      previewEl.style.cursor = currentImg ? "zoom-in" : "default";
      clearBtn.style.display = currentImg ? "" : "none";
    };

    previewEl.addEventListener("click", () => {
      if (!currentImg) return;
      openImageLightbox(currentImg, `${s.title} — ${sec.name} (Tập ${defaultNum})`, () =>
        openVolumeForm(seriesId, sectionId, volId, prefillVolNum)
      );
    });

    const undoVolImgBtn = body.querySelector("#undoVolImgBtn");
    const volLegacyChk = body.querySelector("#volLegacyChk");
    const volDateInput = body.querySelector("#volDateInput");
    let clearedVolImgBackup = "";

    if (volLegacyChk && volDateInput) {
      const syncVolLegacyUI = () => {
        volDateInput.style.opacity = volLegacyChk.checked ? "0.45" : "1";
      };
      volLegacyChk.addEventListener("change", syncVolLegacyUI);
      syncVolLegacyUI();
    }

    clearBtn.addEventListener("click", () => {
      if (currentImg) clearedVolImgBackup = currentImg;
      setVolPreview("");
      if (undoVolImgBtn && clearedVolImgBackup) undoVolImgBtn.style.display = "";
      showToast("Đã xoá ảnh tập — bấm 'Hoàn tác ảnh' nếu lỡ tay.");
    });

    if (undoVolImgBtn) {
      undoVolImgBtn.addEventListener("click", () => {
        if (!clearedVolImgBackup) return;
        setVolPreview(clearedVolImgBackup);
        clearedVolImgBackup = "";
        undoVolImgBtn.style.display = "none";
        showToast("Đã khôi phục ảnh tập.");
      });
    }

    body.querySelector("#volImgInput").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const cropped = await openImageCropper(file, { ratio: 2 / 3, maxW: 360, maxH: 540, quality: 0.76, title: `Cắt ảnh tập ${defaultNum}` });
      if (cropped) {
        setVolPreview(cropped);
        if (undoVolImgBtn) undoVolImgBtn.style.display = "none";
      }
    });

    body.querySelector("#backSecBtn").addEventListener("click", () => openSectionDetail(seriesId, sectionId));

    const delBtn = body.querySelector("#delVolBtn");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        pushUndo(`xoá tập ${v.number} (${s.title})`);
        sec.volumes = (sec.volumes || []).filter((x) => x.id !== volId);
        saveState();
        renderBooks();
        renderSpending();
        openSectionDetail(seriesId, sectionId);
        SFX.del();
      showToast(`Đã xoá tập ${v.number}.`, { undoable: true });
      });
    }

    const delGrpBtn = body.querySelector("#delVolGroupBtn");
    if (delGrpBtn && v?.groupId) {
      delGrpBtn.addEventListener("click", () => {
        if (!confirm(`Xoá toàn bộ ${groupSiblings.length} tập thuộc ${v.groupLabel || "đợt này"}?`)) return;
        pushUndo(`xoá đợt ${groupSiblings.length} tập (${s.title})`);
        sec.volumes = (sec.volumes || []).filter((x) => x.groupId !== v.groupId);
        saveState();
        renderBooks();
        renderSpending();
        openSectionDetail(seriesId, sectionId);
        SFX.del();
      showToast(`Đã xoá ${groupSiblings.length} tập.`, { undoable: true });
      });
    }

    const commitVol = (addAnother) => {
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const rec = {
        id: v?.id || uid(),
        number: Number(fd.get("number")),
        coverPrice: Math.max(0, Number(fd.get("coverPrice")) || 0),
        paidPrice: Math.max(0, Number(fd.get("paidPrice")) || 0),
        date: fd.get("date") || todayISO(),
        isLegacy: Boolean(volLegacyChk && volLegacyChk.checked),
        image: currentImg,
        readState: fd.get("readState") || "Chưa đọc",
        lentTo: (fd.get("lentTo") || "").trim(),
        note: fd.get("note").trim(),
        groupId: v?.groupId || "",
        groupLabel: v?.groupLabel || "",
      };
      sec.volumes = sec.volumes || [];
      if (v) {
        pushUndo(`sửa tập ${v.number} (${s.title})`);
        const idx = sec.volumes.findIndex((x) => x.id === volId);
        sec.volumes[idx] = rec;
      } else {
        sec.volumes.push(rec);
      }
      saveState();
      renderBooks();
      renderSpending();
      if (addAnother) {
        const nextN = Math.floor(rec.number) + 1;
        showToast(`Đã lưu Tập ${rec.number} — nhập tiếp Tập ${nextN}!`);
        openVolumeForm(seriesId, sectionId, null, nextN);
      } else {
        openSectionDetail(seriesId, sectionId);
        showToast(v ? "Đã lưu tập." : `Đã thêm tập ${rec.number}.`);
      }
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      commitVol(false);
    });

    const nextVolBtn = body.querySelector("#saveAndNextVolBtn");
    if (nextVolBtn) {
      nextVolBtn.addEventListener("click", () => commitVol(true));
    }
  });
}

// Thêm nhiều tập / Boxset vào trong 1 Mục (hỗ trợ nút CK 0–30% cho cả 2 chế độ giá!)
function openBulkVolumeForm(seriesId, sectionId) {
  const s = state.series.find((x) => x.id === seriesId);
  const sec = s ? (s.sections || []).find((x) => x.id === sectionId) : null;
  if (!s || !sec) return;
  const maxNum = (sec.volumes || []).reduce((m, x) => Math.max(m, Number(x.number) || 0), 0);
  const looksLikeBox = /box|set|combo|hộp/i.test(sec.name);
  let sharedImg = "";

  const html = `
    <form id="bulkVolForm" class="form-grid">
      <div class="form-row-2">
        <div class="field">
          <label>Từ tập *</label>
          <input name="from" type="number" min="1" required value="${maxNum + 1}" />
        </div>
        <div class="field">
          <label>Đến tập *</label>
          <input name="to" type="number" min="1" required value="${maxNum + (looksLikeBox ? 5 : 10)}" />
        </div>
      </div>

      <div class="field">
        <label>Cách nhập giá</label>
        <select name="priceMode" id="bulkPriceModeSel">
          <option value="total" ${looksLikeBox ? "selected" : ""}>Tổng giá cả đợt / Boxset (tự chia đều)</option>
          <option value="unit" ${!looksLikeBox ? "selected" : ""}>Giá từng tập + % chiết khấu</option>
        </select>
      </div>

      <div class="form-row-2" id="bulkTotalPrices" style="${looksLikeBox ? "" : "display:none;"}">
        <div class="field">
          <label>Tổng giá bìa cả bộ (VNĐ)</label>
          <input name="totalCover" type="number" min="0" value="250000" />
        </div>
        <div class="field">
          <label>Tổng thực chi (VNĐ)</label>
          <input name="totalPaid" type="number" min="0" value="212500" />
        </div>
      </div>

      <div class="form-row-2" id="bulkUnitPrices" style="${!looksLikeBox ? "" : "display:none;"}">
        <div class="field">
          <label>Giá bìa / tập (VNĐ)</label>
          <input name="unitCover" type="number" min="0" value="35000" />
        </div>
        <div class="field">
          <label>Chiết khấu (%)</label>
          <input name="discount" type="number" min="0" max="100" value="15" />
        </div>
      </div>

      <div>
        <div class="small-muted" style="margin-bottom:3px;">Chọn nhanh % chiết khấu:</div>
        <div class="ck-row" id="bulkCkRow">
          ${CK_PRESETS.map((pct) => `<button type="button" class="ck-btn mono" data-bck="${pct}">-${pct}%</button>`).join("")}
        </div>
      </div>

      <div class="boxset-hint mono" id="bulkPreview"></div>

      <div class="field">
        <label>Ảnh chung cho đợt / hộp Boxset (tuỳ chọn)</label>
        <div class="cover-preview-wrap">
          <div class="cover-preview" id="bulkImgPreview">Chưa có</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            <label class="btn btn-sm" style="margin:0;">
              Chọn ảnh
              <input type="file" id="bulkImgInput" accept="image/*" style="display:none;" />
            </label>
            <button type="button" class="btn btn-sm btn-danger" id="clearBulkImgBtn" style="display:none;">Xoá ảnh</button>
            <button type="button" class="btn btn-sm" id="undoBulkImgBtn" style="display:none;">Hoàn tác ảnh</button>
          </div>
        </div>
      </div>

      <div class="form-row-2">
        <div class="field">
          <label>Ngày mua</label>
          <input name="date" type="date" value="${todayISO()}" />
        </div>
        <div class="field">
          <label>Ghi chú</label>
          <input name="note" placeholder="VD: Box cứng + postcard..." />
        </div>
      </div>
      <label class="check-inline">
        <input type="checkbox" id="bulkLegacyChk" />
        <span>Mua từ trước (không tính vào hạn mức tháng này)</span>
      </label>

      <div class="modal-actions">
        <button type="button" class="btn btn-sm" id="backBulkBtn">Quay lại</button>
        <button type="submit" class="btn btn-sm btn-primary">Thêm hàng loạt</button>
      </div>
    </form>`;

  openModal(`${sec.name} — Thêm nhiều tập`, html, (body) => {
    const form = body.querySelector("#bulkVolForm");
    const modeSel = body.querySelector("#bulkPriceModeSel");
    const totalWrap = body.querySelector("#bulkTotalPrices");
    const unitWrap = body.querySelector("#bulkUnitPrices");
    const preview = body.querySelector("#bulkPreview");
    const imgPrev = body.querySelector("#bulkImgPreview");
    const clearImgBtn = body.querySelector("#clearBulkImgBtn");
    const bulkCkRow = body.querySelector("#bulkCkRow");

    const updateUI = () => {
      const isTotal = modeSel.value === "total";
      totalWrap.style.display = isTotal ? "grid" : "none";
      unitWrap.style.display = isTotal ? "none" : "grid";
      const f = Math.round(Number(form.from.value) || 0);
      const t = Math.round(Number(form.to.value) || 0);
      const count = t - f + 1;

      // Highlight matching CK chip
      bulkCkRow.querySelectorAll(".ck-btn").forEach((b) => {
        const p = Number(b.dataset.bck);
        if (isTotal) {
          const tc = Math.max(0, Number(form.totalCover.value) || 0);
          const tp = Math.max(0, Number(form.totalPaid.value) || 0);
          b.classList.toggle("active", tc > 0 && tp === Math.round(tc * (1 - p / 100)));
        } else {
          b.classList.toggle("active", Number(form.discount.value) === p);
        }
      });

      if (count < 1) {
        preview.textContent = "Đến tập phải lớn hơn hoặc bằng Từ tập.";
        return;
      }
      if (isTotal) {
        const tc = Math.max(0, Number(form.totalCover.value) || 0);
        const tp = Math.max(0, Number(form.totalPaid.value) || 0);
        const avg = Math.round(tp / count);
        preview.textContent = `${count} tập (Tập ${f}–${t}) · Tổng ${fmtMoney(tp)} (~${fmtMoney(avg)}/tập)` +
          (tc > tp ? ` · Tiết kiệm ${fmtMoney(tc - tp)}` : "");
      } else {
        const cp = Math.max(0, Number(form.unitCover.value) || 0);
        const d = Math.min(100, Math.max(0, Number(form.discount.value) || 0));
        const paid = Math.round(cp * (1 - d / 100));
        preview.textContent = `${count} tập (Tập ${f}–${t}) · ${fmtMoney(paid)}/tập (Tổng ${fmtMoney(paid * count)})`;
      }
    };

    bulkCkRow.querySelectorAll(".ck-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pct = Number(btn.dataset.bck);
        if (modeSel.value === "total") {
          const tc = Math.max(0, Number(form.totalCover.value) || 0);
          form.totalPaid.value = Math.round(tc * (1 - pct / 100));
        } else {
          form.discount.value = pct;
        }
        updateUI();
      });
    });

    modeSel.addEventListener("change", updateUI);
    form.addEventListener("input", updateUI);
    updateUI();

    const undoBulkImgBtn = body.querySelector("#undoBulkImgBtn");
    let clearedBulkImgBackup = "";

    clearImgBtn.addEventListener("click", () => {
      if (sharedImg) clearedBulkImgBackup = sharedImg;
      sharedImg = "";
      imgPrev.innerHTML = "Chưa có";
      clearImgBtn.style.display = "none";
      if (undoBulkImgBtn && clearedBulkImgBackup) undoBulkImgBtn.style.display = "";
    });

    if (undoBulkImgBtn) {
      undoBulkImgBtn.addEventListener("click", () => {
        if (!clearedBulkImgBackup) return;
        sharedImg = clearedBulkImgBackup;
        clearedBulkImgBackup = "";
        imgPrev.innerHTML = `<img src="${esc(sharedImg)}" alt="" />`;
        clearImgBtn.style.display = "";
        undoBulkImgBtn.style.display = "none";
        showToast("Đã khôi phục ảnh.");
      });
    }

    body.querySelector("#bulkImgInput").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const cropped = await openImageCropper(file, { ratio: looksLikeBox ? 4 / 3 : 2 / 3, maxW: 400, maxH: 520, quality: 0.74, title: "Cắt ảnh đợt tập / Boxset" });
      if (cropped) {
        sharedImg = cropped;
        imgPrev.innerHTML = `<img src="${esc(sharedImg)}" alt="" />`;
        clearImgBtn.style.display = "";
        if (undoBulkImgBtn) undoBulkImgBtn.style.display = "none";
      }
    });

    body.querySelector("#backBulkBtn").addEventListener("click", () => openSectionDetail(seriesId, sectionId));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = Math.round(Number(form.from.value));
      const t = Math.round(Number(form.to.value));
      if (t < f || t - f > 150) {
        showToast("Khoảng tập không hợp lệ (tối đa 150 tập/lần).");
        return;
      }
      const isTotal = modeSel.value === "total";
      const count = addBatchVolumesToSection(sec, {
        from: f,
        to: t,
        priceMode: isTotal ? "total" : "unit",
        coverInput: isTotal ? form.totalCover.value : form.unitCover.value,
        paidInput: form.totalPaid.value,
        discount: form.discount.value,
        date: form.date.value || todayISO(),
        isLegacy: Boolean(body.querySelector("#bulkLegacyChk")?.checked),
        image: sharedImg,
        note: form.note.value.trim(),
      });
      saveState();
      renderBooks();
      renderSpending();
      openSectionDetail(seriesId, sectionId);
      showToast(`Đã thêm ${count} tập vào "${sec.name}".`);
    });
  });
}

// Lightbox xem ảnh to chung cho Tập & Quà
function openImageLightbox(imgSrc, caption, onBack = null) {
  const html = `
    <div class="img-zoom-wrap">
      <img src="${esc(imgSrc)}" alt="${esc(caption)}" />
      <div style="font-weight:600; font-size:13.5px;">${esc(caption)}</div>
      <div class="modal-actions" style="justify-content:flex-end;">
        <button type="button" class="btn btn-sm btn-primary" id="lbDoneBtn">${onBack ? "Quay lại" : "Đóng"}</button>
      </div>
    </div>`;
  openModal("Xem ảnh", html, (body) => {
    body.querySelector("#lbDoneBtn").addEventListener("click", () => {
      if (typeof onBack === "function") onBack();
      else closeModal();
    });
  });
}
