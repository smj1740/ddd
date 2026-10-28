const FORMAT_CATALOG = [
  { id: "jpeg", label: "JPEG", badge: "JPG", ext: ["jpg", "jpeg", "jfif"], mime: ["image/jpeg"], color: "#e38b2a" },
  { id: "png", label: "PNG", badge: "PNG", ext: ["png"], mime: ["image/png"], color: "#2f6fdb" },
  { id: "webp", label: "WEBP", badge: "WEB", ext: ["webp"], mime: ["image/webp"], color: "#0f9f6e" },
  { id: "gif", label: "GIF", badge: "GIF", ext: ["gif"], mime: ["image/gif"], color: "#c026d3" },
  { id: "bmp", label: "BMP", badge: "BMP", ext: ["bmp", "dib"], mime: ["image/bmp", "image/x-bmp"], color: "#475569" },
  { id: "svg", label: "SVG", badge: "SVG", ext: ["svg"], mime: ["image/svg+xml"], color: "#ea580c" },
  { id: "ico", label: "ICO", badge: "ICO", ext: ["ico"], mime: ["image/x-icon", "image/vnd.microsoft.icon"], color: "#7c3aed" },
  { id: "avif", label: "AVIF", badge: "AV1", ext: ["avif"], mime: ["image/avif"], color: "#0e7490" },
  { id: "tiff", label: "TIFF", badge: "TIF", ext: ["tif", "tiff"], mime: ["image/tiff"], color: "#1d4ed8" },
  { id: "heic", label: "HEIC", badge: "HEI", ext: ["heic", "heif"], mime: ["image/heic", "image/heif"], color: "#be185d" },
];

const RATIOS = [
  { id: "1:1", w: 1, h: 1, hint: "정사각" },
  { id: "3:4", w: 3, h: 4, hint: "세로" },
  { id: "4:3", w: 4, h: 3, hint: "가로" },
  { id: "9:16", w: 9, h: 16, hint: "스토리" },
  { id: "16:9", w: 16, h: 9, hint: "와이드" },
  { id: "custom", w: 4, h: 5, hint: "직접 입력" },
];

const EXPORTABLE = new Set(["jpeg", "png", "webp"]);
const state = {
  jobs: [],
  selectedId: null,
  processing: false,
  pickMode: "add",
  view: "all",
  apiKey: localStorage.getItem("gemini_api_key") || "",
};

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  pickFiles: document.getElementById("pick-files"),
  formatGrid: document.getElementById("format-grid"),
  ratioGrid: document.getElementById("ratio-grid"),
  customRatio: document.getElementById("custom-ratio"),
  customW: document.getElementById("custom-w"),
  customH: document.getElementById("custom-h"),
  padColor: document.getElementById("pad-color"),
  padColorWrap: document.getElementById("pad-color-wrap"),
  downloadAll: document.getElementById("download-all"),
  enhance: document.getElementById("enhance"),
  classify: document.getElementById("classify"),
  apiKey: document.getElementById("api-key"),
  controlsHint: document.getElementById("controls-hint"),
  queuePanel: document.getElementById("queue-panel"),
  queueSummary: document.getElementById("queue-summary"),
  fileList: document.getElementById("file-list"),
  galleryView: document.getElementById("gallery-view"),
  dropzoneEmpty: document.getElementById("dropzone-empty"),
  dropzonePreview: document.getElementById("dropzone-preview"),
  previewCanvas: document.getElementById("preview-canvas"),
  previewName: document.getElementById("preview-name"),
  pickMore: document.getElementById("pick-more"),
  previewStage: document.getElementById("preview-stage"),
};

function defaultSettings() {
  return {
    ratioId: "1:1",
    customW: 4,
    customH: 5,
    mode: "pad",
    padColor: "#ffffff",
  };
}

function selectedJob() {
  return state.jobs.find((job) => job.id === state.selectedId) || null;
}

function cloneSettings(source) {
  return { ...(source || defaultSettings()) };
}

