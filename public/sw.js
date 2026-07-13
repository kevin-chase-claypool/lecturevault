const SHARE_DATABASE = "lecturevault-pwa-share";
const SHARE_STORE = "pending-sources";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function openShareDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARE_STORE)) {
        request.result.createObjectStore(SHARE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open shared-source storage."));
  });
}

async function savePendingSource(source) {
  const database = await openShareDatabase();
  await new Promise((resolve, reject) => {
    const request = database.transaction(SHARE_STORE, "readwrite").objectStore(SHARE_STORE).put(source);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Could not save the shared source."));
  });
  database.close();
}

function safeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function createSignedUpload(file, lectureId, mediaId) {
  const response = await fetch("/api/media/signed-upload", {
    body: JSON.stringify({ fileName: file.name, lectureId, mediaId }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const data = await response.json();
  if (!response.ok || !data.signedUrl || !data.path) {
    throw new Error(data.error || "LectureVault could not prepare a direct media upload.");
  }
  return data;
}

async function uploadSharedFile(file) {
  const mediaId = safeId("media");
  const lectureId = safeId("shared");
  const signedUpload = await createSignedUpload(file, lectureId, mediaId);
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const upload = await fetch(signedUpload.signedUrl, { body, method: "PUT" });
  if (!upload.ok) throw new Error(`Could not upload ${file.name} to Supabase.`);
  return {
    id: mediaId,
    mimeType: file.type || "application/octet-stream",
    name: file.name || "Shared OneNote page",
    size: file.size,
    storageBucket: signedUpload.bucket,
    storagePath: signedUpload.path
  };
}

async function receiveShare(request) {
  const formData = await request.formData();
  const files = formData.getAll("lecturevault_files").filter((value) => value instanceof File);
  if (!files.length) return Response.redirect("/?share-error=missing-file", 303);

  try {
    for (const file of files) {
      if (!(file.type === "application/pdf" || file.type.startsWith("image/"))) {
        throw new Error("Only PDF and image pages can be shared to LectureVault.");
      }
      await savePendingSource(await uploadSharedFile(file));
    }
    return Response.redirect("/?shared=1", 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not receive the shared page.";
    return Response.redirect(`/?share-error=${encodeURIComponent(message)}`, 303);
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === "/share-target" && event.request.method === "POST") {
    event.respondWith(receiveShare(event.request));
  }
});
