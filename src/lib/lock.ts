"use client";
// Biometrik qulf — WebAuthn (qurilma biometriyasi: barmoq izi / yuz) bilan ilovani ochish.
// Bu kirish paroli emas: Supabase sessiyasi saqlanadi, qulf esa ilovani ochishda qo'shimcha tasdiq so'raydi.

const KEY = "moliya:lock";
const SESS = "moliya:unlocked";

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = () => crypto.getRandomValues(new Uint8Array(32));

export function lockSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

export function lockEnabled(): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem(KEY);
}

export function isLocked(): boolean {
  return lockEnabled() && sessionStorage.getItem(SESS) !== "1";
}

export async function enableLock(): Promise<void> {
  if (!lockSupported()) throw new Error("Bu brauzer biometrik tasdiqni qo'llab-quvvatlamaydi");
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(),
      rp: { name: "Moliya", id: location.hostname },
      user: { id: rand(), name: "moliya", displayName: "Moliya" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometrik kalit yaratilmadi");
  localStorage.setItem(KEY, b64(cred.rawId));
  sessionStorage.setItem(SESS, "1");
}

export async function unlock(): Promise<void> {
  const id = localStorage.getItem(KEY);
  if (!id) { sessionStorage.setItem(SESS, "1"); return; }
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: rand(),
      allowCredentials: [{ type: "public-key", id: unb64(id) as BufferSource }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!cred) throw new Error("Tasdiqlanmadi");
  sessionStorage.setItem(SESS, "1");
}

export function disableLock(): void {
  localStorage.removeItem(KEY);
  sessionStorage.setItem(SESS, "1");
}
