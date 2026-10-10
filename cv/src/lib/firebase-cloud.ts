/**
 * Cloud saving for generated images: Cloud Storage (files) + Firestore (index).
 * Browser only, lazy-loaded. Paths are per user, matching firestore.rules / storage.rules:
 *   Storage  : users/{uid}/images/{id}.jpg|png
 *   Firestore: users/{uid}/images/{id}  { path, url, mime, prompt, bytes, createdAt }
 */
import { firebaseApp, auth, trackEvent } from "@/lib/firebase";

export interface CloudImage {
  id: string;
  url: string;
  path: string;
  mime: string;
  prompt: string;
  createdAt: number;
}

const MAX_BYTES = 5 * 1024 * 1024;

function uid(): string {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error("NOT_SIGNED_IN");
  return u;
}

function newId(): string {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return r.replace(/[^\w-]/g, "").slice(0, 36);
}

/** Uploads a data: URL image and records it. Returns the saved item. */
export async function saveImageToCloud(dataUrl: string, mime: string, prompt: string): Promise<CloudImage> {
  const user = uid();
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("BAD_IMAGE");
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_BYTES) throw new Error("TOO_BIG");
  const id = newId();
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const path = `users/${user}/images/${id}.${ext}`;

  const [{ getStorage, ref, uploadString, getDownloadURL }, { getFirestore, doc, setDoc, serverTimestamp }] = await Promise.all([
    import("firebase/storage"),
    import("firebase/firestore"),
  ]);
  const sref = ref(getStorage(firebaseApp), path);
  await uploadString(sref, dataUrl, "data_url", { contentType: m[1] });
  const url = await getDownloadURL(sref);
  const text = prompt.trim().slice(0, 200);
  await setDoc(doc(getFirestore(firebaseApp), "users", user, "images", id), {
    path,
    url,
    mime: m[1],
    prompt: text,
    bytes,
    createdAt: serverTimestamp(),
  });
  trackEvent("image_saved_cloud", { bytes });
  return { id, url, path, mime: m[1], prompt: text, createdAt: Date.now() };
}

/** Newest first, up to 30. */
export async function listCloudImages(): Promise<CloudImage[]> {
  const user = uid();
  const { getFirestore, collection, query, orderBy, limit, getDocs } = await import("firebase/firestore");
  const q = query(collection(getFirestore(firebaseApp), "users", user, "images"), orderBy("createdAt", "desc"), limit(30));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const v = d.data() as { url?: string; path?: string; mime?: string; prompt?: string; createdAt?: { toMillis?: () => number } };
    return {
      id: d.id,
      url: v.url ?? "",
      path: v.path ?? "",
      mime: v.mime ?? "image/jpeg",
      prompt: v.prompt ?? "",
      createdAt: v.createdAt?.toMillis?.() ?? 0,
    };
  });
}

export async function deleteCloudImage(img: CloudImage): Promise<void> {
  const user = uid();
  if (!img.path.startsWith(`users/${user}/images/`)) throw new Error("FORBIDDEN");
  const [{ getStorage, ref, deleteObject }, { getFirestore, doc, deleteDoc }] = await Promise.all([
    import("firebase/storage"),
    import("firebase/firestore"),
  ]);
  await deleteObject(ref(getStorage(firebaseApp), img.path)).catch(() => undefined);
  await deleteDoc(doc(getFirestore(firebaseApp), "users", user, "images", img.id));
}