function jobRatio(job) {
  const settings = job.settings || defaultSettings();
  if (settings.ratioId === "custom") {
    const w = Math.max(1, Number(settings.customW) || 1);
    const h = Math.max(1, Number(settings.customH) || 1);
    return { w, h };
  }
  const found = RATIOS.find((r) => r.id === settings.ratioId) || RATIOS[0];
  return { w: found.w, h: found.h };
}

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function detectFormat(file) {
  const ext = extOf(file.name);
  return FORMAT_CATALOG.find((f) => f.mime.includes(file.type) || f.ext.includes(ext)) || null;
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

function ratioLabel(w, h) {
  const g = gcd(w, h);
  return `${w / g}x${h / g}`;
}

function stemAndExt(filename) {
  const i = filename.lastIndexOf(".");
  if (i < 0) return { stem: filename, ext: "" };
  return { stem: filename.slice(0, i), ext: filename.slice(i + 1).toLowerCase() };
}

function outputName(job, width, height) {
  const { stem } = stemAndExt(job.file.name);
  const ratio = jobRatio(job);
  const mode = job.settings.mode;
  const outExt = EXPORTABLE.has(job.format?.id) ? (job.format.id === "jpeg" ? "jpg" : job.format.id) : "png";
  const extra = job.enhanced ? "_hd" : "";
  return `${stem}_resized_${ratioLabel(ratio.w, ratio.h)}_${mode}_${width}x${height}${extra}.${outExt}`;
}

function zipName(prefix = "스마트사진편집_resized") {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `${prefix}_${stamp}.zip`;
}

function renderFormats() {
  els.formatGrid.innerHTML = FORMAT_CATALOG.map(
    (fmt) => `
      <li class="format-chip" title="${fmt.ext.map((e) => "." + e).join(", ")}">
        <span class="format-icon" style="background:${fmt.color}">${fmt.badge}</span>
        ${fmt.label}
      </li>`
  ).join("");
}

function renderRatios(activeId) {
  els.ratioGrid.innerHTML = RATIOS.map(
    (r) => `
      <button type="button" class="ratio-btn ${activeId === r.id ? "active" : ""}" data-ratio="${r.id}">
        <strong>${r.id === "custom" ? "커스텀" : r.id}</strong>
        <small>${r.hint}</small>
      </button>`
  ).join("");
}

function setPadColorVisibility(mode) {
  els.padColorWrap.style.opacity = mode === "pad" ? "1" : "0.4";
  els.padColor.disabled = mode !== "pad";
}

function syncUiFromJob(job) {
  const settings = job?.settings || defaultSettings();
  renderRatios(settings.ratioId);
  els.customRatio.hidden = settings.ratioId !== "custom";
  els.customW.value = settings.customW;
  els.customH.value = settings.customH;
  document.querySelectorAll("input[name='fit-mode']").forEach((input) => {
    input.checked = input.value === settings.mode;
  });
  els.padColor.value = settings.padColor;
  setPadColorVisibility(settings.mode);
  els.controlsHint.textContent = job
    ? `${job.file.name}에만 적용됩니다.`
    : "사진을 고르면 이 사진에만 비율이 적용됩니다.";
}

function applyControlChange(patch) {
  const job = selectedJob();
  if (!job) return;
  Object.assign(job.settings, patch);
  syncUiFromJob(job);
  showPreview(job.id);
  scheduleProcess(job);
}

function canvasSizeForRatio(srcW, srcH, rw, rh) {
  const target = rw / rh;
  const src = srcW / srcH;
  if (src > target) return { width: srcW, height: Math.round(srcW / target) };
  return { height: srcH, width: Math.round(srcH * target) };
}

function computeLayout(srcW, srcH, mode, rw, rh) {
  const box = canvasSizeForRatio(srcW, srcH, rw, rh);
  if (mode === "stretch") {
    return { ...box, dx: 0, dy: 0, drawW: box.width, drawH: box.height };
  }
  const target = rw / rh;
  const src = srcW / srcH;
  if (mode === "pad") {
    if (src > target) {
      return { width: srcW, height: Math.round(srcW / target), dx: 0, dy: Math.round((Math.round(srcW / target) - srcH) / 2), drawW: srcW, drawH: srcH };
    }
    const width = Math.round(srcH * target);
    return { width, height: srcH, dx: Math.round((width - srcW) / 2), dy: 0, drawW: srcW, drawH: srcH };
  }
  if (src > target) {
    const width = Math.round(srcH * target);
    const sx = Math.round((srcW - width) / 2);
    return { width, height: srcH, sx, sy: 0, sw: width, sh: srcH, dx: 0, dy: 0, drawW: width, drawH: srcH };
  }
  const height = Math.round(srcW / target);
  const sy = Math.round((srcH - height) / 2);
  return { width: srcW, height, sx: 0, sy, sw: srcW, sh: height, dx: 0, dy: 0, drawW: srcW, drawH: height };
}

async function decodeWithImage(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}

async function decodeTiff(file) {
  if (typeof UTIF === "undefined") throw new Error("TIFF 디코더를 불러오지 못했습니다.");
  const buf = await file.arrayBuffer();
  const ifds = UTIF.decode(buf);
  if (!ifds.length) throw new Error("TIFF 이미지를 읽을 수 없습니다.");
  UTIF.decodeImage(buf, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const canvas = document.createElement("canvas");
  canvas.width = ifds[0].width;
  canvas.height = ifds[0].height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), canvas.width, canvas.height), 0, 0);
  return canvas;
}

