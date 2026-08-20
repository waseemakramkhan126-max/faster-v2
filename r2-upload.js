// =========================================================
// R2 UPLOAD HELPER - shared across chat-room.js, new-order-overview-logic.js, profile.html
// =========================================================

// Supabase Edge Function jo presigned upload URL deta hai
const R2_SIGN_URL = "https://hkabhikizdlbavfkualt.supabase.co/functions/v1/get-r2-upload-url";

// Har bucket ka PUBLIC read URL yahan daalna hai (Cloudflare dashboard > R2 > bucket > Settings > Public access)
// Agar custom domain attach kiya hai to wo daalo, warna r2.dev wala default public URL daalo.
const R2_PUBLIC_URLS = {
  "chat-media": "https://pub-b3bd78e415ca4687899a00b583758b27.r2.dev",       // <-- chat images/video/voice/docs (per-chat folders)
  "order-media": "https://pub-5b5b2aaa696b45ef8fb6ff789512827f.r2.dev",      // <-- order images/video/voice/docs
  "topup-proofs": "https://pub-5fdc8396cde74f939a13206c2c9808e6.r2.dev",     // <-- wallet top-up payment screenshots
  "withdraw-proofs": "https://pub-b63a99f4a7fc4631b37b75cc653f46ba.r2.dev",  // <-- withdrawal proof (future feature)
  "avatar": "https://pub-da8010faed2246b5af1fecf5e03a407f.r2.dev",           // <-- profile pictures
  "promo-banners": "https://pub-186da9a78c444e858a4ec1b9884f4a7c.r2.dev",    // <-- home page banners (future/admin)
  "reels": "https://pub-336c31da7c304b2894079d12fa019ccf.r2.dev",            // <-- reels videos (future feature)
  "rider-docs": "https://pub-891828568b0b42dab39d2abff5fff1f5.r2.dev",       // <-- rider CNIC/license/bike docs (future)
  "branding": "https://pub-46c1f50284b64647914d7901e1dd5fea.r2.dev",         // <-- app logos/branding assets (future)
};

/**
 * File ke MIME type ya explicit hint se media-type folder ka naam nikalta hai.
 * Sab jagah same 4 naam use hote hain taake folder structure consistent rahe: image / video / voice / docs
 */
function normalizeMediaType(hint, file) {
  const h = (hint || "").toLowerCase();
  if (["image", "photo", "img"].includes(h)) return "image";
  if (["video", "vid"].includes(h)) return "video";
  if (["voice", "audio"].includes(h)) return "voice";
  if (["doc", "docs", "document", "file"].includes(h)) return "docs";

  // hint na mile to file.type se guess karo
  if (file && file.type) {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "voice";
  }
  return "docs";
}

/**
 * File ko R2 pe upload karta hai aur uska public URL return karta hai.
 * @param {File} file - jo file upload karni hai
 * @param {string} bucket - bucket ka naam, e.g. "chat-media", "order-media", "avatar"
 * @param {string} prefix - filename prefix, e.g. "chat", "order", "avatar"
 * @param {function} [onProgress] - optional callback(percent)
 */
/**
 * Image ko canvas ke zariye 720p (long edge) tak resize aur compress karta hai.
 * Videos ko yeh function touch nahi karta (browser mein video re-encode karna
 * bohot heavy hota hai - ffmpeg.wasm jaisi library chahiye jo low-end phones
 * pe slow/crash ho sakti hai, isliye sirf images compress kar rahe hain).
 */
function compressImageTo720p(file, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      resolve(file); // image nahi hai to as-is chhod do
      return;
    }
    // GIF ko compress mat karo - canvas animation kha jayega, sirf pehla frame bachega
    if (file.type === "image/gif") {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      const longEdge = Math.max(width, height);

      if (longEdge <= 720) {
        // pehle se hi chhoti hai, compress karne ki zaroorat nahi
        resolve(file);
        return;
      }

      const scale = 720 / longEdge;
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file); // compression fail ho to original bhej do
            return;
          }
          const compressedFile = new File([blob], file.name || "image.jpg", {
            type: "image/jpeg",
          });
          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // load fail ho to original bhej do
    };

    img.src = objectUrl;
  });
}

