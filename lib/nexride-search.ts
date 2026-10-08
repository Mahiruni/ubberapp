import { places, type Place } from "./nexride-places";
import type { Language } from "./nexride-i18n";
export type Endpoint = Place & {
  source: "preview" | "provider" | "device" | "pin";
  confirmed: boolean;
  accuracy?: number;
};
export type Bounds = [number, number, number, number];
// Addis metro coverage: central Addis plus the practical surrounding urban belt
// (Burayu/Sebeta/Holeta to the west, Sululta/Sendafa to the north,
// Legetafo/Legedadi to the east, and Gelan/Dukem/Bishoftu to the south-east).
// Provider search still ranks nearby/core Addis results first.
export const ADDIS_CORE_BOUNDS: Bounds = [38.66, 8.84, 38.91, 9.11];
export const PREVIEW_BOUNDS: Bounds = [38.45, 8.65, 39.12, 9.28];

export const ADDIS_SUBCITIES = [
  { en: "Addis Ketema", am: "አዲስ ከተማ", aliases: ["addis ketema", "addis ketema sub city"] },
  { en: "Akaky Kaliti", am: "አቃቂ ቃሊቲ", aliases: ["akaki kaliti", "akaky kaliti"] },
  { en: "Arada", am: "አራዳ", aliases: ["arada"] },
  { en: "Bole", am: "ቦሌ", aliases: ["bole"] },
  { en: "Gullele", am: "ጉለሌ", aliases: ["gulele", "gullele"] },
  { en: "Kirkos", am: "ቂርቆስ", aliases: ["kirkos"] },
  { en: "Kolfe Keranio", am: "ኮልፌ ቀራንዮ", aliases: ["kolfe keranio", "kolfe keranyo", "kolfe"] },
  { en: "Lideta", am: "ልደታ", aliases: ["lideta"] },
  { en: "Nifas Silk-Lafto", am: "ንፋስ ስልክ ላፍቶ", aliases: ["nifas silk lafto", "nefas silk lafto", "lafto"] },
  { en: "Yeka", am: "የካ", aliases: ["yeka"] },
  { en: "Lemi Kura", am: "ለሚ ኩራ", aliases: ["lemi kura", "lemi-kura"] },
] as const;
export function validPoint(p: unknown): p is { lat: number; lng: number } {
  const v = p as { lat?: number; lng?: number } | null;
  return (
    !!v &&
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    Math.abs(v.lat) <= 90 &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lng) &&
    Math.abs(v.lng) <= 180
  );
}
export function insideBounds(p: { lat: number; lng: number }, bounds: Bounds) {
  return (
    p.lng >= bounds[0] &&
    p.lat >= bounds[1] &&
    p.lng <= bounds[2] &&
    p.lat <= bounds[3]
  );
}
export function serviceBounds(raw?: string): {
  bounds: Bounds;
  kind: "configured" | "preview";
} {
  const b = raw?.split(",").map(Number);
  if (
    b?.length === 4 &&
    b.every(Number.isFinite) &&
    validPoint({ lng: b[0], lat: b[1] }) &&
    validPoint({ lng: b[2], lat: b[3] }) &&
    b[0] < b[2] &&
    b[1] < b[3]
  )
    return { bounds: b as Bounds, kind: "configured" };
  return { bounds: PREVIEW_BOUNDS, kind: "preview" };
}
export const placeKey = (p: Place) => `${p.name}|${p.lat}|${p.lng}`;
const amNames: Record<string, string> = {
  "Bole Atlas": "ቦሌ አትላስ",
  "Bole Airport": "ቦሌ ዓለም አቀፍ አውሮፕላን ማረፊያ",
  "Bole Medhanealem": "ቦሌ መድኃኔዓለም",
  "Edna Mall": "ኤድና ሞል",
  "Friendship Mall": "ፍሬንድሺፕ ሞል",
  Kazanchis: "ካዛንቺስ",
  UNECA: "የተባበሩት መንግሥታት የአፍሪካ ኢኮኖሚ ኮሚሽን",
  "Meskel Square": "መስቀል አደባባይ",
  "Mexico Square": "ሜክሲኮ አደባባይ",
  Piassa: "ፒያሳ",
  "4 Kilo": "አራት ኪሎ",
  "6 Kilo": "ስድስት ኪሎ",
  "National Palace": "ብሔራዊ ቤተ መንግሥት",
  "St. George Cathedral": "ቅዱስ ጊዮርጊስ",
  Lideta: "ልደታ",
  Gotera: "ጎተራ",
  "Sar Bet": "ሳር ቤት",
  Jemo: "ጀሞ",
  Lafto: "ላፍቶ",
  Gerji: "ገርጂ",
  Megenagna: "መገናኛ",
  CMC: "ሲኤምሲ",
  Ayat: "አያት",
  Summit: "ሰሚት",
  Shola: "ሾላ",
  "Gerji Mebrat Hayl": "ገርጂ መብራት ኃይል",
  "Hayat Hospital": "ሐያት ሆስፒታል",
  "Africa Avenue": "አፍሪካ አቬኑ",
  "Bole Rwanda": "ቦሌ ሩዋንዳ",
  "CMC Michael": "ሲኤምሲ ሚካኤል",
  "Entoto Park": "እንጦጦ ፓርክ",
  "Entoto Maryam": "እንጦጦ ማርያም",
  "Unity Park": "አንድነት ፓርክ",
  "Addis Ababa Stadium": "አዲስ አበባ ስታዲየም",
  "Sheraton Addis": "ሸራተን አዲስ",
  "Hilton Addis Ababa": "ሂልተን አዲስ አበባ",
  "Hyatt Regency Addis Ababa": "ሐያት ሪጀንሲ አዲስ አበባ",
  "African Union": "የአፍሪካ ሕብረት",
  "Bole Atlas Mall": "ቦሌ አትላስ ሞል",
  "Shola Gebeya": "ሾላ ገበያ",
  "Megenagna Square": "መገናኛ አደባባይ",
  Kirkos: "ቂርቆስ",
  "Kazanchis Roundabout": "ካዛንቺስ አደባባይ",
  Legehar: "ለገሃር",
  Stadium: "ስታዲየም",
  "Old Airport": "ድሮ አውሮፕላን ማረፊያ",
  "Summit Furi": "ሰሚት ፉሪ",
  Kolfe: "ኮልፌ",
  Merkato: "መርካቶ",
  "Shiro Meda": "ሽሮ ሜዳ",
  "Bethel Hospital": "ቤቴል ሆስፒታል",
  "Bethel Adebabay": "ቤቴል አደባባይ",
  "Anfo Adebabay": "አንፎ አደባባይ",
  "Anfo Meda": "አንፎ ሜዳ",
  "Anfo Bridge": "አንፎ ድልድይ",
  "Anfo Mosque": "አንፎ መስጊድ",
  "Kolfe Keranyo": "ኮልፌ ቀራንዮ",
  "Kolfe Tiwan": "ኮልፌ ትዋን",
  "Kolfe Health Center": "ኮልፌ ጤና ጣቢያ",
  Kera: "ቄራ",
  "Kera Gofa Road": "ቄራ ጎፋ መንገድ",
  "Bulgariya Mazoriya": "ቡልጋሪያ ማዞሪያ",
  Lancha: "ላንቻ",
  "Nifas Silk": "ንፋስ ስልክ",
  "Nifas Silk Lafto": "ንፋስ ስልክ ላፍቶ",
  "Akaki Kaliti": "አቃቂ ቃሊቲ",
  "Akaki Beseka": "አቃቂ በሰቃ",
  "Lemi Kura": "ለሚ ኩራ",
  Gullele: "ጉለሌ",
  Arada: "አራዳ",
};

