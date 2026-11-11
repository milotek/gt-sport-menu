const DB = "gt-sport-menu";
const STORE = "files";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export function addFiles(kind, files) {
  return tx("readwrite", (s) => {
    for (const f of files) s.add({ kind, name: f.name, type: f.type, blob: f });
    return {};
  });
}

export async function listFiles(kind) {
  const all = await tx("readonly", (s) => s.getAll());
  return all.filter((f) => f.kind === kind);
}

export function clearFiles() {
  return tx("readwrite", (s) => s.clear());
}

// Media dropped into site/media/local by tools/import_media.py is never committed or deployed,
// so the manifest only exists when the user serves their own checkout.
export async function folderManifest() {
  try {
    const res = await fetch("media/local/manifest.json", { cache: "no-store" });
    return res.ok ? await res.json() : { audio: [], images: [] };
  } catch {
    return { audio: [], images: [] };
  }
}
