"use client";
// Local-first holat: har o'zgarish avval qurilmada (localStorage) saqlanadi,
// keyin fonda Supabase'ga yuboriladi. Internet bo'lmasa — navbatda turadi.

import { useSyncExternalStore } from "react";
import type { Account, Note, Settings } from "./types";
import { defaultSettings } from "./types";
import { getSupabase, isCloudConfigured } from "./supabase";
import { normCode } from "./parser";
import { today } from "./dates";

export type SaveStatus = "idle" | "saving" | "local" | "cloud" | "offline" | "error" | "guest";

/** Jadval nomlari — mavjud Supabase loyihasida boshqa jadvallar bilan to'qnashmasligi uchun prefiks bilan */
export const TABLES = {
  accounts: process.env.NEXT_PUBLIC_TABLE_PREFIX ? process.env.NEXT_PUBLIC_TABLE_PREFIX + "accounts" : "moliya_accounts",
  notes: process.env.NEXT_PUBLIC_TABLE_PREFIX ? process.env.NEXT_PUBLIC_TABLE_PREFIX + "notes" : "moliya_notes",
  settings: process.env.NEXT_PUBLIC_TABLE_PREFIX ? process.env.NEXT_PUBLIC_TABLE_PREFIX + "settings" : "moliya_settings",
};

export interface User { id: string; email?: string }

export interface AppState {
  scope: string; // "guest" yoki user id
  accounts: Account[];
  notes: Note[];
  settings: Settings;
  activeNoteId: string | null;
  saveStatus: SaveStatus;
  saveError?: string;
  user: User | null;
  authReady: boolean;
  cloud: boolean; // Supabase sozlanganmi
  online: boolean;
  lastSync: string | null;
  pendingMigration: number; // mehmon yozuvlari soni (login qilganda)
  version: number;
}

const PALETTE = ["#dbe8d6", "#d6e4f2", "#e4dcf2", "#f2e3cf", "#f0d6d6", "#d9eeea", "#ece9cf", "#e0e0e0"];

export const DEFAULT_ACCOUNTS: Omit<Account, "id" | "updated_at">[] = [
  { code: "Uy", name: "Uyda saqlanayotgan pul", type: "home", currency: "UZS", aliases: ["uy"], color: PALETTE[0], sort: 0, archived: false },
  { code: "N", name: "Yonimdagi naqd", type: "cash", currency: "UZS", aliases: ["naqd", "yonimda"], color: PALETTE[1], sort: 1, archived: false },
  { code: "K", name: "Karta •••• 3665", type: "card", currency: "UZS", aliases: [], color: PALETTE[2], sort: 2, archived: false },
  { code: "C", name: "Karta •••• 3445", type: "card", currency: "UZS", aliases: [], color: PALETTE[3], sort: 3, archived: false },
  { code: "J", name: "Javohir (qarz)", type: "person", currency: "UZS", aliases: ["javohir"], color: PALETTE[4], sort: 4, archived: false },
  { code: "U", name: "Uzum Visa", type: "card", currency: "UZS", aliases: ["uzum", "uzum karta"], color: PALETTE[5], sort: 5, archived: false },
  { code: "T", name: "TBC Visa", type: "card", currency: "UZS", aliases: ["tbc", "tbc visa"], color: PALETTE[6], sort: 6, archived: false },
];

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });
const nowISO = () => new Date().toISOString();

let state: AppState = {
  scope: "guest",
  accounts: [],
  notes: [],
  settings: defaultSettings(),
  activeNoteId: null,
  saveStatus: "idle",
  user: null,
  authReady: false,
  cloud: false,
  online: true,
  lastSync: null,
  pendingMigration: 0,
  version: 0,
};

const listeners = new Set<() => void>();
function emit() {
  state = { ...state, version: state.version + 1 };
  for (const l of listeners) l();
}
function set(patch: Partial<AppState>) {
  Object.assign(state, patch);
  emit();
}

export function useApp(): AppState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => state,
  );
}
export const getState = () => state;

// ---------- localStorage ----------
const dataKey = (scope: string) => `moliya:v1:${scope}`;
const outboxKey = (scope: string) => `moliya:outbox:${scope}`;
const uiKey = () => `moliya:ui`;

interface Persisted { accounts: Account[]; notes: Note[]; settings: Settings; lastSync: string | null }
interface Outbox { notes: string[]; accounts: string[]; settings: boolean }

function readJSON<T>(k: string): T | null {
  try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
}
function writeJSON(k: string, v: unknown): boolean {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}

let outbox: Outbox = { notes: [], accounts: [], settings: false };