/**
 * Video ko 720p tak compress karta hai bina kisi heavy library (ffmpeg.wasm) ke.
 * Tareeqa: video ko chupke se play karke, har frame ko canvas pe chhote size
 * mein draw karte hain, phir canvas + original audio ko MediaRecorder se
 * dobara record kar lete hain. Isme video ki poori length jitna hi time lagta
 * hai (real-time), lekin phone pe koi bhaari download/processing nahi hoti.
 *
 * Agar browser is process ko support nahi karta (purane Safari wagera), to
 * safely original file wapis kar deta hai - size-check wahan handle kar lega.
 */
function compressVideoTo720p(file, maxBitrate = 2000000) {
  const HARD_TIMEOUT_MS = 45000;     // 45 second - poora process itne se zyada na le
  const METADATA_TIMEOUT_MS = 10000; // 10 second - video load hi na ho to itna wait karo

  const attempt = new Promise((resolve) => {
    if (!file.type || !file.type.startsWith("video/")) {
      resolve(file);
      return;
    }
    if (typeof MediaRecorder === "undefined" || !HTMLVideoElement.prototype.captureStream) {
      console.warn("Video compression is browser mein supported nahi - original file bhej rahe hain");
      resolve(file);
      return;
    }

    const videoEl = document.createElement("video");
    videoEl.muted = true;   // sirf playback silent karta hai - audio track captureStream() mein phir bhi aati hai
    videoEl.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    videoEl.src = objectUrl;

    const metadataTimer = setTimeout(() => {
      console.warn("Video metadata load nahi hui (timeout) - original file bhej rahe hain");
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    }, METADATA_TIMEOUT_MS);

    videoEl.onloadedmetadata = () => {
      clearTimeout(metadataTimer);
      const longEdge = Math.max(videoEl.videoWidth, videoEl.videoHeight);

      if (longEdge <= 720) {
        // pehle se hi chhoti resolution hai, compress karne ki zaroorat nahi
        URL.revokeObjectURL(objectUrl);
        resolve(file);
        return;
      }

      const scale = 720 / longEdge;
      const width = Math.round(videoEl.videoWidth * scale / 2) * 2;   // even number zaroori hai encoder ke liye
      const height = Math.round(videoEl.videoHeight * scale / 2) * 2;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");

      try {
        const sourceStream = videoEl.captureStream();
        const canvasStream = canvas.captureStream(30); // 30 fps
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...sourceStream.getAudioTracks(),
        ]);

        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: maxBitrate,
        });

        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
          URL.revokeObjectURL(objectUrl);
          const compressedBlob = new Blob(chunks, { type: mimeType });
          const compressedFile = new File(
            [compressedBlob],
            (file.name ? file.name.split(".")[0] : "video") + ".webm",
            { type: mimeType }
          );
          resolve(compressedFile);
        };
        recorder.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(file); // kuch ghalat ho to original bhej do, reject mat karo
        };

        let rafId;
        const drawFrame = () => {
          if (videoEl.paused || videoEl.ended) return;
          ctx.drawImage(videoEl, 0, 0, width, height);
          rafId = requestAnimationFrame(drawFrame);
        };

        videoEl.onended = () => {
          cancelAnimationFrame(rafId);
          if (recorder.state !== "inactive") recorder.stop();
        };

        recorder.start();
        videoEl.play().then(drawFrame).catch(() => {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
        });
      } catch (err) {
        console.warn("Video compression fail ho gayi, original bhej rahe hain:", err);
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };

    videoEl.onerror = () => {
      clearTimeout(metadataTimer);
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });

  // Hard safety net - chahe kuch bhi ho jaye, itne time ke baad original file ke sath aage badh jao.
  // Isse button kabhi hamesha ke liye "processing" pe atka nahi rahega.
  const hardTimeout = new Promise((resolve) => {
    setTimeout(() => {
      console.warn("Video compression hard-timeout - original file bhej rahe hain");
      resolve(file);
    }, HARD_TIMEOUT_MS);
  });

  return Promise.race([attempt, hardTimeout]);
}

