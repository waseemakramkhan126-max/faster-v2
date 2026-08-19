// =========================================================
// R2 UPLOAD HELPER - shared across chat-room.js, new-order-overview-logic.js, profile.html
// =========================================================

// Supabase Edge Function jo presigned upload URL deta hai
const R2_SIGN_URL = "https://hkabhikizdlbavfkualt.supabase.co/functions/v1/get-r2-upload-url";

// Har bucket ka PUBLIC read URL yahan daalna hai (Cloudflare dashboard > R2 > bucket > Settings > Public access)
// Agar custom domain attach kiya hai to wo daalo, warna r2.dev wala default public URL daalo.
const R2_PUBLIC_URLS = {
  "fhd-chat-media": "https://pub-0644051494ec47cbb47f26ad38a126a3.r2.dev",        // <-- yahan apna actual public URL daalo
  "fhd-order-attachments": "https://pub-daf1d956e5824b989882b046084e4602.r2.dev", // <-- yahan apna actual public URL daalo
  "fhd-promo": "https://pub-6afb8cbe1c8247b889f1463fa6d08e5e.r2.dev",             // <-- yahan apna actual public URL daalo
  "fhd-reels": "https://pub-8f65c266b6834e6da24316a3e30a68a0.r2.dev",             // <-- yahan apna actual public URL daalo
};

/**
 * File ko R2 pe upload karta hai aur uska public URL return karta hai.
 * @param {File} file - jo file upload karni hai
 * @param {string} bucket - bucket ka naam, e.g. "fhd-chat-media"
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
  return new Promise((resolve) => {
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
    videoEl.muted = false;
    videoEl.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    videoEl.src = objectUrl;

    videoEl.onloadedmetadata = () => {
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
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });
}

async function uploadToR2(file, bucket, prefix = "file", onProgress = null, maxSizeMB = 15) {
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

  // 1) File ka naam decide karo
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
  const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${extension}`;

  if (onProgress) onProgress(10);

  // 2) Edge Function se presigned URL mango
  const signRes = await fetch(R2_SIGN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket: bucket,
      fileName: fileName,
      fileType: file.type || "application/octet-stream",
    }),
  });

  if (!signRes.ok) {
    const errBody = await signRes.text();
    throw new Error(`Presigned URL fail: ${errBody}`);
  }

  const { uploadUrl, error: signError } = await signRes.json();
  if (signError) throw new Error(signError);

  if (onProgress) onProgress(40);

  // 3) File ko seedha R2 pe PUT karo (presigned URL ke through)
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`R2 upload fail: ${putRes.status} ${putRes.statusText}`);
  }

  if (onProgress) onProgress(90);

  // 4) Public URL banao (koi extra call nahi chahiye)
  const publicUrl = `${R2_PUBLIC_URLS[bucket]}/${fileName}`;

  if (onProgress) onProgress(100);
  return publicUrl;
}