const placeAliases: Record<string, string[]> = {
  "Bole Airport": ["bole airport", "bole international airport", "airport", "ቦሌ ኤርፖርት"],
  "Bole Medhanealem": ["bole medhanialem", "bole medhane alem", "medhanialem", "መድኃኔዓለም"],
  Piassa: ["piazza", "piassa", "piyasa", "ፒያሳ"],
  Megenagna: ["megenagna", "megenagnia", "megenanya", "መገናኛ"],
  "Megenagna Square": ["megenagna square", "megenanya square", "መገናኛ አደባባይ"],
  Merkato: ["mercato", "merkato", "መርካቶ"],
  Kazanchis: ["kazanchis", "kazanchies", "ካዛንቺስ"],
  "Meskel Square": ["meskel square", "mesqel square", "መስቀል አደባባይ"],
  "Mexico Square": ["mexico square", "mexico", "ሜክሲኮ"],
  "4 Kilo": ["4 kilo", "arat kilo", "arba kilo", "አራት ኪሎ"],
  "6 Kilo": ["6 kilo", "sidist kilo", "ስድስት ኪሎ"],
  "Shiro Meda": ["shiromeda", "shiro meda", "ሽሮ ሜዳ"],
  "Sar Bet": ["sarbet", "sar bet", "ሳር ቤት"],
  "Bole Rwanda": ["rwanda", "bole rwanda", "ቦሌ ሩዋንዳ"],
  "Shola Gebeya": ["shola market", "shola gebeya", "ሾላ ገበያ"],
  "Kolfe Keranyo": ["kolfe keranyo", "kolfe keranio", "ኮልፌ ቀራንዮ"],
  "Nifas Silk Lafto": ["nifas silk lafto", "nefas silk lafto", "ንፋስ ስልክ ላፍቶ"],
  "Akaki Kaliti": ["akaki kaliti", "akaky kaliti", "አቃቂ ቃሊቲ"],
  "Lemi Kura": ["lemi kura", "lemi-kura", "ለሚ ኩራ"],
};
const amLocality: [string, string][] = [
  ...ADDIS_SUBCITIES.flatMap((subcity) => [
    [subcity.en, subcity.am] as [string, string],
    ...subcity.aliases.map((alias) => [alias, subcity.am] as [string, string]),
  ]),
  ["Addis Ababa", "አዲስ አበባ"],
  ["Kolfe Keranyo", "ኮልፌ ቀራንዮ"],
  ["Entoto", "እንጦጦ"],
  ["Meskel Square", "መስቀል አደባባይ"],
  ["Kazanchis", "ካዛንቺስ"],
];
export function placeName(p: Place, language: Language) {
  return language === "am"
    ? p.nameAm || amNames[p.name] || p.name
    : p.name;
}