function persistLocal(): boolean {
  const ok = writeJSON(dataKey(state.scope), { accounts: state.accounts, notes: state.notes, settings: state.settings, lastSync: state.lastSync } satisfies Persisted);
  writeJSON(outboxKey(state.scope), outbox);
  writeJSON(uiKey(), { activeNoteId: state.activeNoteId });
  return ok;
}

function seedAccounts(): Account[] {
  const t = nowISO();
  return DEFAULT_ACCOUNTS.map((a) => ({ ...a, id: uid(), updated_at: t }));
}

function loadScope(scope: string) {
  const p = readJSON<Persisted>(dataKey(scope));
  const ob = readJSON<Outbox>(outboxKey(scope));
  const ui = readJSON<{ activeNoteId: string | null }>(uiKey());
  outbox = ob || { notes: [], accounts: [], settings: false };
  const accounts = p?.accounts?.length ? p.accounts : scope === "guest" ? seedAccounts() : [];
  const settings = { ...defaultSettings(), ...(p?.settings || {}) };
  const notes = p?.notes || [];
  const active = ui?.activeNoteId && notes.some((n) => n.id === ui.activeNoteId && !n.deleted) ? ui.activeNoteId : null;
  set({ scope, accounts, notes, settings, lastSync: p?.lastSync || null, activeNoteId: active, saveStatus: scope === "guest" ? "guest" : "local" });
  if (!p) persistLocal();
}

// ---------- mutatsiyalar ----------
function afterChange(kind: "note" | "account" | "settings", id?: string) {
  if (kind === "note" && id && !outbox.notes.includes(id)) outbox.notes.push(id);
  if (kind === "account" && id && !outbox.accounts.includes(id)) outbox.accounts.push(id);
  if (kind === "settings") outbox.settings = true;
  const ok = persistLocal();
  if (!ok) set({ saveStatus: "error", saveError: "Qurilma xotirasiga yozib bo'lmadi (localStorage to'lgan yoki o'chirilgan). JSON eksport qiling." });
  else if (state.user && state.cloud) { set({ saveStatus: "saving" }); scheduleFlush(); }
  else set({ saveStatus: state.user ? "local" : "guest" });
}

export function createNote(date?: string): Note {
  const t = nowISO();
  const n: Note = { id: uid(), raw: "", note_date: date || today(), unit: 1000, deleted: false, created_at: t, updated_at: t };
  state.notes = [...state.notes, n];
  state.activeNoteId = n.id;
  emit();
  persistLocal();
  return n;
}

export function setActiveNote(id: string | null) {
  state.activeNoteId = id;
  emit();
  persistLocal();
}

/** Matn/sana/birlik o'zgarishi — real vaqtda saqlanadi */
export function updateNote(id: string, patch: Partial<Pick<Note, "raw" | "note_date" | "unit">>) {
  const i = state.notes.findIndex((n) => n.id === id);
  if (i < 0) return;
  const n = { ...state.notes[i], ...patch, updated_at: nowISO() };
  const notes = state.notes.slice();
  notes[i] = n;
  state.notes = notes;
  emit();
  afterChange("note", id);
}

export function deleteNote(id: string) {
  const i = state.notes.findIndex((n) => n.id === id);
  if (i < 0) return;
  const notes = state.notes.slice();
  notes[i] = { ...notes[i], deleted: true, updated_at: nowISO() };
  state.notes = notes;
  if (state.activeNoteId === id) state.activeNoteId = null;
  emit();
  afterChange("note", id);
}

export function restoreNote(id: string) {
  const i = state.notes.findIndex((n) => n.id === id);
  if (i < 0) return;
  const notes = state.notes.slice();
  notes[i] = { ...notes[i], deleted: false, updated_at: nowISO() };
  state.notes = notes;
  emit();
  afterChange("note", id);
}

/** Bo'sh qolgan faol yozuvni tozalash (xom matnsiz yozuvlar saqlanmaydi) */
export function pruneEmptyNotes() {
  const empties = state.notes.filter((n) => !n.deleted && !n.raw.trim() && n.id !== state.activeNoteId);
  if (!empties.length) return;
  const t = nowISO();
  state.notes = state.notes.map((n) => (empties.includes(n) ? { ...n, deleted: true, updated_at: t } : n));
  emit();
  for (const e of empties) afterChange("note", e.id);
}

