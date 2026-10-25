import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";
import { colors } from "@/src/theme";
import { fmtMoney, fmtDate } from "@/src/ui";
import { DOC_TYPES, catOf, categoryLabel, docLabel, stageInfo } from "@/src/workflows";

const esc = (s: any) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const STATUS: Record<string, string> = {
  beklemede: "Beklemede", onaylandi: "Onaylandı", reddedildi: "Reddedildi",
  planlandi: "Planlandı", tamamlandi: "Tamamlandı", iptal: "İptal", aktif: "Aktif", bitti: "Bitti",
};
const statusColor = (s: string) =>
  ["onaylandi", "tamamlandi", "bitti"].includes(s) ? colors.success : ["reddedildi", "iptal"].includes(s) ? colors.error : colors.warning;

export async function shareProjectReport(project: any, includeFinance: boolean, team: string[]) {
  // Open the window synchronously on the tap so browsers don't treat it as a blocked popup.
  const win = Platform.OS === "web" ? window.open("", "_blank") : null;
  if (Platform.OS === "web") {
    if (!win) throw new Error("Açılır pencere engellendi, lütfen izin verin");
    win.document.write("<p style='font-family:sans-serif;padding:24px'>Rapor hazırlanıyor...</p>");
  }
  let data: any[][];
  try {
    data = await Promise.all([
      api<any[]>(`/projects/${project.id}/documents`),
      api<any[]>(`/projects/${project.id}/steps`),
      api<any[]>("/schedules"),
      includeFinance ? api<any[]>(`/projects/${project.id}/payments`) : Promise.resolve([]),
    ]);
  } catch (e) {
    win?.close();
    throw e;
  }
  const [docs, steps, schedules, payments] = data;
  const info = stageInfo(project);
  const missing = DOC_TYPES[catOf(project)].filter((t) => !docs.some((d) => d.category === t.key)).map((t) => t.label);
  const stageHtml = info ? `<h2>Süreç Durumu</h2><table><tr><th>#</th><th>Aşama</th><th>Durum</th></tr>${info.stages.map((st, i) => {
    const done = i < info.idx || (info.done && i === info.idx);
    const cur = i === info.idx && !info.done;
    const b = done ? `<span class="b" style="background:${colors.success}">Tamamlandı</span>` : cur ? `<span class="b" style="background:${colors.brandPrimary}">Şu anki aşama</span>` : "-";
    return `<tr><td>${i + 1}</td><td>${esc(st)}</td><td>${b}</td></tr>`;
  }).join("")}</table>` : "";
  const sch = schedules.filter((s) => s.project_id === project.id);
  const badge = (s: string) => `<span class="b" style="background:${statusColor(s)}">${esc(STATUS[s] || s)}</span>`;

  const finance = includeFinance ? `
    <h2>Finans</h2>
    <table class="kpi"><tr>
      <td><small>Teklif</small><b>${fmtMoney(project.offer_amount)}</b></td>
      <td><small>Anlaşılan</small><b>${fmtMoney(project.agreed_amount)}</b></td>
      <td><small>Alınan</small><b style="color:${colors.success}">${fmtMoney(project.received_amount)}</b></td>
      <td><small>Kalan</small><b style="color:${colors.warning}">${project.payment_completed ? "Ödeme tamamlandı" : fmtMoney(project.remaining_amount)}</b></td>
    </tr></table>
    <table><tr><th>Tarih</th><th>Tutar</th><th>Açıklama</th></tr>
      ${payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${fmtMoney(p.amount)}</td><td>${esc(p.note)}</td></tr>`).join("") || `<tr><td colspan="3">Ödeme yok</td></tr>`}
    </table>` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(project.name)} Raporu</title>
  <style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:${colors.onSurface};padding:24px;font-size:12px}
    h1{color:${colors.brandPrimary};margin:0 0 4px;font-size:22px} h2{font-size:15px;color:${colors.brandPrimary};border-bottom:2px solid ${colors.brandTertiary};padding-bottom:4px;margin-top:22px}
    .meta{color:${colors.muted};margin-bottom:4px} table{width:100%;border-collapse:collapse;margin-top:6px}
    th,td{text-align:left;padding:6px;border-bottom:1px solid ${colors.border};vertical-align:top} th{background:${colors.brandTertiary}}
    .kpi td{border:1px solid ${colors.border};width:25%} .kpi small{display:block;color:${colors.muted};text-transform:uppercase;font-size:10px} .kpi b{font-size:15px}
    .b{color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700}
  </style></head><body>
    <h1>${esc(project.name)}</h1>
    <div class="meta">Müşteri: ${esc(project.client_name) || "-"} ${project.client_phone ? "• " + esc(project.client_phone) : ""}</div>
    <div class="meta">Lokasyon: ${esc(project.location) || "-"} • Durum: ${esc(STATUS[project.status] || project.status)}</div>
    <div class="meta">İş türü: ${esc(categoryLabel(catOf(project)))}</div>
    <div class="meta">Ekip: ${team.length ? team.map(esc).join(", ") : "-"}</div>
    <div class="meta">Rapor tarihi: ${fmtDate(new Date())}</div>
    ${finance}
    ${stageHtml}
    <h2>Süreç Adımları</h2>
    <table><tr><th>Kurum</th><th>Adım</th><th>Durum</th><th>Not</th></tr>
      ${steps.map((s) => `<tr><td>${esc(s.institution)}</td><td>${esc(s.title)}</td><td>${badge(s.status)}</td><td>${esc(s.note)}</td></tr>`).join("") || `<tr><td colspan="4">Adım yok</td></tr>`}
    </table>
    <h2>Arazi Programı</h2>
    <table><tr><th>Tarih</th><th>Başlık</th><th>Lokasyon</th><th>Durum</th></tr>
      ${sch.map((s) => `<tr><td>${fmtDate(s.date)} ${new Date(s.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</td><td>${esc(s.title)}</td><td>${esc(s.location)}</td><td>${badge(s.status)}</td></tr>`).join("") || `<tr><td colspan="4">Program yok</td></tr>`}
    </table>
    <h2>Evraklar</h2>
    <div class="meta">Eksik evraklar: ${missing.length ? missing.map(esc).join(", ") : "Yok"}</div>
    <table><tr><th>Dosya</th><th>Kategori</th><th>Yükleme</th></tr>
      ${docs.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(docLabel(d.category))}</td><td>${fmtDate(d.created_at)}</td></tr>`).join("") || `<tr><td colspan="3">Evrak yok</td></tr>`}
    </table>
  </body></html>`;

  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: project.name });
  }
}

export function whatsappNumber(raw: string) {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "90" + d.slice(1);
  if (d.length === 10 && d.startsWith("5")) d = "90" + d;
  return d;
}