async function decodeHeic(file) {
  if (typeof heic2any === "undefined") throw new Error("HEIC 변환기를 불러오지 못했습니다.");
  const converted = await heic2any({ blob: file, toType: "image/png" });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const url = URL.createObjectURL(blob);
  try {
    return await decodeWithImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeFile(file, format) {
  if (format?.id === "tiff") return decodeTiff(file);
  if (format?.id === "heic") return decodeHeic(file);
  const url = URL.createObjectURL(file);
  try {
    if (typeof createImageBitmap === "function" && format?.id !== "svg") {
      try {
        return await createImageBitmap(file);
      } catch {
        return await decodeWithImage(url);
      }
    }
    return await decodeWithImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지 인코딩에 실패했습니다."))), mime, quality);
  });
}

function mimeFor(format) {
  if (format?.id === "jpeg") return "image/jpeg";
  if (format?.id === "webp") return "image/webp";
  return "image/png";
}

async function ensureSource(job) {
  if (job.source) return job.source;
  job.source = await decodeFile(job.file, job.format);
  return job.source;
}

function paintJob(job, canvas) {
  const source = job.source;
  if (!source) return;
  const ratio = jobRatio(job);
  const mode = job.settings.mode;
  const layout = computeLayout(source.width, source.height, mode, ratio.w, ratio.h);
  canvas.width = Math.max(1, layout.width);
  canvas.height = Math.max(1, layout.height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mode === "pad") {
    ctx.fillStyle = job.settings.padColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (mode === "crop") {
    ctx.drawImage(source, layout.sx, layout.sy, layout.sw, layout.sh, layout.dx, layout.dy, layout.drawW, layout.drawH);
  } else {
    ctx.drawImage(source, layout.dx, layout.dy, layout.drawW, layout.drawH);
  }
}

function scrollToPreview() {
  const header = document.querySelector(".topbar");
  const offset = (header?.offsetHeight || 0) + 12;
  const top = els.dropzone.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function markSelectedCard() {
  document.querySelectorAll(".file-card").forEach((card) => {
    card.classList.toggle("selected", card.id === `job-${state.selectedId}`);
  });
}

async function showPreview(jobId, { scroll = false } = {}) {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return;
  state.selectedId = jobId;
  els.dropzone.classList.add("has-preview");
  els.dropzonePreview.hidden = false;
  els.previewName.textContent = job.file.name;
  syncUiFromJob(job);
  markSelectedCard();
  try {
    await ensureSource(job);
    paintJob(job, els.previewCanvas);
  } catch {
    els.previewName.textContent = `${job.file.name} · 미리보기를 열 수 없습니다`;
  }
  if (scroll) scrollToPreview();
}

function progressBarEl(job) {
  return document.querySelector(`#job-${job.id} .progress > span`);
}

function jobMetaLine(job) {
  const ratio = job.settings.ratioId === "custom" ? `${job.settings.customW}:${job.settings.customH}` : job.settings.ratioId;
  const modeLabel = { pad: "Padding", crop: "Crop", stretch: "늘이기" }[job.settings.mode] || job.settings.mode;
  const cat = job.category ? `<span class="category-tag">${job.category}</span>` : "";
  return `${(job.file.size / 1024).toFixed(0)} KB · ${job.format?.label || "?"} · ${ratio} · ${modeLabel}${cat}`;
}

function updateJobCard(job) {
  const card = document.getElementById(`job-${job.id}`);
  if (!card) return;
  const bar = card.querySelector(".progress > span");
  if (bar) bar.style.width = `${job.progress}%`;
  const status = card.querySelector(".status");
  if (status) {
    status.textContent = job.statusText;
    status.className = `status ${job.error ? "error" : job.done ? "done" : ""}`;
  }
  const btn = card.querySelector("[data-download]");
  if (btn) btn.disabled = !job.done || job.downloading;
  const meta = card.querySelector(".file-meta p");
  if (meta) meta.innerHTML = jobMetaLine(job);
  if (job.id === state.selectedId && job.source) paintJob(job, els.previewCanvas);
}

function fileCardHtml(job) {
  return `
    <li class="file-card" id="job-${job.id}">
      ${
        job.originalUrl || job.previewUrl
          ? `<img class="thumb" src="${job.originalUrl || job.previewUrl}" alt="${job.file.name} 미리보기" />`
          : `<div class="thumb placeholder">미리보기</div>`
      }
      <div class="file-meta">
        <h3 title="${job.file.name}">${job.file.name}</h3>
        <p>${jobMetaLine(job)}</p>
        <div class="progress" aria-label="다운로드 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${job.progress}">
          <span style="width:${job.progress}%"></span>
        </div>
      </div>
      <div class="file-actions">
        <span class="status ${job.error ? "error" : job.done ? "done" : ""}">${job.statusText}</span>
        <button type="button" class="btn small" data-download="${job.id}" ${job.done && !job.downloading ? "" : "disabled"}>다운로드</button>
        <button type="button" class="btn small danger" data-delete="${job.id}">삭제</button>
      </div>
    </li>`;
}

function groupedJobs() {
  const groups = new Map();
  for (const job of state.jobs) {
    const key = job.category || "미분류";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }
  return groups;
}

function renderGallery() {
  const groups = groupedJobs();
  els.galleryView.innerHTML = [...groups.entries()]
    .map(
      ([name, jobs]) => `
      <article class="gallery-group">
        <div class="gallery-head">
          <h3>${name} <small>(${jobs.length})</small></h3>
          <button type="button" class="btn ghost compact" data-gallery-zip="${name}" ${jobs.every((j) => j.done) ? "" : "disabled"}>이 갤러리 ZIP</button>
        </div>
        <ul class="file-list">${jobs.map(fileCardHtml).join("")}</ul>
      </article>`
    )
    .join("");
}

function renderJobs() {
  els.queuePanel.hidden = state.jobs.length === 0;
  const done = state.jobs.filter((j) => j.done).length;
  els.queueSummary.textContent = state.jobs.length
    ? `총 ${state.jobs.length}장 · 완료 ${done}장`
    : "아직 파일이 없습니다.";
  const showGallery = state.view === "gallery";
  if (showGallery) {
    els.fileList.innerHTML = "";
    renderGallery();
  } else {
    els.galleryView.innerHTML = "";
    els.fileList.innerHTML = state.jobs.map(fileCardHtml).join("");
  }
  els.fileList.hidden = showGallery;
  els.galleryView.hidden = !showGallery;
  markSelectedCard();
  refreshButtons();
}

function refreshButtons() {
  const ready = state.jobs.length > 0 && state.jobs.every((j) => j.done);
  const hasJobs = state.jobs.length > 0;
  els.downloadAll.disabled = !ready;
  els.enhance.disabled = !selectedJob() || state.processing;
  els.classify.disabled = !hasJobs || state.processing;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function saveZipBlob(blob, suggestedName) {
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: "ZIP 압축 파일", accept: { "application/zip": [".zip"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }
  const typed = window.prompt("저장할 ZIP 파일 이름을 입력하세요.", suggestedName);
  if (!typed) return false;
  downloadBlob(blob, typed.toLowerCase().endsWith(".zip") ? typed : `${typed}.zip`);
  return true;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function animateDownloadBar(job, duration) {
  const bar = progressBarEl(job);
  job.progress = 0;
  if (bar) {
    bar.style.transition = "none";
    bar.style.width = "0%";
    bar.getBoundingClientRect();
    bar.style.transition = `width ${duration}ms linear`;
    bar.style.width = "100%";
  }
  await wait(duration);
  job.progress = 100;
  if (bar) bar.style.transition = "";
}

async function downloadJob(job) {
  if (!job?.blob || job.downloading) return;
  job.downloading = true;
  job.progress = 0;
  job.statusText = "다운로드 중";
  updateJobCard(job);
  await animateDownloadBar(job, Math.min(1600, Math.max(700, job.blob.size / 2500)));
  downloadBlob(job.blob, job.outName);
  job.statusText = "다운로드 완료";
  job.downloading = false;
  updateJobCard(job);
}

function disposeJob(job) {
  if (job.originalUrl) URL.revokeObjectURL(job.originalUrl);
  if (job.previewUrl && job.previewUrl !== job.originalUrl) URL.revokeObjectURL(job.previewUrl);
  if (job.source?.close) job.source.close();
}

function resetPreview() {
  state.selectedId = null;
  els.dropzone.classList.remove("has-preview");
  els.dropzonePreview.hidden = true;
  syncUiFromJob(null);
}

function removeJob(jobId) {
  const index = state.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) return;
  disposeJob(state.jobs[index]);
  state.jobs.splice(index, 1);
  if (!state.jobs.length) {
    resetPreview();
    renderJobs();
    return;
  }
  if (state.selectedId === jobId) {
    const next = state.jobs[index] || state.jobs[index - 1];
    state.selectedId = next.id;
    renderJobs();
    showPreview(state.selectedId, { scroll: true });
    return;
  }
  renderJobs();
}

async function processJob(job) {
  job.error = false;
  job.done = false;
  job.blob = null;
  job.outName = "";
  job.progress = 0;
  job.statusText = "변환 중";
  updateJobCard(job);
  const source = await ensureSource(job);
  const ratio = jobRatio(job);
  const canvas = document.createElement("canvas");
  paintJob(job, canvas);
  const mime = mimeFor(job.format);
  const blob = await canvasToBlob(canvas, mime, mime === "image/jpeg" || mime === "image/webp" ? 0.92 : undefined);
  if (job.previewUrl && job.previewUrl !== job.originalUrl) URL.revokeObjectURL(job.previewUrl);
  job.blob = blob;
  job.outName = outputName(job, canvas.width, canvas.height);
  job.previewUrl = URL.createObjectURL(blob);
  job.progress = 0;
  job.done = true;
  job.statusText = "다운로드 대기";
  updateJobCard(job);
}

let processTimer = null;
function scheduleProcess(job) {
  clearTimeout(processTimer);
  processTimer = setTimeout(async () => {
    try {
      await processJob(job);
      renderJobs();
    } catch (err) {
      job.error = true;
      job.statusText = err.message || "처리 실패";
      updateJobCard(job);
    }
  }, 280);
}

function createJob(file, format) {
  const originalUrl = URL.createObjectURL(file);
  const selected = selectedJob();
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    format,
    progress: 0,
    statusText: "대기 중",
    done: false,
    error: false,
    downloading: false,
    enhanced: false,
    category: null,
    blob: null,
    originalUrl,
    previewUrl: originalUrl,
    source: null,
    settings: cloneSettings(selected?.settings || defaultSettings()),
  };
}

async function addFiles(fileList, { mode = "add" } = {}) {
  const accepted = [];
  const rejected = [];
  for (const file of [...fileList]) {
    const format = detectFormat(file);
    if (!format) rejected.push(file.name);
    else accepted.push(createJob(file, format));
  }
  if (rejected.length) alert(`지원하지 않는 파일은 제외했습니다.\n${rejected.join("\n")}`);
  if (!accepted.length) return;
  if (mode === "replace") {
    if (accepted.length === 1 && state.selectedId && state.jobs.length) {
      const index = state.jobs.findIndex((job) => job.id === state.selectedId);
      const previous = state.jobs[index];
      accepted[0].settings = cloneSettings(previous.settings);
      disposeJob(previous);
      state.jobs[index] = accepted[0];
      state.selectedId = accepted[0].id;
    } else {
      state.jobs.forEach(disposeJob);
      state.jobs = accepted;
      state.selectedId = accepted[0].id;
    }
  } else {
    const isFirst = state.jobs.length === 0;
    state.jobs.push(...accepted);
    if (isFirst || !state.selectedId) state.selectedId = accepted[0].id;
  }
  renderJobs();
  await showPreview(state.selectedId);
  state.processing = true;
  for (const job of accepted) {
    try {
      await processJob(job);
    } catch (err) {
      job.error = true;
      job.statusText = err.message || "처리 실패";
    }
  }
  state.processing = false;
  renderJobs();
}

function parseJsonFromText(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Gemini 응답을 해석하지 못했습니다.");
  return JSON.parse(match[0]);
}

function isChatVisionModel(name) {
  const n = name.toLowerCase();
  if (!n.includes("gemini")) return false;
  if (
    /deep-research|embedding|imagen|veo|tts|audio|robot|computer-use|native-audio|exp|preview|thinking|gemma/.test(
      n
    )
  ) {
    return false;
  }
  return n.includes("flash") || n.includes("pro");
}

function modelPriority(name) {
  const n = name.toLowerCase();
  if (n.includes("flash-lite")) return 3;
  if (n.includes("2.5") && n.includes("flash")) return 0;
  if (n.includes("2.0") && n.includes("flash")) return 1;
  if (n.includes("flash")) return 2;
  if (n.includes("pro")) return 4;
  return 5;
}

function friendlyGeminiError(message) {
  const text = String(message || "");
  if (/prepayment credits are depleted|manage your project and billing/i.test(text)) {
    return "Gemini 프로젝트의 선불 크레딧이 모두 사용되었습니다. Google AI Studio(https://aistudio.google.com/)에서 결제 또는 크레딧을 확인하세요.";
  }
  if (/quota|rate-limit|exceeded your current quota/i.test(text)) {
    const wait = text.match(/retry in ([\d.]+)\s*s/i);
    const seconds = wait ? Math.ceil(Number(wait[1])) : 20;
    return `Gemini 무료 사용량을 잠시 초과했습니다. 약 ${seconds}초 뒤에 다시 눌러 주세요.`;
  }
  return text;
}

async function listGeminiModels() {
  const fallback = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-2.0-flash-lite"];
  const versions = ["v1beta", "v1"];
  for (const version of versions) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/${version}/models?key=${encodeURIComponent(state.apiKey)}`
    );
    if (!res.ok) continue;
    const data = await res.json();
    const usable = (data.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
      .map((model) => model.name.replace(/^models\//, ""))
      .filter(isChatVisionModel)
      .sort((a, b) => modelPriority(a) - modelPriority(b));
    const unique = [...new Set([...usable, ...fallback])];
    if (unique.length) return { version, names: unique.slice(0, 6) };
  }
  return { version: "v1beta", names: fallback };
}

async function geminiChat(prompt, imageDataUrl) {
  if (!state.apiKey) throw new Error("Gemini API 키를 입력하세요.");
  const base64 = imageDataUrl.split(",")[1] || imageDataUrl;
  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/jpeg", data: base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0 },
  });
  let catalog;
  try {
    catalog = state.geminiModels || (state.geminiModels = await listGeminiModels());
  } catch {
    catalog = { version: "v1beta", names: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"] };
  }
  let lastError = "";
  for (const model of catalog.names) {
    const url = `https://generativelanguage.googleapis.com/${catalog.version}/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch {
      lastError = "Gemini 서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.";
      continue;
    }
    let data = {};
    try {
      data = await res.json();
    } catch {
      lastError = `Gemini 응답을 읽지 못했습니다. (${res.status})`;
      continue;
    }
    if (!res.ok) {
      lastError = friendlyGeminiError(data.error?.message || data.error || `Gemini API 오류 (${res.status})`);
      continue;
    }
    const blocked = data.candidates?.[0]?.finishReason;
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n");
    if (text) return text;
    lastError = blocked ? `Gemini가 응답을 건너뛰었습니다. (${blocked})` : "Gemini가 비어 있는 응답을 보냈습니다.";
  }
  throw new Error(friendlyGeminiError(lastError) || "Gemini 호출에 실패했습니다.");
}

async function jobThumbDataUrl(job) {
  const src = await ensureSource(job);
  const max = 768;
  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  canvas.getContext("2d").drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function sourceToCanvas(source, max = 416) {
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function isSkin(r, g, b) {
  return r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 15 && Math.abs(r - g) > 15;
}

function looksIllustrated(data) {
  const sampled = new Set();
  let sat = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    sampled.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sat += max === 0 ? 0 : (max - min) / max;
    count += 1;
  }
  return sampled.size < 90 && sat / Math.max(1, count) > 0.28;
}

async function loadScriptOnce(src) {
  if ([...document.scripts].some((script) => script.src === src)) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function detectObjects(canvas) {
  try {
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
    await loadScriptOnce("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
    if (!state.cocoModel && window.cocoSsd) {
      state.cocoModel = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
    }
    if (!state.cocoModel) return [];
    return await state.cocoModel.detect(canvas);
  } catch {
    return [];
  }
}

async function detectFaces(canvas) {
  if (!window.FaceDetector) return 0;
  try {
    const faces = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 }).detect(canvas);
    return faces.length;
  } catch {
    return 0;
  }
}

function mapCocoClass(label) {
  const cars = new Set(["car", "truck", "bus", "motorcycle", "train"]);
  const animals = new Set(["cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "bird"]);
  const foods = new Set(["banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake"]);
  if (label === "person") return "사람";
  if (cars.has(label)) return "자동차";
  if (animals.has(label)) return "동물";
  if (foods.has(label)) return "음식";
  return null;
}

async function classifyLocally(job) {
  const source = await ensureSource(job);
  const canvas = sourceToCanvas(source, 416);
  const objects = await detectObjects(canvas);
  const scored = {};
  for (const item of objects) {
    const cat = mapCocoClass(item.class);
    if (!cat || item.score < 0.45) continue;
    scored[cat] = (scored[cat] || 0) + item.score;
  }
  const top = Object.entries(scored).sort((a, b) => b[1] - a[1])[0];
  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const illustrated = looksIllustrated(data);
  if (top) {
    if (top[0] === "사람" && illustrated) return "캐릭터";
    return top[0];
  }
  const faces = await detectFaces(canvas);
  if (faces > 0) return illustrated ? "캐릭터" : "사람";
  let skin = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 32) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    samples += 1;
    if (isSkin(r, g, b)) skin += 1;
    if (g > r + 18 && g > b + 12) green += 1;
    if (b > r + 18 && b > g + 12) blue += 1;
  }
  const skinRatio = skin / Math.max(1, samples);
  const greenRatio = green / Math.max(1, samples);
  const blueRatio = blue / Math.max(1, samples);
  if (illustrated && skinRatio > 0.04) return "캐릭터";
  if (skinRatio > 0.08) return "사람";
  if (greenRatio + blueRatio > 0.35) return "풍경";
  return "기타";
}

async function classifyJobs() {
  if (!state.jobs.length) return;
  els.classify.disabled = true;
  let localCount = 0;
  for (const job of state.jobs) {
    job.statusText = "분류 중";
    updateJobCard(job);
    let done = false;
    if (state.apiKey) {
      try {
        job.statusText = "Gemini 분류 중";
        updateJobCard(job);
        const dataUrl = await jobThumbDataUrl(job);
        const text = await geminiChat(
          '이 사진의 주제를 한 단어 갤러리 이름으로 분류하세요. 예: 사람, 캐릭터, 자동차, 풍경, 동물, 음식, 건축, 기타. JSON만 답하세요: {"category":"사람"}',
          dataUrl
        );
        const parsed = parseJsonFromText(text);
        job.category = String(parsed.category || "기타").trim() || "기타";
        done = true;
      } catch {
        done = false;
      }
    }
    if (!done) {
      try {
        job.statusText = "자체 분류 중";
        updateJobCard(job);
        job.category = await classifyLocally(job);
        localCount += 1;
      } catch {
        job.category = "기타";
        localCount += 1;
      }
    }
    job.statusText = job.done ? "다운로드 대기" : job.statusText;
    updateJobCard(job);
  }
  renderJobs();
  if (localCount) {
    alert(`Gemini 크레딧이 없어 ${localCount}장을 자체 분류했습니다. 사람/캐릭터/자동차 등은 사진 내용으로 나눴습니다.`);
  }
}

function unsharp(ctx, width, height, amount = 0.35) {
  const src = ctx.getImageData(0, 0, width, height);
  const copy = new ImageData(new Uint8ClampedArray(src.data), width, height);
  const d = src.data;
  const o = copy.data;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const blur =
          (o[i - 4 + c] + o[i + 4 + c] + o[i - width * 4 + c] + o[i + width * 4 + c] + o[i + c] * 4) / 8;
        d[i + c] = Math.max(0, Math.min(255, o[i + c] + (o[i + c] - blur) * amount * 4));
      }
    }
  }
  ctx.putImageData(src, 0, 0);
}