export function upsertAccount(a: Partial<Account> & { code: string }): Account {
  const t = nowISO();
  const i = a.id ? state.accounts.findIndex((x) => x.id === a.id) : -1;
  let acc: Account;
  if (i >= 0) acc = { ...state.accounts[i], ...a, updated_at: t } as Account;
  else acc = { id: uid(), name: a.code, type: "other", currency: "UZS", aliases: [], color: PALETTE[state.accounts.length % PALETTE.length], sort: state.accounts.length, archived: false, ...a, updated_at: t } as Account;
  const accounts = state.accounts.slice();
  if (i >= 0) accounts[i] = acc; else accounts.push(acc);
  state.accounts = accounts;
  emit();
  afterChange("account", acc.id);
  return acc;
}

export function updateSettings(patch: Partial<Settings>) {
  state.settings = { ...state.settings, ...patch, updated_at: nowISO() };
  emit();
  afterChange("settings");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function importData(p: { accounts?: Account[]; notes?: Note[]; settings?: Partial<Settings> }) {
  const t = nowISO();
  if (p.accounts?.length) {
    // Kod bo'yicha birlashtiramiz: mavjud hisob o'z ID'sini saqlaydi (bulutda dublikat bo'lmasligi uchun)
    const byCode = new Map(state.accounts.map((a) => [normCode(a.code), a]));
    const merged = [...state.accounts];
    for (const inc of p.accounts) {
      const ex = byCode.get(normCode(inc.code));
      if (ex) {
        const i = merged.findIndex((x) => x.id === ex.id);
        merged[i] = { ...ex, name: inc.name || ex.name, type: inc.type || ex.type, currency: inc.currency || ex.currency, aliases: [...new Set([...(ex.aliases || []), ...(inc.aliases || [])])], updated_at: t };
      } else {
        merged.push({ ...inc, id: UUID_RE.test(inc.id || "") ? inc.id : uid(), sort: inc.sort ?? merged.length, updated_at: t });
      }
    }
    state.accounts = merged;
  }
  if (p.notes?.length) {
    const existing = new Set(state.notes.map((n) => n.id));
    const incoming = p.notes.map((n) => ({ ...n, id: UUID_RE.test(n.id || "") && !existing.has(n.id) ? n.id : UUID_RE.test(n.id || "") ? n.id : uid(), updated_at: t }));
    const map = new Map(state.notes.map((n) => [n.id, n]));
    for (const n of incoming) map.set(n.id, n);
    state.notes = [...map.values()];
  }
  if (p.settings) state.settings = { ...state.settings, ...p.settings, updated_at: t };
  state.activeNoteId = null;
  emit();
  outbox = { notes: state.notes.map((n) => n.id), accounts: state.accounts.map((a) => a.id), settings: true };
  afterChange("settings");
}

export function exportData() {
  return { version: 1, exported_at: nowISO(), accounts: state.accounts, notes: state.notes.filter((n) => !n.deleted), settings: state.settings };
}

// ---------- Supabase sinxronizatsiya ----------
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let retryDelay = 1500;

function scheduleFlush(delay = 700) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, delay);
}

type NoteRow = { id: string; user_id: string; raw: string; note_date: string; unit: number; deleted: boolean; created_at: string; updated_at: string };
type AccountRow = { id: string; user_id: string; code: string; name: string; type: string; currency: string; aliases: string[]; color: string; sort: number; archived: boolean; updated_at: string };

export async function flush(): Promise<void> {
  const sb = getSupabase();
  const u = state.user;
  if (!sb || !u || flushing) return;
  if (!outbox.notes.length && !outbox.accounts.length && !outbox.settings) {
    if (state.saveStatus === "saving") set({ saveStatus: "cloud" });
    return;
  }
  if (!navigator.onLine) { set({ saveStatus: "offline" }); return; }
  flushing = true;
  const snapshot: Outbox = { notes: [...outbox.notes], accounts: [...outbox.accounts], settings: outbox.settings };
  const settingsAt = state.settings.updated_at;
  try {
    if (snapshot.accounts.length) {
      const rows: AccountRow[] = state.accounts.filter((a) => snapshot.accounts.includes(a.id)).map((a) => ({ ...a, user_id: u.id }));
      if (rows.length) { const { error } = await sb.from(TABLES.accounts).upsert(rows, { onConflict: "id" }); if (error) throw error; }
    }
    if (snapshot.notes.length) {
      const rows: NoteRow[] = state.notes.filter((n) => snapshot.notes.includes(n.id)).map((n) => ({ ...n, user_id: u.id }));
      if (rows.length) { const { error } = await sb.from(TABLES.notes).upsert(rows, { onConflict: "id" }); if (error) throw error; }
    }
    if (snapshot.settings) {
      const { error } = await sb.from(TABLES.settings).upsert({ user_id: u.id, data: state.settings, updated_at: state.settings.updated_at }, { onConflict: "user_id" });
      if (error) throw error;
    }
    // muvaffaqiyat — faqat yuborilganlarni navbatdan olib tashlaymiz
    outbox.notes = outbox.notes.filter((id) => !snapshot.notes.includes(id));
    outbox.accounts = outbox.accounts.filter((id) => !snapshot.accounts.includes(id));
    if (snapshot.settings && state.settings.updated_at === settingsAt) outbox.settings = false;
    retryDelay = 1500;
    const done = !outbox.notes.length && !outbox.accounts.length && !outbox.settings;
    set({ saveStatus: done ? "cloud" : "saving", saveError: undefined, lastSync: nowISO() });
    persistLocal();
    if (!done) scheduleFlush(200);
  } catch (e) {
    const msg = (e as { message?: string })?.message || String(e);
    set({ saveStatus: navigator.onLine ? "error" : "offline", saveError: msg });
    retryDelay = Math.min(retryDelay * 2, 60000);
    scheduleFlush(retryDelay);
  } finally {
    flushing = false;
  }
}

