// =========================================================
// R2 UPLOAD HELPER - shared across chat-room.js, new-order-overview-logic.js, profile.html
// =========================================================

const R2_SIGN_URL = "https://hkabhikizdlbavfkualt.supabase.co/functions/v1/r2-upload-url";

const R2_PUBLIC_URLS = {
  "chat-media": "https://pub-AAAAAAAAAAAA.r2.dev",
  "order-media": "https://pub-5b5b2aaa696b45ef8fb6ff789512827f.r2.dev",
  "topup-proofs": "https://pub-CCCCCCCCCCCC.r2.dev",
  "withdraw-proofs": "https://pub-DDDDDDDDDDDD.r2.dev",
  "avatar": "https://pub-EEEEEEEEEEEE.r2.dev",
  "promo-banners": "https://pub-FFFFFFFFFFFF.r2.dev",
  "reels": "https://pub-GGGGGGGGGGGG.r2.dev",
  "rider-docs": "https://pub-HHHHHHHHHHHH.r2.dev",
  "branding": "https://pub-IIIIIIIIIIII.r2.dev",
};

function normalizeMediaType(hint, file) {
  const h = (hint || "").toLowerCase();
  if (["image", "photo", "img"].includes(h)) return "image";
  if (["video", "vid"].includes(h)) return "video";
  if (["voice", "audio"].includes(h)) return "voice";
  if (["doc", "docs", "document", "file"].includes(h)) return "docs";
  if (file && file.type) {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "voice";
  }
  return "docs";
}

function compressImageTo720p(file, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) { resolve(file); return; }
    if (file.type === "image/gif") { resolve(file); return; }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      const longEdge = Math.max(width, height);
      if (longEdge <= 720) { resolve(file); return; }
      const scale = 720 / longEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name || "image.jpg", { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

function compressVideoTo720p(file, maxBitrate = 2000000) {
  const HARD_TIMEOUT_MS = 45000;
  const METADATA_TIMEOUT_MS = 10000;
  const attempt = new Promise((resolve) => {
    if (!file.type || !file.type.startsWith("video/")) { resolve(file); return; }
    if (typeof MediaRecorder === "undefined" || !HTMLVideoElement.prototype.captureStream) { resolve(file); return; }
    const videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    videoEl.src = objectUrl;
    const metadataTimer = setTimeout(() => { URL.revokeObjectURL(objectUrl); resolve(file); }, METADATA_TIMEOUT_MS);
    videoEl.onloadedmetadata = () => {
      clearTimeout(metadataTimer);
      const longEdge = Math.max(videoEl.videoWidth, videoEl.videoHeight);
      if (longEdge <= 720) { URL.revokeObjectURL(objectUrl); resolve(file); return; }
      const scale = 720 / longEdge;
      const width = Math.round(videoEl.videoWidth * scale / 2) * 2;
      const height = Math.round(videoEl.videoHeight * scale / 2) * 2;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      try {
        const sourceStream = videoEl.captureStream();
        const canvasStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...sourceStream.getAudioTracks()]);
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
        const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: maxBitrate });
        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
          URL.revokeObjectURL(objectUrl);
          const compressedBlob = new Blob(chunks, { type: mimeType });
          resolve(new File([compressedBlob], (file.name ? file.name.split(".")[0] : "video") + ".webm", { type: mimeType }));
        };
        recorder.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
        let rafId;
        const drawFrame = () => {
          if (videoEl.paused || videoEl.ended) return;
          ctx.drawImage(videoEl, 0, 0, width, height);
          rafId = requestAnimationFrame(drawFrame);
        };
        videoEl.onended = () => { cancelAnimationFrame(rafId); if (recorder.state !== "inactive") recorder.stop(); };
        recorder.start();
        videoEl.play().then(drawFrame).catch(() => { URL.revokeObjectURL(objectUrl); resolve(file); });
      } catch (err) {
        URL.revokeObjectURL(objectUrl); resolve(file);
      }
    };
    videoEl.onerror = () => { clearTimeout(metadataTimer); URL.revokeObjectURL(objectUrl); resolve(file); };
  });
  const hardTimeout = new Promise((resolve) => { setTimeout(() => resolve(file), HARD_TIMEOUT_MS); });
  return Promise.race([attempt, hardTimeout]);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`Request timeout (${timeoutMs / 1000}s)`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadToR2(file, bucket, options = {}) {
  const { idFolder = null, mediaType = null, onProgress = null, maxSizeMB = 15 } = options;
  if (!R2_PUBLIC_URLS[bucket]) throw new Error(`Bucket "${bucket}" ke liye public URL set nahi hai`);
  file = await compressImageTo720p(file);
  file = await compressVideoTo720p(file);
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(`File bohot bari hai. Max: ${maxSizeMB}MB`);
  let extension = "bin";
  if (file.name) extension = file.name.split(".").pop();
  else if (file.type) {
    const t = file.type;
    if (t.includes("image")) extension = "jpg";
    else if (t.includes("webm")) extension = "webm";
    else if (t.includes("video")) extension = "mp4";
    else if (t.includes("audio")) extension = "webm";
  }
  const type = normalizeMediaType(mediaType, file);
  const uniquePart = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  let key;
  if (bucket === "chat-media") {
    if (!idFolder) throw new Error('chat-media ke liye idFolder zaroori hai');
    key = `${idFolder}/${type}/${type}_${idFolder}_${uniquePart}.${extension}`;
  } else if (bucket === "order-media") {
    key = `${type}/${type}_${uniquePart}.${extension}`;
  } else {
    key = `${type}_${uniquePart}.${extension}`;
  }
  if (onProgress) onProgress(10);
  const signRes = await fetchWithTimeout(R2_SIGN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, fileName: key, fileType: file.type || "application/octet-stream" }),
  }, 30000);
  if (!signRes.ok) throw new Error(`Presigned URL fail: ${await signRes.text()}`);
  const { uploadUrl, error: signError } = await signRes.json();
  if (signError) throw new Error(signError);
  if (onProgress) onProgress(40);
  const putRes = await fetchWithTimeout(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  }, 60000);
  if (!putRes.ok) throw new Error(`R2 upload fail: ${putRes.status} ${putRes.statusText}`);
  if (onProgress) onProgress(90);
  const publicUrl = `${R2_PUBLIC_URLS[bucket]}/${key}`;
  if (onProgress) onProgress(100);
  return publicUrl;
}