async function upscaleJobSource(job, scale) {
  const src = await ensureSource(job);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(src.width * scale));
  canvas.height = Math.max(1, Math.round(src.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  unsharp(ctx, canvas.width, canvas.height);
  if (src.close) src.close();
  job.source = canvas;
  job.enhanced = true;
}

async function enhanceSelected() {
  const job = selectedJob();
  if (!job) return;
  job.statusText = "Gemini 화질 분석 중";
  updateJobCard(job);
  let scale = 2;
  let usedGemini = false;
  try {
    const dataUrl = await jobThumbDataUrl(job);
    const text = await geminiChat(
      '이 사진이 저화질/흐릿한지 판단하세요. JSON만 답하세요: {"lowQuality":true,"scale":2,"reason":"짧은 이유"} scale은 2 또는 4.',
      dataUrl
    );
    const parsed = parseJsonFromText(text);
    scale = Number(parsed.scale) === 4 ? 4 : 2;
    usedGemini = true;
  } catch (err) {
    job.statusText = "로컬 고화질 확대 중";
    updateJobCard(job);
  }
  try {
    job.statusText = usedGemini ? `Gemini 보정 ${scale}배 확대 중` : `로컬 ${scale}배 확대 중`;
    updateJobCard(job);
    await upscaleJobSource(job, scale);
    await processJob(job);
    els.previewName.textContent = usedGemini
      ? `${job.file.name} · Gemini 고화질 보정`
      : `${job.file.name} · 로컬 고화질 보정`;
    renderJobs();
    if (!usedGemini) {
      alert("Gemini 크레딧이 없어 자체 고화질 보정을 적용했습니다.");
    }
  } catch (err) {
    job.statusText = err.message || "보정 실패";
    updateJobCard(job);
    alert(err.message || "고화질 보정에 실패했습니다.");
  }
}

async function zipJobs(jobs, suggestedName) {
  if (typeof JSZip === "undefined") {
    alert("ZIP 라이브러리를 불러오지 못했습니다.");
    return;
  }
  const ready = jobs.filter((job) => job.blob);
  if (!ready.length) return;
  const zip = new JSZip();
  for (const job of ready) {
    zip.file(job.outName, job.blob);
    job.downloading = true;
    job.progress = 0;
    job.statusText = "ZIP 저장 중";
    updateJobCard(job);
  }
  const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
    const percent = meta.percent || 0;
    for (const job of ready) {
      job.progress = percent;
      const bar = progressBarEl(job);
      if (bar) bar.style.width = `${percent}%`;
    }
  });
  try {
    await saveZipBlob(blob, suggestedName);
  } catch (err) {
    if (err?.name !== "AbortError") alert(err.message || "ZIP 저장에 실패했습니다.");
  }
  for (const job of ready) {
    job.progress = 100;
    job.downloading = false;
    job.statusText = "다운로드 완료";
    updateJobCard(job);
  }
  refreshButtons();
}