function mergeRows(incomingNotes: NoteRow[], incomingAccounts: AccountRow[]) {
  let changed = false;
  if (incomingAccounts.length) {
    const map = new Map(state.accounts.map((a) => [a.id, a]));
    for (const r of incomingAccounts) {
      const local = map.get(r.id);
      if (!local || r.updated_at > local.updated_at) {
        const { user_id: _u, ...rest } = r; void _u;
        map.set(r.id, { ...rest, type: rest.type as Account["type"], currency: rest.currency as Account["currency"] });
        outbox.accounts = outbox.accounts.filter((x) => x !== r.id);
        changed = true;
      }
    }
    if (changed) state.accounts = [...map.values()].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  }
  if (incomingNotes.length) {
    const map = new Map(state.notes.map((n) => [n.id, n]));
    let ch = false;
    for (const r of incomingNotes) {
      const local = map.get(r.id);
      const dirty = outbox.notes.includes(r.id);
      if (!local || r.updated_at > local.updated_at) {
        const { user_id: _u, ...rest } = r; void _u;
        map.set(r.id, { ...rest, unit: rest.unit === 1 ? 1 : 1000 });
        if (dirty) outbox.notes = outbox.notes.filter((x) => x !== r.id);
        ch = true;
      }
    }
    if (ch) { state.notes = [...map.values()]; changed = true; }
  }
  if (changed) { emit(); persistLocal(); }
  return changed;
}

export async function pull(full = false): Promise<void> {
  const sb = getSupabase();
  const u = state.user;
  if (!sb || !u) return;
  try {
    const since = full ? null : state.lastSync;
    let qn = sb.from(TABLES.notes).select("*").eq("user_id", u.id);
    let qa = sb.from(TABLES.accounts).select("*").eq("user_id", u.id);
    if (since) { qn = qn.gt("updated_at", since); qa = qa.gt("updated_at", since); }
    const [rn, ra, rs] = await Promise.all([qn, qa, sb.from(TABLES.settings).select("*").eq("user_id", u.id).maybeSingle()]);
    if (rn.error) throw rn.error;
    if (ra.error) throw ra.error;
    mergeRows((rn.data || []) as NoteRow[], (ra.data || []) as AccountRow[]);
    if (rs.data && rs.data.updated_at > state.settings.updated_at && !outbox.settings) {
      state.settings = { ...defaultSettings(), ...(rs.data.data as Partial<Settings>), updated_at: rs.data.updated_at };
      emit();
    }
    // Yangi akkaunt: serverda hisob yo'q, lokalda ham yo'q → standart hisoblar
    if (!state.accounts.length && !state.pendingMigration) {
      state.accounts = seedAccounts();
      outbox.accounts = state.accounts.map((a) => a.id);
      emit();
    }
    set({ lastSync: nowISO(), online: true });
    persistLocal();
    void flush();
  } catch (e) {
    const msg = (e as { message?: string })?.message || String(e);
    set({ saveStatus: navigator.onLine ? "error" : "offline", saveError: "Bulutdan o'qib bo'lmadi: " + msg });
  }
}

let channelCleanup: (() => void) | null = null;
function subscribeRealtime() {
  const sb = getSupabase();
  const u = state.user;
  if (!sb || !u) return;
  channelCleanup?.();
  const ch = sb
    .channel("moliya-" + u.id)
    .on("postgres_changes", { event: "*", schema: "public", table: TABLES.notes, filter: `user_id=eq.${u.id}` }, (p) => {
      if (p.new && typeof p.new === "object" && "id" in p.new) mergeRows([p.new as NoteRow], []);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: TABLES.accounts, filter: `user_id=eq.${u.id}` }, (p) => {
      if (p.new && typeof p.new === "object" && "id" in p.new) mergeRows([], [p.new as AccountRow]);
    })
    .subscribe();
  channelCleanup = () => { void sb.removeChannel(ch); channelCleanup = null; };
}

