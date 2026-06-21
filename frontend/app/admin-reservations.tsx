import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  ActivityIndicator, Platform, useWindowDimensions, RefreshControl,
  KeyboardAvoidingView, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter, Redirect } from "expo-router";
import { useAuth } from "@/src/auth-context";
import { useI18n } from "@/src/i18n";
import { api } from "@/src/api";
import { theme } from "@/src/theme";
import { isLoyaltyApp } from "@/src/appMode";

type Lang = "fr" | "en";
type Period = "today" | "upcoming" | "past" | "all" | "range";
type Status = "pending" | "confirmed" | "cancelled" | "completed";

type Reservation = {
  id: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  zone: "indoor" | "terrace";
  table_no: string | null;
  status: Status;
  notes?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  created_at?: string;
};

type Capacity = {
  indoor: number; terrace: number;
  tables_indoor: number; tables_terrace: number; seats_per_table: number;
};

const STATUS_META: Record<Status, { fr: string; en: string; color: string; bg: string; icon: any }> = {
  pending:   { fr: "Liste d'attente", en: "Waiting list", color: "#F39C12", bg: "rgba(243,156,18,0.14)", icon: "clock" },
  confirmed: { fr: "Confirmée",       en: "Confirmed",    color: "#2ECC71", bg: "rgba(46,204,113,0.14)", icon: "check-circle" },
  completed: { fr: "Terminée",        en: "Completed",    color: "#7A776F", bg: "rgba(122,119,111,0.18)", icon: "archive" },
  cancelled: { fr: "Annulée",         en: "Cancelled",    color: "#E74C3C", bg: "rgba(231,76,60,0.14)", icon: "x-circle" },
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoPlus = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const fmtDate = (iso: string, lang: Lang) => {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "2-digit", month: "short" });
  } catch { return iso; }
};

// Page-level guard: reservations management belongs to the staff tablet
// (loyalty/admin variant) only. The customer-facing app has no admin
// surface, so any deep link here gets bounced to home.
export default function AdminReservationsRoute() {
  if (!isLoyaltyApp()) return <Redirect href={"/" as any} />;
  return <AdminReservations />;
}

