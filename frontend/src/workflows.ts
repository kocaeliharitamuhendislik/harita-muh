// İş türleri, evrak listeleri ve süreç aşamaları tek yerde.
export type ProjectCategory = "kadastro" | "belediye" | "diger";

export const PROJECT_CATEGORIES: { key: ProjectCategory; label: string; short: string }[] = [
  { key: "kadastro", label: "Kadastro İşler", short: "Kadastro" },
  { key: "belediye", label: "Belediye İşler", short: "Belediye" },
  { key: "diger", label: "Diğer İşler", short: "Diğer" },
];

export const DOC_TYPES: Record<ProjectCategory, { key: string; label: string }[]> = {
  kadastro: [
    { key: "tapu", label: "Tapu" },
    { key: "kimlik", label: "Kimlik" },
    { key: "sozlesme", label: "Sözleşme" },
    { key: "imar_durumu", label: "İmar Durumu" },
    { key: "damga_vergisi", label: "Damga Vergisi" },
    { key: "fatura", label: "Fatura" },
    { key: "kadastro_ekleri", label: "Kadastro Ekleri" },
  ],
  belediye: [
    { key: "tapu", label: "Tapu" },
    { key: "kimlik", label: "Kimlik" },
    { key: "aplikasyon_krokisi", label: "Aplikasyon Krokisi" },
    { key: "imar_durumu", label: "İmar Durumu" },
    { key: "onayli_plankote", label: "Onaylı Plankote" },
    { key: "onayli_yapi_aplikasyon", label: "Onaylı Yapı Aplikasyon" },
    { key: "arazi_foto", label: "Arazi Fotoğrafı" },
  ],
  diger: [
    { key: "tapu", label: "Tapu" },
    { key: "kimlik", label: "Kimlik" },
    { key: "kroki", label: "Kroki" },
    { key: "foto", label: "Fotoğraf" },
    { key: "diger", label: "Diğer" },
  ],
};

export const STAGES: Partial<Record<ProjectCategory, string[]>> = {
  kadastro: [
    "Eksik evrak bekleniyor",
    "Dosya hazırlanıyor ve imar durumu bekleniyor",
    "Dosya belediyede, encümen kararı bekleniyor",
    "Dosya kadastroda onaylanıp tapuya gönderilmesi bekleniyor",
    "Kadastro onayı alındı, işlem tapuda",
    "İşlem tamamlandı",
  ],
  belediye: [
    "Eksik evrak bekleniyor",
    "Plankote arazisine çıkıldı",
    "Kotlar mimara gönderildi",
    "İmar durumu çıktı, plankote hazırlanıyor",
    "Plankote onaylandı, mimari ön inceleme bekleniyor",
    "Yapı aplikasyon alındı, arazi için ruhsat bekleniyor",
    "Ruhsat çıktı, temel üstü için haber bekleniyor",
  ],
};

export function catOf(p: any): ProjectCategory {
  return p?.category === "kadastro" || p?.category === "belediye" ? p.category : "diger";
}

export function categoryLabel(c: string) {
  return PROJECT_CATEGORIES.find((x) => x.key === c)?.label ?? "Diğer İşler";
}

const ALL_DOC_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(DOC_TYPES).flat().map((d) => [d.key, d.label]),
);
export function docLabel(key: string) {
  return ALL_DOC_LABELS[key] ?? (key === "imar" ? "İmar" : key);
}

export function stageInfo(p: any) {
  const stages = STAGES[catOf(p)];
  if (!stages) return null;
  const idx = Math.min(Math.max(p?.stage_index ?? 0, 0), stages.length - 1);
  return { stages, idx, label: stages[idx], done: idx === stages.length - 1 };
}