// ---------- autentifikatsiya ----------
export async function initApp(): Promise<void> {
  if (typeof window === "undefined") return;
  const cloud = isCloudConfigured();
  set({ cloud, online: navigator.onLine });
  loadScope("guest");

  window.addEventListener("online", () => { set({ online: true }); scheduleFlush(100); void pull(); });
  window.addEventListener("offline", () => set({ online: false, saveStatus: state.user ? "offline" : "guest" }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { void pull(); scheduleFlush(100); } });
  window.addEventListener("pagehide", () => persistLocal());
  window.addEventListener("storage", (e) => {
    if (e.key === dataKey(state.scope) && e.newValue) {
      // boshqa oynada o'zgargan — qayta o'qiymiz
      try {
        const p = JSON.parse(e.newValue) as Persisted;
        state.accounts = p.accounts; state.notes = p.notes; state.settings = p.settings; emit();
      } catch { /* e'tiborsiz */ }
    }
  });

  const sb = getSupabase();
  if (!sb) { set({ authReady: true }); return; }
  // "Ishonchli qurilma" belgilanmagan bo'lsa: brauzer yopilib qayta ochilganda sessiya tugatiladi
  if (localStorage.getItem("moliya:ephemeral") === "1" && !sessionStorage.getItem("moliya:sess")) {
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
  }
  sessionStorage.setItem("moliya:sess", "1");
  const { data } = await sb.auth.getSession();
  applySession(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null);
  set({ authReady: true });
  sb.auth.onAuthStateChange((_ev, session) => {
    const u = session?.user ? { id: session.user.id, email: session.user.email } : null;
    if (u?.id !== state.user?.id) applySession(u);
  });
}

function applySession(u: User | null) {
  if (u) {
    const guest = readJSON<Persisted>(dataKey("guest"));
    const guestNotes = guest?.notes.filter((n) => !n.deleted && n.raw.trim()).length || 0;
    set({ user: u });
    loadScope(u.id);
    set({ pendingMigration: guestNotes, saveStatus: "saving" });
    void pull(true).then(() => subscribeRealtime());
  } else {
    channelCleanup?.();
    set({ user: null, pendingMigration: 0 });
    loadScope("guest");
  }
}

/** Mehmon yozuvlarini akkauntga ko'chirish */
export function migrateGuest(accept: boolean) {
  const guest = readJSON<Persisted>(dataKey("guest"));
  if (accept && guest) {
    const t = nowISO();
    const existingCodes = new Set(state.accounts.map((a) => a.code.toLowerCase()));
    const codeMap = new Map<string, string>();
    for (const a of guest.accounts) {
      if (existingCodes.has(a.code.toLowerCase())) continue;
      const na = { ...a, id: uid(), updated_at: t };
      state.accounts.push(na);
      codeMap.set(a.id, na.id);
      outbox.accounts.push(na.id);
    }
    for (const n of guest.notes) {
      if (n.deleted || !n.raw.trim()) continue;
      const nn = { ...n, id: uid(), updated_at: t };
      state.notes.push(nn);
      outbox.notes.push(nn.id);
    }
    if (!state.settings.budget && guest.settings) { state.settings = { ...state.settings, ...guest.settings, updated_at: t }; outbox.settings = true; }
    localStorage.removeItem(dataKey("guest"));
    localStorage.removeItem(outboxKey("guest"));
    emit();
    afterChange("settings");
  } else if (!state.accounts.length) {
    // mehmon ma'lumotlari qurilmada qoladi (ko'rsatilmaydi); akkaunt bo'sh bo'lsa — standart hisoblar
    state.accounts = seedAccounts();
    outbox.accounts = state.accounts.map((a) => a.id);
    emit();
    afterChange("account");
  }
  set({ pendingMigration: 0 });
}

export async function signIn(email: string, password: string) {
  const sb = getSupabase(); if (!sb) throw new Error("Bulut sozlanmagan");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(email: string, password: string) {
  const sb = getSupabase(); if (!sb) throw new Error("Bulut sozlanmagan");
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return !!data.session; // false → email tasdiqlash kerak
}
export async function signInGoogle() {
  const sb = getSupabase(); if (!sb) throw new Error("Bulut sozlanmagan");
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  if (error) throw error;
}
export async function signOut() {
  const sb = getSupabase(); if (!sb) return;
  await flush();
  await sb.auth.signOut();
}
export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase(); if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token || null;
}
