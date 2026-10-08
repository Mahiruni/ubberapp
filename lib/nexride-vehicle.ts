export const VEHICLE_COLOR_OPTIONS = [
  { value: "White", en: "White", am: "ነጭ" },
  { value: "Black", en: "Black", am: "ጥቁር" },
  { value: "Silver", en: "Silver", am: "ብርማ" },
  { value: "Gray", en: "Gray", am: "ግራጫ" },
  { value: "Blue", en: "Blue", am: "ሰማያዊ" },
  { value: "Red", en: "Red", am: "ቀይ" },
  { value: "Green", en: "Green", am: "አረንጓዴ" },
  { value: "Brown", en: "Brown", am: "ቡናማ" },
  { value: "Beige", en: "Beige", am: "ቤዥ" },
  { value: "Gold", en: "Gold", am: "ወርቃማ" },
  { value: "Yellow", en: "Yellow", am: "ቢጫ" },
  { value: "Orange", en: "Orange", am: "ብርቱካናማ" },
] as const;

export type VehicleColor = (typeof VEHICLE_COLOR_OPTIONS)[number]["value"];

export function normalizeVehicleColor(value: unknown): VehicleColor | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  return (
    VEHICLE_COLOR_OPTIONS.find(
      (option) => option.value.toLowerCase() === normalized,
    )?.value || ""
  );
}
