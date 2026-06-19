// Cross-platform image-picker helper for the CMS.
// - Web: opens the native browser file input (no library needed) — kept for parity.
// - iOS/Android: uses expo-image-picker, requests photo-library permission contextually,
//   and surfaces a clear path to the OS settings if the user permanently denied access.

import { Platform, Linking, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";

export type PickedFile = {
  name: string;
  type: string;
  size: number;
  /** Blob suitable for `supabase.storage.from(...).upload()`. */
  blob: Blob;
  /** Original URI (file://...) on native, dataURL on web — useful for previews. */
  uri: string;
};

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB hard cap matches the Supabase bucket limit

function extFromMime(mime: string): string {
  if (!mime) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic") || mime.includes("heif")) return "heic";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Pick an image on iOS/Android. Returns `null` if the user cancels or denies.
 * Shows an actionable explanation (with a button to open the device settings)
 * when the permission was permanently blocked.
 */
export async function pickImageFromGallery(opts?: {
  prompts?: { permissionTitle?: string; permissionBody?: string; deniedTitle?: string; deniedBody?: string };
}): Promise<PickedFile | null> {
  if (Platform.OS === "web") {
    // Use HTMLInputElement on the web — keeps existing UX and avoids extra deps.
    return await new Promise((resolve) => {
      const input = (typeof document !== "undefined" ? document.createElement("input") : null) as HTMLInputElement | null;
      if (!input) { resolve(null); return; }
      input.type = "file"; input.accept = "image/*";
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) { resolve(null); return; }
        if (f.size > MAX_BYTES) { Alert.alert("Fichier trop gros", "Maximum 20 MB"); resolve(null); return; }
        resolve({ name: f.name, type: f.type || "image/jpeg", size: f.size, blob: f, uri: URL.createObjectURL(f) });
      };
      input.click();
    });
  }

  // 1. Check existing permission status. Only request if not granted yet.
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (perm.canAskAgain) {
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
  }
  if (!perm.granted) {
    // Permanently blocked OR user just declined → offer an actionable path.
    const title = opts?.prompts?.deniedTitle ?? "Accès photos refusé";
    const body = opts?.prompts?.deniedBody ?? "Pour ajouter une image, autorisez l'accès aux photos dans les réglages de l'application.";
    Alert.alert(title, body, [
      { text: "Annuler", style: "cancel" },
      { text: "Ouvrir les réglages", onPress: () => Linking.openSettings() },
    ]);
    return null;
  }

  // 2. Launch the gallery
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,        // preserve full quality; the CMS itself generates the thumb
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
  });
  if (res.canceled || !res.assets || res.assets.length === 0) return null;
  const a = res.assets[0];

  if (a.fileSize && a.fileSize > MAX_BYTES) {
    Alert.alert("Fichier trop gros", "Maximum 20 MB");
    return null;
  }

  // 3. Convert the file URI to a Blob so we can stream it to Supabase Storage
  //    (the storage SDK accepts Blob / ArrayBuffer / File but NOT raw file:// URIs).
  const resp = await fetch(a.uri);
  const blob = await resp.blob();
  const mime = a.mimeType || blob.type || "image/jpeg";
  const ext = extFromMime(mime);
  const name = (a.fileName || `photo-${Date.now()}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");

  return { name, type: mime, size: blob.size || a.fileSize || 0, blob, uri: a.uri };
}

/**
 * Optional: pick directly from the camera (snap a fresh photo) — Android & iOS only.
 * Kept here for completeness; the CMS UI calls it via a long-press / secondary button.
 */
export async function takePhotoWithCamera(): Promise<PickedFile | null> {
  if (Platform.OS === "web") return null;
  let perm = await ImagePicker.getCameraPermissionsAsync();
  if (!perm.granted) {
    if (perm.canAskAgain) perm = await ImagePicker.requestCameraPermissionsAsync();
  }
  if (!perm.granted) {
    Alert.alert("Accès caméra refusé", "Activez la caméra dans les réglages pour prendre une photo.", [
      { text: "Annuler", style: "cancel" },
      { text: "Ouvrir les réglages", onPress: () => Linking.openSettings() },
    ]);
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false, quality: 1, exif: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.fileSize && a.fileSize > MAX_BYTES) { Alert.alert("Fichier trop gros", "Maximum 20 MB"); return null; }
  const resp = await fetch(a.uri);
  const blob = await resp.blob();
  const mime = a.mimeType || blob.type || "image/jpeg";
  const ext = extFromMime(mime);
  const name = (a.fileName || `photo-${Date.now()}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  return { name, type: mime, size: blob.size || a.fileSize || 0, blob, uri: a.uri };
}