/**
 * File ko R2 pe upload karta hai aur uska public URL return karta hai.
 *
 * @param {File} file - jo file upload karni hai
 * @param {string} bucket - bucket ka naam: "chat-media", "order-media", "topup-proofs",
 *                          "withdraw-proofs", "avatar", "promo-banners", "reels", "rider-docs", "branding"
 * @param {object} [options]
 * @param {string} [options.idFolder] - chat-media ke liye zaroori: conversation/order/room ka number/ID
 *                                       (folder isi number se banega)
 * @param {string} [options.mediaType] - "image" | "video" | "voice" | "docs" (na diya to file.type se guess hoga)
 * @param {function} [options.onProgress] - callback(percent)
 * @param {number} [options.maxSizeMB] - default 15
 *
 * Folder structure:
 *   chat-media    -> {idFolder}/{mediaType}/{mediaType}_{idFolder}_{timestamp}_{rand}.{ext}
 *   order-media   -> {mediaType}/{mediaType}_{timestamp}_{rand}.{ext}
 *   baqi buckets  -> flat: {mediaType}_{timestamp}_{rand}.{ext}
 */
/**
 * Normal fetch() jaisa hi hai, bas agar server itne time mein response na de to
 * clear error ke sath fail ho jata hai - hamesha ke liye latka nahi rehta.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timeout (${timeoutMs / 1000}s) - internet slow hai ya server respond nahi kar raha`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadToR2(file, bucket, options = {}) {
  const { idFolder = null, mediaType = null, onProgress = null, maxSizeMB = 15 } = options;

  if (!R2_PUBLIC_URLS[bucket]) {
    throw new Error(`Bucket "${bucket}" ke liye public URL R2_PUBLIC_URLS mein set nahi hai`);
  }

  // Agar image hai to 720p tak compress kar do
  file = await compressImageTo720p(file);
  // Agar video hai to 720p tak compress kar do (real 4K/high-res videos yahan chhoti ho jayengi)
  file = await compressVideoTo720p(file);

  // 0) Size guard - compression ke baad bhi agar itni bari ho ke practical na rahe, tabhi reject karo
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File compress karne ke baad bhi bohot bari hai (${(file.size / 1024 / 1024).toFixed(1)}MB). Max limit: ${maxSizeMB}MB`);
  }

  // 1) Extension decide karo
  let extension = "bin";
  if (file.name) {
    extension = file.name.split(".").pop();
  } else if (file.type) {
    const type = file.type;
    if (type.includes("image")) extension = "jpg";
    else if (type.includes("webm")) extension = "webm";
    else if (type.includes("video")) extension = "mp4";
    else if (type.includes("audio")) extension = "webm";
  }

  // 2) Media-type folder nikalo (image/video/voice/docs)
  const type = normalizeMediaType(mediaType, file);
  const uniquePart = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // 3) Bucket ke hisaab se key (path) banao
  let key;
  if (bucket === "chat-media") {
    if (!idFolder) throw new Error('chat-media bucket ke liye "idFolder" (conversation/order/room number) zaroori hai');
    key = `${idFolder}/${type}/${type}_${idFolder}_${uniquePart}.${extension}`;
  } else if (bucket === "order-media") {
    key = `${type}/${type}_${uniquePart}.${extension}`;
  } else {
    key = `${type}_${uniquePart}.${extension}`;
  }

  if (onProgress) onProgress(10);

  // 4) Edge Function se presigned URL mango (30 second timeout ke sath)
  const signRes = await fetchWithTimeout(R2_SIGN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket: bucket,
      fileName: key,
      fileType: file.type || "application/octet-stream",
    }),
  }, 30000);

  if (!signRes.ok) {
    const errBody = await signRes.text();
    throw new Error(`Presigned URL fail: ${errBody}`);
  }

  const { uploadUrl, error: signError } = await signRes.json();
  if (signError) throw new Error(signError);

  if (onProgress) onProgress(40);

  // 5) File ko seedha R2 pe PUT karo (presigned URL ke through, 60 second timeout)
  const putRes = await fetchWithTimeout(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  }, 60000);

  if (!putRes.ok) {
    throw new Error(`R2 upload fail: ${putRes.status} ${putRes.statusText}`);
  }

  if (onProgress) onProgress(90);

  // 6) Public URL banao (koi extra call nahi chahiye)
  const publicUrl = `${R2_PUBLIC_URLS[bucket]}/${key}`;

  if (onProgress) onProgress(100);
  return publicUrl;
}