function AdminReservations() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [period, setPeriod] = useState<Period>("upcoming");
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(isoPlus(14));
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Reservation[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [gridDate, setGridDate] = useState(todayIso());
  const [gridData, setGridData] = useState<any | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/account"); return; }
    if (!user.is_admin) { router.replace("/"); return; }
  }, [user, loading]);

  const fetchItems = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const params: any = { limit: 500 };
      if (period === "range") { params.from_date = fromDate; params.to_date = toDate; }
      else if (period !== "all") { params.period = period; }
      if (statusFilter !== "all") params.status = statusFilter;
      if (search.trim()) params.q = search.trim();
      const r = await api.adminListReservations(params);
      setItems(r.items || []);
    } catch (e: any) {
      setError(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }, [period, fromDate, toDate, statusFilter, search]);

  const fetchCap = useCallback(async () => {
    try { setCapacity(await api.adminGetCapacity()); } catch {}
  }, []);

  const fetchGrid = useCallback(async () => {
    try { setGridData(await api.adminReservationsDay(gridDate)); } catch (e: any) { setError(e?.message); }
  }, [gridDate]);

  useEffect(() => { if (user?.is_admin) fetchItems(); }, [fetchItems, user]);
  useEffect(() => { if (user?.is_admin) fetchCap(); }, [fetchCap, user]);
  useEffect(() => { if (showGrid && user?.is_admin) fetchGrid(); }, [showGrid, fetchGrid, user]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // Counts in the current result set
  const counts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, confirmed: 0, cancelled: 0, completed: 0 };
    items.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [items]);

  const waitlist = useMemo(() => items.filter(r => r.status === "pending"), [items]);
  const visible = useMemo(() => items.filter(r => r.status !== "pending"), [items]);

  const updateReservation = async (id: string, patch: any, successMsg?: string) => {
    try {
      const r = await api.adminUpdateReservation(id, patch);
      if (r.promoted && r.promoted.length > 0) {
        showToast(lang === "fr"
          ? `↑ ${r.promoted.length} promu(s) depuis la liste d'attente`
          : `↑ ${r.promoted.length} promoted from waitlist`);
      } else if (successMsg) {
        showToast(successMsg);
      }
      await fetchItems();
      if (showGrid) fetchGrid();
    } catch (e: any) {
      showToast(e?.message || "Échec");
    }
  };

  if (loading || !user) {
    return <View style={s.center}><ActivityIndicator color={theme.color.brand} /></View>;
  }
  if (!user.is_admin) return null;

  return (
    <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={s.header}>
          <Pressable testID="back-btn" onPress={() => router.back()} style={s.iconBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={theme.color.onSurface} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>— {lang === "fr" ? "ADMINISTRATION" : "ADMINISTRATION"}</Text>
            <Text style={s.title}>{lang === "fr" ? "Réservations" : "Reservations"}</Text>
          </View>
          <Pressable testID="refresh-btn" onPress={() => { fetchItems(); if (showGrid) fetchGrid(); }} style={s.iconBtn} hitSlop={8}>
            <Feather name="refresh-cw" size={18} color={theme.color.brand} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: theme.space.lg, paddingBottom: 80 }}
          refreshControl={<RefreshControl tintColor={theme.color.brand} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await fetchItems(); setRefreshing(false); }} />}
        >
          {/* Search */}
          <View style={s.searchWrap}>
            <Feather name="search" size={16} color={theme.color.muted} />
            <TextInput
              testID="search-input"
              value={search}
              onChangeText={setSearch}
              placeholder={lang === "fr" ? "Rechercher (nom ou téléphone)…" : "Search (name or phone)…"}
              placeholderTextColor={theme.color.muted}
              style={s.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Feather name="x" size={16} color={theme.color.muted} />
              </Pressable>
            )}
          </View>

          {/* Period filters */}
          <Text style={s.sectionLbl}>{lang === "fr" ? "PÉRIODE" : "PERIOD"}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {([
              ["today", lang === "fr" ? "Aujourd'hui" : "Today"],
              ["upcoming", lang === "fr" ? "À venir" : "Upcoming"],
              ["past", lang === "fr" ? "Passées" : "Past"],
              ["all", lang === "fr" ? "Toutes" : "All"],
              ["range", lang === "fr" ? "Plage" : "Range"],
            ] as [Period, string][]).map(([p, label]) => (
              <Pressable key={p} testID={`period-${p}`} onPress={() => setPeriod(p)} style={[s.chip, period === p && s.chipActive]}>
                <Text style={[s.chipTxt, period === p && s.chipTxtActive]}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {period === "range" && (
            <View style={s.rangeRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLbl}>{lang === "fr" ? "Du" : "From"}</Text>
                <TextInput value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.color.muted} style={s.input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLbl}>{lang === "fr" ? "Au" : "To"}</Text>
                <TextInput value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.color.muted} style={s.input} />
              </View>
            </View>
          )}

          {/* Status filter */}
          <Text style={s.sectionLbl}>{lang === "fr" ? "STATUT" : "STATUS"}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {(["all", "confirmed", "pending", "completed", "cancelled"] as const).map((st) => {
              const meta = st === "all" ? null : STATUS_META[st as Status];
              const label = st === "all" ? (lang === "fr" ? "Tous" : "All") : meta![lang];
              const active = statusFilter === st;
              return (
                <Pressable key={st} testID={`status-${st}`} onPress={() => setStatusFilter(st)} style={[s.chip, active && s.chipActive, active && meta && { borderColor: meta.color, backgroundColor: meta.bg }]}>
                  <Text style={[s.chipTxt, active && s.chipTxtActive, active && meta && { color: meta.color }]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Summary */}
          <View style={s.summary}>
            <Text style={s.summaryTxt}>
              {items.length} {lang === "fr" ? "résultat" : "result"}{items.length === 1 ? "" : "s"}
              {counts.pending > 0 && ` · ${counts.pending} ${lang === "fr" ? "en attente" : "pending"}`}
              {counts.confirmed > 0 && ` · ${counts.confirmed} ${lang === "fr" ? "confirmées" : "confirmed"}`}
            </Text>
            <Pressable testID="new-reservation-btn" onPress={() => setShowCreate(true)} style={s.primaryBtnSm}>
              <Feather name="plus" size={14} color={theme.color.onBrandPrimary} />
              <Text style={s.primaryBtnSmTxt}>{lang === "fr" ? "Nouvelle" : "New"}</Text>
            </Pressable>
          </View>

          {error && <Text style={s.error}>{error}</Text>}

          {/* Waitlist section */}
          {waitlist.length > 0 && (
            <View style={[s.section, { borderColor: STATUS_META.pending.color, backgroundColor: STATUS_META.pending.bg }]}>
              <View style={s.sectionHead}>
                <Feather name="clock" size={16} color={STATUS_META.pending.color} />
                <Text style={[s.sectionTitle, { color: STATUS_META.pending.color }]}>
                  {lang === "fr" ? `Liste d'attente (${waitlist.length})` : `Waiting list (${waitlist.length})`}
                </Text>
              </View>
              <Text style={s.waitlistHint}>
                {lang === "fr"
                  ? "Ces clients attendent qu'une table se libère. Confirmez manuellement ou attendez la promotion auto."
                  : "These guests are waiting for a table. Confirm manually or wait for auto-promotion."}
              </Text>
              <View style={isWide ? s.gridWide : undefined}>
                {waitlist.map(r => (
                  <ReservationCard key={r.id} r={r} lang={lang} onAction={updateReservation} onEdit={() => setEditing(r)} />
                ))}
              </View>
            </View>
          )}

          {/* Main list */}
          {busy && items.length === 0 ? (
            <View style={{ paddingVertical: 32 }}><ActivityIndicator color={theme.color.brand} /></View>
          ) : visible.length === 0 && waitlist.length === 0 ? (
            <View style={s.emptyState}>
              <Feather name="calendar" size={24} color={theme.color.muted} />
              <Text style={s.emptyTxt}>
                {lang === "fr" ? "Aucune réservation pour ces filtres" : "No reservations match these filters"}
              </Text>
            </View>
          ) : (
            <View style={isWide ? s.gridWide : undefined}>
              {visible.map(r => (
                <ReservationCard key={r.id} r={r} lang={lang} onAction={updateReservation} onEdit={() => setEditing(r)} />
              ))}
            </View>
          )}

          {/* Table availability grid (expandable) */}
          <Pressable
            testID="toggle-grid-btn"
            onPress={() => setShowGrid(g => !g)}
            style={s.gridToggle}
          >
            <Feather name={showGrid ? "chevron-up" : "chevron-down"} size={16} color={theme.color.brand} />
            <Text style={s.gridToggleTxt}>
              {lang === "fr" ? "Grille des tables" : "Tables availability"}
            </Text>
          </Pressable>

          {showGrid && (
            <View style={s.gridSection}>
              {/* Date selector for grid */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {Array.from({ length: 14 }).map((_, i) => {
                  const iso = isoPlus(i);
                  const active = gridDate === iso;
                  return (
                    <Pressable key={iso} testID={`grid-date-${iso}`} onPress={() => setGridDate(iso)} style={[s.dateChip, active && s.dateChipActive]}>
                      <Text style={[s.dateChipDay, active && { color: theme.color.brand }]}>{fmtDate(iso, lang).split(" ")[0]}</Text>
                      <Text style={[s.dateChipNum, active && { color: theme.color.brand }]}>{iso.slice(8)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {!gridData ? (
                <ActivityIndicator color={theme.color.brand} style={{ marginVertical: 16 }} />
              ) : (
                <View style={{ marginTop: 12 }}>
                  <View style={s.legendRow}>
                    <View style={[s.legendDot, { backgroundColor: STATUS_META.confirmed.color }]} />
                    <Text style={s.legendTxt}>{lang === "fr" ? "Occupée" : "Occupied"}</Text>
                    <View style={[s.legendDot, { backgroundColor: theme.color.surfaceTertiary, marginLeft: 12 }]} />
                    <Text style={s.legendTxt}>{lang === "fr" ? "Libre" : "Free"}</Text>
                  </View>
                  {gridData.grid.map((slot: any) => (
                    <View key={slot.time} style={s.gridSlot}>
                      <Text style={s.gridSlotTime}>{slot.time}</Text>
                      <View style={{ flex: 1 }}>
                        {(["indoor", "terrace"] as const).map(z => (
                          <View key={z} style={s.gridZoneRow}>
                            <Text style={s.gridZoneLbl}>{z === "indoor" ? (lang === "fr" ? "Int." : "In.") : (lang === "fr" ? "Ter." : "Out.")}</Text>
                            <View style={s.gridTables}>
                              {slot.zones[z].tables.map((t: any) => (
                                <View key={t.id} style={[s.tableBox, t.occupied && { backgroundColor: STATUS_META.confirmed.color, borderColor: STATUS_META.confirmed.color }]}>
                                  <Text style={[s.tableTxt, t.occupied && { color: "#fff", fontWeight: "700" }]}>{t.id.split("-")[1]}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Toast */}
        {toast && (
          <View style={s.toast}><Text style={s.toastTxt}>{toast}</Text></View>
        )}

        {/* Edit modal */}
        {editing && (
          <EditReservationModal
            r={editing} lang={lang}
            capacity={capacity}
            onClose={() => setEditing(null)}
            onSaved={async () => { await fetchItems(); if (showGrid) fetchGrid(); setEditing(null); }}
            onToast={showToast}
          />
        )}

        {/* New reservation modal */}
        {showCreate && (
          <CreateReservationModal
            lang={lang}
            onClose={() => setShowCreate(false)}
            onCreated={async () => { setShowCreate(false); await fetchItems(); if (showGrid) fetchGrid(); }}
            onToast={showToast}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Reservation card ----
function ReservationCard({ r, lang, onAction, onEdit }: {
  r: Reservation; lang: Lang;
  onAction: (id: string, patch: any, successMsg?: string) => void;
  onEdit: () => void;
}) {
  const meta = STATUS_META[r.status];
  const isActive = r.status === "pending" || r.status === "confirmed";
  return (
    <View style={s.card} testID={`res-card-${r.id}`}>
      <View style={s.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardName} numberOfLines={1}>{r.name}</Text>
          <Text style={s.cardMeta}>
            {fmtDate(r.date, lang)} · {r.time} · {r.guests} {lang === "fr" ? "couvert" : "guest"}{r.guests > 1 ? "s" : ""}
          </Text>
        </View>
        <View style={[s.badge, { backgroundColor: meta.bg, borderColor: meta.color }]}>
          <Feather name={meta.icon} size={11} color={meta.color} />
          <Text style={[s.badgeTxt, { color: meta.color }]}>{meta[lang]}</Text>
        </View>
      </View>

      <View style={s.cardRow}>
        <Feather name="map-pin" size={12} color={theme.color.muted} />
        <Text style={s.cardRowTxt}>
          {r.zone === "indoor" ? (lang === "fr" ? "Intérieur" : "Indoor") : (lang === "fr" ? "Terrasse" : "Terrace")}
          {r.table_no
            ? ` · ${lang === "fr" ? "Table" : "Table"} ${r.table_no}`
            : ` · ${lang === "fr" ? "Sans table" : "No table"}`}
        </Text>
      </View>

      <View style={s.cardRow}>
        <Feather name="phone" size={12} color={theme.color.muted} />
        <Text style={s.cardRowTxt}>{r.phone || "—"}</Text>
      </View>

      {r.notes ? (
        <View style={[s.cardRow, { alignItems: "flex-start" }]}>
          <Feather name="message-square" size={12} color={theme.color.muted} style={{ marginTop: 2 }} />
          <Text style={[s.cardRowTxt, { fontStyle: "italic" }]} numberOfLines={3}>{r.notes}</Text>
        </View>
      ) : null}

      {/* Actions */}
      <View style={s.actions}>
        {/* Waiting-list entries: ONLY a Confirm button. No Cancel/Edit — manual-review workflow. */}
        {r.status === "pending" && (
          <Pressable testID={`confirm-${r.id}`} onPress={() => onAction(r.id, { status: "confirmed" }, lang === "fr" ? "Confirmée" : "Confirmed")} style={[s.actBtn, s.actPrimary]}>
            <Feather name="check" size={12} color={theme.color.onBrandPrimary} />
            <Text style={s.actPrimaryTxt}>{lang === "fr" ? "Confirmer" : "Confirm"}</Text>
          </Pressable>
        )}
        {r.status === "confirmed" && (
          <>
            <Pressable testID={`complete-${r.id}`} onPress={() => onAction(r.id, { status: "completed" }, lang === "fr" ? "Terminée" : "Completed")} style={[s.actBtn, s.actGhost]}>
              <Feather name="check-circle" size={12} color={theme.color.brand} />
              <Text style={s.actGhostTxt}>{lang === "fr" ? "Terminer" : "Complete"}</Text>
            </Pressable>
            <Pressable testID={`cancel-${r.id}`} onPress={() => onAction(r.id, { status: "cancelled" }, lang === "fr" ? "Annulée" : "Cancelled")} style={[s.actBtn, s.actDanger]}>
              <Feather name="x" size={12} color={STATUS_META.cancelled.color} />
              <Text style={[s.actGhostTxt, { color: STATUS_META.cancelled.color }]}>{lang === "fr" ? "Annuler" : "Cancel"}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ---- Edit modal ----
function EditReservationModal({ r, lang, capacity, onClose, onSaved, onToast }: {
  r: Reservation; lang: Lang; capacity: Capacity | null;
  onClose: () => void; onSaved: () => void; onToast: (m: string) => void;
}) {
  const [date, setDate] = useState(r.date);
  const [time, setTime] = useState(r.time);
  const [guests, setGuests] = useState(r.guests);
  const [zone, setZone] = useState<"indoor" | "terrace">(r.zone);
  const [tableNo, setTableNo] = useState(r.table_no || "");
  const [name, setName] = useState(r.name);
  const [phone, setPhone] = useState(r.phone);
  const [notes, setNotes] = useState(r.notes || "");
  const [status, setStatus] = useState<Status>(r.status);
  const [available, setAvailable] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Compute available tables for current schedule
  useEffect(() => {
    (async () => {
      try {
        const d = await api.adminReservationsDay(date);
        const slot = d.grid.find((g: any) => g.time === time);
        if (!slot) { setAvailable([]); return; }
        const tables = slot.zones[zone].tables as any[];
        const free = tables.filter(t => !t.occupied || (r.table_no || "").split(",").map(x => x.trim()).includes(t.id)).map(t => t.id);
        setAvailable(free);
      } catch { setAvailable([]); }
    })();
  }, [date, time, zone, r.table_no]);

  const save = async () => {
    setSaving(true);
    try {
      await api.adminUpdateReservation(r.id, {
        date, time, guests, zone, table_no: tableNo,
        name, phone, notes, status,
      });
      onToast(lang === "fr" ? "Enregistré" : "Saved");
      onSaved();
    } catch (e: any) {
      onToast(e?.message || (lang === "fr" ? "Échec" : "Failed"));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <ScrollView contentContainerStyle={{ padding: theme.space.lg }} keyboardShouldPersistTaps="handled">
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>{lang === "fr" ? "Modifier" : "Edit"}</Text>
              <Pressable onPress={onClose} style={s.iconBtn}><Feather name="x" size={18} color={theme.color.onSurface} /></Pressable>
            </View>

            <Text style={s.fieldLbl}>{lang === "fr" ? "Nom" : "Name"}</Text>
            <TextInput value={name} onChangeText={setName} style={s.input} />

            <Text style={s.fieldLbl}>{lang === "fr" ? "Téléphone" : "Phone"}</Text>
            <TextInput value={phone} onChangeText={setPhone} style={s.input} keyboardType="phone-pad" />

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLbl}>{lang === "fr" ? "Date" : "Date"}</Text>
                <TextInput value={date} onChangeText={setDate} style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={theme.color.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLbl}>{lang === "fr" ? "Heure" : "Time"}</Text>
                <TextInput value={time} onChangeText={setTime} style={s.input} placeholder="HH:MM" placeholderTextColor={theme.color.muted} />
              </View>
            </View>

            <Text style={s.fieldLbl}>{lang === "fr" ? "Couverts" : "Guests"}</Text>
            <View style={s.stepper}>
              <Pressable onPress={() => setGuests(Math.max(1, guests - 1))} style={s.stepBtn}><Feather name="minus" size={14} color={theme.color.brand} /></Pressable>
              <Text style={s.stepVal}>{guests}</Text>
              <Pressable onPress={() => setGuests(Math.min(20, guests + 1))} style={s.stepBtn}><Feather name="plus" size={14} color={theme.color.brand} /></Pressable>
            </View>

            <Text style={s.fieldLbl}>{lang === "fr" ? "Zone" : "Zone"}</Text>
            <View style={s.segRow}>
              {(["indoor", "terrace"] as const).map(z => (
                <Pressable key={z} onPress={() => setZone(z)} style={[s.segBtn, zone === z && s.segBtnActive]}>
                  <Text style={[s.segBtnTxt, zone === z && s.segBtnTxtActive]}>
                    {z === "indoor" ? (lang === "fr" ? "Intérieur" : "Indoor") : (lang === "fr" ? "Terrasse" : "Terrace")}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.fieldLbl}>{lang === "fr" ? "Table" : "Table"}</Text>
            <Text style={[s.hint, { marginBottom: 6 }]}>
              {lang === "fr" ? `Libres : ${available.join(", ") || "—"}` : `Free: ${available.join(", ") || "—"}`}
            </Text>
            <TextInput value={tableNo} onChangeText={setTableNo} placeholder={lang === "fr" ? "ex. I-3 ou I-1,I-2" : "e.g. I-3 or I-1,I-2"} placeholderTextColor={theme.color.muted} style={s.input} />

            <Text style={s.fieldLbl}>{lang === "fr" ? "Statut" : "Status"}</Text>
            <View style={s.segRow}>
              {(["pending", "confirmed", "completed", "cancelled"] as Status[]).map(st => {
                const meta = STATUS_META[st];
                const active = status === st;
                return (
                  <Pressable key={st} onPress={() => setStatus(st)} style={[s.segBtn, active && { backgroundColor: meta.bg, borderColor: meta.color }]}>
                    <Text style={[s.segBtnTxt, active && { color: meta.color }]}>{meta[lang]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.fieldLbl}>{lang === "fr" ? "Notes" : "Notes"}</Text>
            <TextInput value={notes} onChangeText={setNotes} style={[s.input, { height: 70, textAlignVertical: "top" }]} multiline />

            <Pressable testID="save-edit-btn" onPress={save} disabled={saving} style={[s.primaryBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : <Text style={s.primaryBtnTxt}>{lang === "fr" ? "Enregistrer" : "Save"}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---- Create modal ----
function CreateReservationModal({ lang, onClose, onCreated, onToast }: {
  lang: Lang; onClose: () => void; onCreated: () => void; onToast: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState("20:00");
  const [guests, setGuests] = useState(2);
  const [zone, setZone] = useState<"indoor" | "terrace">("indoor");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !phone.trim()) { onToast(lang === "fr" ? "Nom et téléphone requis" : "Name and phone required"); return; }
    setSaving(true);
    try {
      const r = await api.adminCreateReservation({ name, phone, date, time, guests, zone, notes });
      onToast(r.status === "confirmed"
        ? (lang === "fr" ? `Confirmée · Table ${r.table_no}` : `Confirmed · Table ${r.table_no}`)
        : (lang === "fr" ? "Liste d'attente" : "Added to waitlist"));
      onCreated();
    } catch (e: any) {
      onToast(e?.message || (lang === "fr" ? "Échec" : "Failed"));
    } finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <ScrollView contentContainerStyle={{ padding: theme.space.lg }} keyboardShouldPersistTaps="handled">
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>{lang === "fr" ? "Nouvelle réservation" : "New reservation"}</Text>
              <Pressable onPress={onClose} style={s.iconBtn}><Feather name="x" size={18} color={theme.color.onSurface} /></Pressable>
            </View>
            <Text style={s.fieldLbl}>{lang === "fr" ? "Nom" : "Name"}</Text>
            <TextInput value={name} onChangeText={setName} style={s.input} />
            <Text style={s.fieldLbl}>{lang === "fr" ? "Téléphone" : "Phone"}</Text>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={s.input} />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLbl}>Date</Text>
                <TextInput value={date} onChangeText={setDate} style={s.input} placeholder="YYYY-MM-DD" placeholderTextColor={theme.color.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLbl}>{lang === "fr" ? "Heure" : "Time"}</Text>
                <TextInput value={time} onChangeText={setTime} style={s.input} placeholder="HH:MM" placeholderTextColor={theme.color.muted} />
              </View>
            </View>
            <Text style={s.fieldLbl}>{lang === "fr" ? "Couverts" : "Guests"}</Text>
            <View style={s.stepper}>
              <Pressable onPress={() => setGuests(Math.max(1, guests - 1))} style={s.stepBtn}><Feather name="minus" size={14} color={theme.color.brand} /></Pressable>
              <Text style={s.stepVal}>{guests}</Text>
              <Pressable onPress={() => setGuests(Math.min(20, guests + 1))} style={s.stepBtn}><Feather name="plus" size={14} color={theme.color.brand} /></Pressable>
            </View>
            <Text style={s.fieldLbl}>{lang === "fr" ? "Zone" : "Zone"}</Text>
            <View style={s.segRow}>
              {(["indoor", "terrace"] as const).map(z => (
                <Pressable key={z} onPress={() => setZone(z)} style={[s.segBtn, zone === z && s.segBtnActive]}>
                  <Text style={[s.segBtnTxt, zone === z && s.segBtnTxtActive]}>
                    {z === "indoor" ? (lang === "fr" ? "Intérieur" : "Indoor") : (lang === "fr" ? "Terrasse" : "Terrace")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.fieldLbl}>{lang === "fr" ? "Notes" : "Notes"}</Text>
            <TextInput value={notes} onChangeText={setNotes} style={[s.input, { height: 70, textAlignVertical: "top" }]} multiline />
            <Text style={s.hint}>
              {lang === "fr"
                ? "La table sera attribuée automatiquement si disponible, sinon ajoutée en liste d'attente."
                : "A table will be auto-assigned if available, otherwise added to the waitlist."}
            </Text>
            <Pressable testID="create-reservation-btn" onPress={save} disabled={saving} style={[s.primaryBtn, saving && { opacity: 0.6 }]}>
              {saving ? <ActivityIndicator color={theme.color.onBrandPrimary} /> : <Text style={s.primaryBtnTxt}>{lang === "fr" ? "Créer" : "Create"}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, gap: theme.space.md },
  iconBtn: { width: 36, height: 36, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border },
  eyebrow: { color: theme.color.brand, fontSize: 10, letterSpacing: 1.4, fontWeight: "600", marginBottom: 2 },
  title: { color: theme.color.onSurface, fontSize: 24, fontFamily: theme.font.display },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, gap: 8, marginTop: 4 },
  searchInput: { flex: 1, color: theme.color.onSurface, fontSize: 14, paddingVertical: 0 },
  sectionLbl: { color: theme.color.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "600", marginTop: theme.space.lg, marginBottom: 6 },
  chipRow: { gap: 8, paddingRight: 16, paddingVertical: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border },
  chipActive: { backgroundColor: theme.color.surfaceTertiary, borderColor: theme.color.brand },
  chipTxt: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "500" },
  chipTxtActive: { color: theme.color.brand, fontWeight: "600" },
  rangeRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  fieldLbl: { color: theme.color.muted, fontSize: 11, letterSpacing: 1, fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, paddingHorizontal: 12, paddingVertical: 10, color: theme.color.onSurface, fontSize: 14 },
  hint: { color: theme.color.muted, fontSize: 11, fontStyle: "italic" },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.space.lg, marginBottom: 8 },
  summaryTxt: { color: theme.color.onSurfaceTertiary, fontSize: 12 },
  primaryBtnSm: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.color.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill },
  primaryBtnSmTxt: { color: theme.color.onBrandPrimary, fontSize: 12, fontWeight: "700" },
  error: { color: theme.color.error, marginVertical: 8, fontSize: 12 },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyTxt: { color: theme.color.muted, fontSize: 13 },
  section: { borderWidth: 1, borderRadius: theme.radius.md, padding: theme.space.md, marginTop: theme.space.md },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 14, fontWeight: "700" },
  waitlistHint: { color: theme.color.onSurfaceSecondary, fontSize: 11, marginBottom: 8, fontStyle: "italic" },
  gridWide: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, padding: theme.space.md, marginVertical: 6, ...(Platform.OS === "web" ? { width: "100%", maxWidth: 480 } : {}) },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  cardName: { color: theme.color.onSurface, fontSize: 15, fontWeight: "600" },
  cardMeta: { color: theme.color.muted, fontSize: 12, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.pill, borderWidth: 1 },
  badgeTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  cardRowTxt: { color: theme.color.onSurfaceTertiary, fontSize: 12, flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, borderTopWidth: 1, borderTopColor: theme.color.border, paddingTop: 8 },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radius.pill, borderWidth: 1 },
  actPrimary: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  actPrimaryTxt: { color: theme.color.onBrandPrimary, fontSize: 11, fontWeight: "700" },
  actGhost: { backgroundColor: "transparent", borderColor: theme.color.borderStrong },
  actGhostTxt: { color: theme.color.brand, fontSize: 11, fontWeight: "600" },
  actDanger: { backgroundColor: "transparent", borderColor: STATUS_META.cancelled.color },
  toast: { position: "absolute", left: 16, right: 16, bottom: 24, backgroundColor: theme.color.brand, paddingHorizontal: 16, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: "center" },
  toastTxt: { color: theme.color.onBrandPrimary, fontWeight: "600", fontSize: 13 },
  gridToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: theme.space.xl, paddingVertical: 12, backgroundColor: theme.color.surfaceSecondary, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border },
  gridToggleTxt: { color: theme.color.brand, fontSize: 13, fontWeight: "600" },
  gridSection: { marginTop: 12 },
  dateChip: { width: 56, paddingVertical: 8, alignItems: "center", borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  dateChipActive: { borderColor: theme.color.brand, backgroundColor: theme.color.surfaceTertiary },
  dateChipDay: { color: theme.color.onSurfaceSecondary, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
  dateChipNum: { color: theme.color.onSurface, fontSize: 16, fontWeight: "600", marginTop: 2 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 4, marginVertical: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { color: theme.color.muted, fontSize: 11 },
  gridSlot: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.color.divider, gap: 12 },
  gridSlotTime: { color: theme.color.brand, fontSize: 13, fontWeight: "600", width: 50, marginTop: 4 },
  gridZoneRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  gridZoneLbl: { color: theme.color.muted, fontSize: 10, letterSpacing: 0.8, width: 32 },
  gridTables: { flexDirection: "row", flexWrap: "wrap", gap: 4, flex: 1 },
  tableBox: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  tableTxt: { color: theme.color.onSurfaceSecondary, fontSize: 11, fontWeight: "500" },
  modalOverlay: { flex: 1, backgroundColor: theme.color.overlay, justifyContent: "flex-end" },
  modalCard: { backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, maxHeight: "92%", ...(Platform.OS === "web" ? { maxWidth: 640, marginHorizontal: "auto", borderRadius: theme.radius.lg } : {}) },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { color: theme.color.onSurface, fontSize: 20, fontFamily: theme.font.display },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.color.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surfaceSecondary },
  stepVal: { color: theme.color.onSurface, fontSize: 18, fontWeight: "700", minWidth: 36, textAlign: "center" },
  segRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  segBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border },
  segBtnActive: { backgroundColor: theme.color.surfaceTertiary, borderColor: theme.color.brand },
  segBtnTxt: { color: theme.color.onSurfaceSecondary, fontSize: 12, fontWeight: "500" },
  segBtnTxtActive: { color: theme.color.brand, fontWeight: "600" },
  primaryBtn: { backgroundColor: theme.color.brand, paddingVertical: 14, borderRadius: theme.radius.md, alignItems: "center", marginTop: 18 },
  primaryBtnTxt: { color: theme.color.onBrandPrimary, fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
});