export function locality(p: Place, language: Language) {
  const distinct =
    p.name === "Kolfe"
      ? p.lat < 9.02
        ? "Kolfe Keranio · West"
        : "Kolfe · North"
      : [p.neighborhood, p.subcity, p.address].filter(Boolean).join(" · ") ||
        p.address;
  if (language === "en") return distinct;

  const source = `${p.subcity || ""} ${p.address}`.toLocaleLowerCase();
  const area = amLocality.find(([name]) =>
    source.includes(name.toLocaleLowerCase()),
  );
  return `${area?.[1] || "አዲስ አበባ"} · ${p.name === "Kolfe" ? (p.lat < 9.02 ? "ምዕራብ" : "ሰሜን") : p.address}`;
}

const normalizeSearch = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function localSearchText(p: Place) {
  const subcity = ADDIS_SUBCITIES.find((item) => {
    const haystack = `${p.subcity || ""} ${p.address}`.toLocaleLowerCase();
    return (
      haystack.includes(item.en.toLocaleLowerCase()) ||
      item.aliases.some((alias) => haystack.includes(alias))
    );
  });
  return normalizeSearch(
    [
      p.name,
      p.nameAm,
      amNames[p.name],
      p.address,
      p.neighborhood,
      p.subcity,
      ...(p.aliases || []),
      ...(placeAliases[p.name] || []),
      subcity?.en,
      subcity?.am,
      ...(subcity?.aliases || []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function searchPreviewPlaces(query: string) {
  const q = normalizeSearch(query);
  const unique = places.filter(
    (p, i) => places.findIndex((a) => placeKey(a) === placeKey(p)) === i,
  );

  if (!q) {
    return unique
      .slice()
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 8);
  }

  return unique
    .map((place) => {
      const name = normalizeSearch(place.name);
      const am = normalizeSearch(place.nameAm || amNames[place.name] || "");
      const aliases = [
        ...(place.aliases || []),
        ...(placeAliases[place.name] || []),
      ].map(normalizeSearch);
      const text = localSearchText(place);
      let score = 0;
      if (name === q || am === q || aliases.includes(q)) score += 100;
      if (name.startsWith(q) || am.startsWith(q)) score += 60;
      if (aliases.some((alias) => alias.startsWith(q))) score += 50;
      if (text.includes(q)) score += 20;
      score += Math.min(15, place.popularity || 0);
      return { place, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.place)
    .slice(0, 20);
}
export const previewEndpoint = (p: Place): Endpoint => ({
  ...p,
  source: "preview",
  confirmed: true,
});
export const endpointKey = (p: Endpoint | null, d: Endpoint | null) =>
  p && d
    ? `${p.lat},${p.lng};${d.lat},${d.lng};${p.confirmed};${d.confirmed}`
    : "";
