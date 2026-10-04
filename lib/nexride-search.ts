import { places, type Place } from "./nexride-places";
import type { Language } from "./nexride-i18n";
export type Endpoint = Place & {
  source: "preview" | "provider" | "device" | "pin";
  confirmed: boolean;
  accuracy?: number;
};
export type Bounds = [number, number, number, number];
export const PREVIEW_BOUNDS: Bounds = [38.66, 8.84, 38.91, 9.11];
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
const amLocality: [string, string][] = [
  ["Addis Ababa", "አዲስ አበባ"],
  ["Kolfe Keranyo", "ኮልፌ ቀራንዮ"],
  ["Kolfe Keranio", "ኮልፌ ቀራንዮ"],
  ["Nifas Silk-Lafto", "ንፋስ ስልክ ላፍቶ"],
  ["Bole", "ቦሌ"],
  ["Yeka", "የካ"],
  ["Kirkos", "ቂርቆስ"],
  ["Arada", "አራዳ"],
  ["Entoto", "እንጦጦ"],
  ["Meskel Square", "መስቀል አደባባይ"],
  ["Kazanchis", "ካዛንቺስ"],
];
export function placeName(p: Place, language: Language) {
  return language === "am" ? amNames[p.name] || p.name : p.name;
}
export function locality(p: Place, language: Language) {
  const distinct =
    p.name === "Kolfe"
      ? p.lat < 9.02
        ? "Kolfe Keranio · West"
        : "Kolfe · North"
      : p.address;
  if (language === "en") return distinct;
  const area = amLocality.find(([name]) => p.address.includes(name));
  return `${area?.[1] || "አዲስ አበባ"} · ${p.name === "Kolfe" ? (p.lat < 9.02 ? "ምዕራብ" : "ሰሜን") : p.address}`;
}
export function searchPreviewPlaces(query: string) {
  const q = query.normalize("NFKC").toLocaleLowerCase().trim();
  const unique = places.filter(
    (p, i) => places.findIndex((a) => placeKey(a) === placeKey(p)) === i,
  );
  return (
    q
      ? unique.filter((p) =>
          `${p.name} ${p.address} ${amNames[p.name] || ""} ${locality(p, "am")}`
            .toLocaleLowerCase()
            .includes(q),
        )
      : unique.slice(0, 8)
  ).slice(0, 12);
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
