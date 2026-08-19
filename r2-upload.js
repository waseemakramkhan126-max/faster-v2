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
async function uploadToR2(file, bucket, prefix = "file", onProgress = null) {
  if (!R2_PUBLIC_URLS[bucket]) {
    throw new Error(`Bucket "${bucket}" ke liye public URL R2_PUBLIC_URLS mein set nahi hai`);
  }

  // 1) File ka naam decide karo
  let extension = "bin";
  if (file.name) {
    extension = file.name.split(".").pop();
  } else if (file.type) {
    const type = file.type;
    if (type.includes("image")) extension = "jpg";
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