function bindUi() {
  renderFormats();
  syncUiFromJob(null);
  els.apiKey.value = state.apiKey;

  const openPicker = (mode) => {
    state.pickMode = mode;
    els.fileInput.click();
  };
  els.pickFiles.addEventListener("click", (e) => {
    e.stopPropagation();
    openPicker("add");
  });
  els.pickMore.addEventListener("click", (e) => {
    e.stopPropagation();
    openPicker("add");
  });
  els.previewStage.addEventListener("click", () => openPicker("replace"));
  els.fileInput.addEventListener("change", (e) => {
    addFiles(e.target.files, { mode: state.pickMode });
    state.pickMode = "add";
    e.target.value = "";
  });

  ["dragenter", "dragover"].forEach((type) => {
    els.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      els.dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    els.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      els.dropzone.classList.remove("dragover");
    });
  });
  els.dropzone.addEventListener("drop", (e) => {
    const mode = els.dropzone.classList.contains("has-preview") ? "replace" : "add";
    addFiles(e.dataTransfer.files, { mode });
  });

  els.ratioGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-ratio]");
    if (!btn || !selectedJob()) return;
    applyControlChange({ ratioId: btn.dataset.ratio });
  });
  els.customW.addEventListener("input", () => applyControlChange({ customW: els.customW.value }));
  els.customH.addEventListener("input", () => applyControlChange({ customH: els.customH.value }));
  document.querySelectorAll("input[name='fit-mode']").forEach((input) => {
    input.addEventListener("change", () => applyControlChange({ mode: input.value }));
  });
  els.padColor.addEventListener("input", () => applyControlChange({ padColor: els.padColor.value }));
  els.enhance.addEventListener("click", enhanceSelected);
  els.classify.addEventListener("click", classifyJobs);
  const saveApiKey = () => {
    const next = els.apiKey.value.trim();
    if (next !== state.apiKey) state.geminiModels = null;
    state.apiKey = next;
    localStorage.setItem("gemini_api_key", state.apiKey);
  };
  els.apiKey.addEventListener("input", saveApiKey);
  els.apiKey.addEventListener("change", saveApiKey);

  document.querySelectorAll("[data-view]").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item === tab));
      renderJobs();
    });
  });

  const onListClick = (e) => {
    const galleryZip = e.target.closest("[data-gallery-zip]");
    if (galleryZip) {
      e.stopPropagation();
      const name = galleryZip.dataset.galleryZip;
      const jobs = state.jobs.filter((job) => (job.category || "미분류") === name);
      zipJobs(jobs, zipName(`스마트사진편집_${name}`));
      return;
    }
    const del = e.target.closest("[data-delete]");
    if (del) {
      e.stopPropagation();
      removeJob(del.dataset.delete);
      return;
    }
    const btn = e.target.closest("[data-download]");
    if (btn) {
      e.stopPropagation();
      if (btn.disabled) return;
      downloadJob(state.jobs.find((j) => j.id === btn.dataset.download));
      return;
    }
    const card = e.target.closest(".file-card");
    if (!card) return;
    showPreview(card.id.replace("job-", ""), { scroll: true });
  };
  els.fileList.addEventListener("click", onListClick);
  els.galleryView.addEventListener("click", onListClick);

  els.downloadAll.addEventListener("click", () => zipJobs(state.jobs, zipName()));
}

bindUi();
