"use strict";

// ============================
// TRÌNH CẮT ẢNH TRỰC TIẾP (KÉO + CHỤM 2 NGÓN + XOAY + TỶ LỆ BÌA)
// ============================
function openImageCropper(file, opts = {}) {
  const defaultRatio = opts.ratio !== undefined ? opts.ratio : 2 / 3;
  const maxW = opts.maxW || 360;
  const maxH = opts.maxH || 540;
  const quality = opts.quality || 0.76;
  const title = opts.title || "Cắt ảnh";

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const backdrop = document.getElementById("cropBackdrop");
        const titleEl = document.getElementById("cropModalTitle");
        const wrap = document.getElementById("cropStageWrap");
        const canvas = document.getElementById("cropCanvas");
        const ctx = canvas.getContext("2d");
        const zoomSlider = document.getElementById("cropZoomSlider");
        const zoomValEl = document.getElementById("cropZoomVal");
        const ratioRow = document.getElementById("cropRatioBtns");
        const rotateBtn = document.getElementById("cropRotateBtn");
        const cancelTopBtn = document.getElementById("cropCancelTopBtn");
        const useOrigBtn = document.getElementById("cropUseOriginalBtn");
        const confirmBtn = document.getElementById("cropConfirmBtn");

        titleEl.textContent = title;
        backdrop.classList.add("open");

        let aspect = defaultRatio; // 0 = gốc (giữ tỷ lệ gốc của ảnh)
        let rotation = 0;          // 0, 90, 180, 270
        let zoom = 1;
        let panX = 0;
        let panY = 0;

        let stageW = 340;
        let stageH = 310;
        let boxW = 180;
        let boxH = 270;
        let boxX = 80;
        let boxY = 20;
        let baseScale = 1;

        const getRotDims = () => {
          const swapped = rotation % 180 !== 0;
          return { rw: swapped ? img.height : img.width, rh: swapped ? img.width : img.height };
        };

        const computeGeometry = () => {
          const rect = wrap.getBoundingClientRect();
          stageW = Math.max(220, Math.round(rect.width));
          stageH = Math.max(220, Math.round(rect.height));
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.round(stageW * dpr);
          canvas.height = Math.round(stageH * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const { rw, rh } = getRotDims();
          const effectiveAspect = aspect > 0 ? aspect : rw / rh;
          const pad = 22;
          const availW = stageW - pad * 2;
          const availH = stageH - pad * 2;
          if (availW / availH > effectiveAspect) {
            boxH = availH;
            boxW = boxH * effectiveAspect;
          } else {
            boxW = availW;
            boxH = boxW / effectiveAspect;
          }
          boxX = (stageW - boxW) / 2;
          boxY = (stageH - boxH) / 2;
          // Scale tối thiểu để ảnh luôn phủ kín khung cắt
          baseScale = Math.max(boxW / rw, boxH / rh);
        };

        const clampPan = () => {
          const { rw, rh } = getRotDims();
          const drawW = rw * baseScale * zoom;
          const drawH = rh * baseScale * zoom;
          const maxPanX = Math.max(0, (drawW - boxW) / 2);
          const maxPanY = Math.max(0, (drawH - boxH) / 2);
          panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
          panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
        };

        const drawStage = () => {
          clampPan();
          ctx.clearRect(0, 0, stageW, stageH);
          ctx.fillStyle = "#0F0E0D";
          ctx.fillRect(0, 0, stageW, stageH);

          // Vẽ ảnh theo tâm stage + pan + xoay + scale
          ctx.save();
          ctx.translate(stageW / 2 + panX, stageH / 2 + panY);
          ctx.rotate((rotation * Math.PI) / 180);
          const totalScale = baseScale * zoom;
          ctx.drawImage(
            img,
            (-img.width * totalScale) / 2,
            (-img.height * totalScale) / 2,
            img.width * totalScale,
            img.height * totalScale
          );
          ctx.restore();

          // Lớp phủ tối xung quanh khung cắt
          ctx.fillStyle = "rgba(10, 9, 8, 0.62)";
          ctx.fillRect(0, 0, stageW, boxY);
          ctx.fillRect(0, boxY + boxH, stageW, stageH - (boxY + boxH));
          ctx.fillRect(0, boxY, boxX, boxH);
          ctx.fillRect(boxX + boxW, boxY, stageW - (boxX + boxW), boxH);

          // Khung cắt + lưới 3x3
          ctx.strokeStyle = "#F6F5F1";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

          ctx.strokeStyle = "rgba(246, 245, 241, 0.28)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(boxX + boxW / 3, boxY);
          ctx.lineTo(boxX + boxW / 3, boxY + boxH);
          ctx.moveTo(boxX + (boxW * 2) / 3, boxY);
          ctx.lineTo(boxX + (boxW * 2) / 3, boxY + boxH);
          ctx.moveTo(boxX, boxY + boxH / 3);
          ctx.lineTo(boxX + boxW, boxY + boxH / 3);
          ctx.moveTo(boxX, boxY + (boxH * 2) / 3);
          ctx.lineTo(boxX + boxW, boxY + (boxH * 2) / 3);
          ctx.stroke();

          zoomSlider.value = String(zoom);
          zoomValEl.textContent = zoom.toFixed(1) + "x";
        };

        // Cập nhật nút tỷ lệ active
        const syncRatioBtns = () => {
          ratioRow.querySelectorAll("[data-cratio]").forEach((b) => {
            const r = Number(b.dataset.cratio);
            const match = r === 0 ? aspect === 0 : aspect > 0 && Math.abs(r - aspect) < 0.05;
            b.classList.toggle("active", match);
          });
        };

        // Kéo 1 ngón & Chụm 2 ngón (Pinch-to-zoom trên iPhone)
        const pointers = new Map();
        let lastDragX = 0;
        let lastDragY = 0;
        let pinchStartDist = 0;
        let pinchStartZoom = 1;

        const onPointerDown = (e) => {
          e.preventDefault();
          canvas.setPointerCapture?.(e.pointerId);
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.size === 1) {
            lastDragX = e.clientX;
            lastDragY = e.clientY;
          } else if (pointers.size === 2) {
            const pts = [...pointers.values()];
            pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            pinchStartZoom = zoom;
          }
        };

        const onPointerMove = (e) => {
          if (!pointers.has(e.pointerId)) return;
          e.preventDefault();
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.size === 1) {
            const dx = e.clientX - lastDragX;
            const dy = e.clientY - lastDragY;
            lastDragX = e.clientX;
            lastDragY = e.clientY;
            panX += dx;
            panY += dy;
            drawStage();
          } else if (pointers.size === 2) {
            const pts = [...pointers.values()];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            if (pinchStartDist > 0) {
              zoom = Math.max(1, Math.min(3.5, pinchStartZoom * (dist / pinchStartDist)));
              drawStage();
            }
          }
        };

        const onPointerUp = (e) => {
          pointers.delete(e.pointerId);
          if (pointers.size === 1) {
            const rem = [...pointers.values()][0];
            lastDragX = rem.x;
            lastDragY = rem.y;
          }
        };

        const onZoomInput = () => {
          zoom = Math.max(1, Math.min(3.5, Number(zoomSlider.value) || 1));
          drawStage();
        };

        const onRatioClick = (e) => {
          const btn = e.target.closest("[data-cratio]");
          if (!btn) return;
          aspect = Number(btn.dataset.cratio);
          zoom = 1;
          panX = 0;
          panY = 0;
          syncRatioBtns();
          computeGeometry();
          drawStage();
        };

        const onRotateClick = () => {
          rotation = (rotation + 90) % 360;
          zoom = 1;
          panX = 0;
          panY = 0;
          computeGeometry();
          drawStage();
        };

        const cleanup = () => {
          canvas.removeEventListener("pointerdown", onPointerDown);
          canvas.removeEventListener("pointermove", onPointerMove);
          canvas.removeEventListener("pointerup", onPointerUp);
          canvas.removeEventListener("pointercancel", onPointerUp);
          zoomSlider.removeEventListener("input", onZoomInput);
          ratioRow.removeEventListener("click", onRatioClick);
          rotateBtn.removeEventListener("click", onRotateClick);
          cancelTopBtn.removeEventListener("click", onCancel);
          useOrigBtn.removeEventListener("click", onUseOrig);
          confirmBtn.removeEventListener("click", onConfirm);
          backdrop.classList.remove("open");
        };

        const onCancel = () => {
          cleanup();
          resolve(null);
        };

        const onUseOrig = async () => {
          cleanup();
          try {
            const compressed = await compressImageFile(file, maxW, maxH, quality);
            resolve(compressed);
          } catch {
            resolve(null);
          }
        };

        const onConfirm = () => {
          clampPan();
          const outRatio = boxW / boxH;
          let outW = maxW;
          let outH = Math.round(outW / outRatio);
          if (outH > maxH) {
            outH = maxH;
            outW = Math.round(outH * outRatio);
          }
          const outCanvas = document.createElement("canvas");
          outCanvas.width = Math.max(1, outW);
          outCanvas.height = Math.max(1, outH);
          const octx = outCanvas.getContext("2d");
          octx.fillStyle = "#FFFFFF";
          octx.fillRect(0, 0, outCanvas.width, outCanvas.height);

          const scaleToOut = outCanvas.width / boxW;
          const totalScale = baseScale * zoom * scaleToOut;
          octx.save();
          octx.translate(outCanvas.width / 2 + panX * scaleToOut, outCanvas.height / 2 + panY * scaleToOut);
          octx.rotate((rotation * Math.PI) / 180);
          octx.drawImage(
            img,
            (-img.width * totalScale) / 2,
            (-img.height * totalScale) / 2,
            img.width * totalScale,
            img.height * totalScale
          );
          octx.restore();

          const dataUrl = outCanvas.toDataURL("image/jpeg", quality);
          cleanup();
          resolve(dataUrl);
        };

        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("pointercancel", onPointerUp);
        zoomSlider.addEventListener("input", onZoomInput);
        ratioRow.addEventListener("click", onRatioClick);
        rotateBtn.addEventListener("click", onRotateClick);
        cancelTopBtn.addEventListener("click", onCancel);
        useOrigBtn.addEventListener("click", onUseOrig);
        confirmBtn.addEventListener("click", onConfirm);

        syncRatioBtns();
        requestAnimationFrame(() => {
          computeGeometry();
          drawStage();
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Chia tổng tiền Boxset đều cho nhiều tập sao cho tổng đúng từng đồng
function splitTotalExact(total, count) {
  const cleanTotal = Math.max(0, Math.round(Number(total) || 0));
  const base = Math.floor(cleanTotal / count);
  const rem = cleanTotal - base * count;
  return Array.from({ length: count }, (_, idx) => base + (idx < rem ? 1 : 0));
}

function addBatchVolumesToSection(section, { from, to, priceMode, coverInput, paidInput, discount, date, isLegacy = false, image, note }) {
  const f = Math.round(Number(from));
  const t = Math.round(Number(to));
  const count = t - f + 1;
  let coverParts = [];
  let paidParts = [];
  if (priceMode === "total") {
    coverParts = splitTotalExact(coverInput, count);
    paidParts = splitTotalExact(paidInput, count);
  } else {
    const cp = Math.max(0, Math.round(Number(coverInput) || 0));
    const disc = Math.min(100, Math.max(0, Number(discount) || 0));
    const paid = Math.round(cp * (1 - disc / 100));
    coverParts = Array(count).fill(cp);
    paidParts = Array(count).fill(paid);
  }
  const groupId = count > 1 ? "grp_" + uid() : "";
  const groupLabel = count > 1 ? `Đợt tập ${f}–${t}` : "";
  section.volumes = section.volumes || [];
  for (let i = 0; i < count; i++) {
    section.volumes.push({
      id: uid(),
      number: f + i,
      coverPrice: coverParts[i],
      paidPrice: paidParts[i],
      date: date || todayISO(),
      isLegacy: Boolean(isLegacy),
      image: image || "",
      readState: "Chưa đọc",
      lentTo: "",
      note: note || "",
      groupId,
      groupLabel,
    });
  }
  return count;
}
