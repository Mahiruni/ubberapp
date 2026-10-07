export type AddisSubcity =
  | "Addis Ketema"
  | "Akaky Kaliti"
  | "Arada"
  | "Bole"
  | "Gullele"
  | "Kirkos"
  | "Kolfe Keranio"
  | "Lideta"
  | "Nifas Silk-Lafto"
  | "Yeka"
  | "Lemi Kura";

export type Place = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  nameAm?: string;
  aliases?: string[];
  category?: string;
  subcity?: AddisSubcity | string;
  neighborhood?: string;
  provider?: "nexride" | "mapbox" | "openstreetmap" | string;
  providerPlaceId?: string;
  verified?: boolean;
  popularity?: number;
  updatedAt?: string;
};
export const places: Place[] = [
  {
    name: "Bole Atlas",
    address: "Bole, Atlas area",
    lat: 8.9956,
    lng: 38.7885,
  },
  {
    name: "Bole Airport",
    address: "Bole International Airport",
    lat: 8.9779,
    lng: 38.7993,
  },
  {
    name: "Bole Medhanealem",
    address: "Bole, Medhanealem area",
    lat: 8.997,
    lng: 38.7854,
  },
  {
    name: "Edna Mall",
    address: "Bole Road, near Medhanealem",
    lat: 8.9962,
    lng: 38.7858,
  },
  {
    name: "Friendship Mall",
    address: "Bole Road, Bole",
    lat: 8.987,
    lng: 38.7889,
  },
  {
    name: "Kazanchis",
    address: "Kazanchis business district",
    lat: 9.0146,
    lng: 38.767,
  },
  {
    name: "UNECA",
    address: "Menelik II Avenue, Kazanchis",
    lat: 9.0078,
    lng: 38.7625,
  },
  {
    name: "Meskel Square",
    address: "Meskel Square, Addis Ababa",
    lat: 9.0107,
    lng: 38.7613,
  },
  {
    name: "Mexico Square",
    address: "Mexico Square, Addis Ababa",
    lat: 9.0034,
    lng: 38.7466,
  },
  { name: "Piassa", address: "Piassa, Addis Ababa", lat: 9.0349, lng: 38.7524 },
  { name: "4 Kilo", address: "4 Kilo, Arada", lat: 9.037, lng: 38.7616 },
  { name: "6 Kilo", address: "6 Kilo, Addis Ababa", lat: 9.0321, lng: 38.7703 },
  {
    name: "National Palace",
    address: "Churchill Avenue area",
    lat: 9.0197,
    lng: 38.7525,
  },
  {
    name: "St. George Cathedral",
    address: "Piazza, Arada",
    lat: 9.0355,
    lng: 38.7522,
  },
  { name: "Lideta", address: "Lideta, Addis Ababa", lat: 9.0158, lng: 38.7408 },
  { name: "Gotera", address: "Gotera, Addis Ababa", lat: 8.9915, lng: 38.738 },
  {
    name: "Sar Bet",
    address: "Sar Bet, Addis Ababa",
    lat: 9.0046,
    lng: 38.7278,
  },
  { name: "Jemo", address: "Jemo, Addis Ababa", lat: 8.9642, lng: 38.6928 },
  {
    name: "Lafto",
    address: "Lafto, Nifas Silk-Lafto",
    lat: 8.9757,
    lng: 38.7046,
  },
  { name: "Gerji", address: "Gerji, Addis Ababa", lat: 9.0045, lng: 38.8215 },
  {
    name: "Megenagna",
    address: "Megenagna, Addis Ababa",
    lat: 9.0164,
    lng: 38.808,
  },
  { name: "CMC", address: "CMC, Yeka", lat: 9.0225, lng: 38.8352 },
  { name: "Ayat", address: "Ayat, Yeka", lat: 9.0275, lng: 38.8578 },
  { name: "Summit", address: "Summit, Yeka", lat: 9.0165, lng: 38.8738 },
  { name: "Shola", address: "Shola Market area", lat: 9.0197, lng: 38.7955 },
  {
    name: "Gerji Mebrat Hayl",
    address: "Gerji Mebrat Hayl",
    lat: 9.0067,
    lng: 38.829,
  },
  {
    name: "Hayat Hospital",
    address: "Bole, Hayat area",
    lat: 8.991,
    lng: 38.8175,
  },
  {
    name: "Africa Avenue",
    address: "Bole Road, Africa Avenue",
    lat: 9.0017,
    lng: 38.7706,
  },
  {
    name: "Bole Rwanda",
    address: "Bole Rwanda, Addis Ababa",
    lat: 8.9951,
    lng: 38.771,
  },
  {
    name: "CMC Michael",
    address: "CMC Michael area",
    lat: 9.0222,
    lng: 38.8292,
  },
  {
    name: "Entoto Park",
    address: "Entoto Mountain, Addis Ababa",
    lat: 9.083,
    lng: 38.7667,
  },
  {
    name: "Entoto Maryam",
    address: "Entoto Mountain",
    lat: 9.0862,
    lng: 38.7643,
  },
  {
    name: "Unity Park",
    address: "Menelik II Palace grounds",
    lat: 9.0207,
    lng: 38.761,
  },
  {
    name: "Addis Ababa Stadium",
    address: "Churchill Avenue / Stadium area",
    lat: 9.011,
    lng: 38.7508,
  },
  {
    name: "Sheraton Addis",
    address: "Taitu Street, Addis Ababa",
    lat: 9.0235,
    lng: 38.76,
  },
  {
    name: "Hilton Addis Ababa",
    address: "Menelik II Avenue",
    lat: 9.0237,
    lng: 38.7685,
  },
  {
    name: "Hyatt Regency Addis Ababa",
    address: "Meskel Square area",
    lat: 9.0108,
    lng: 38.7618,
  },
  {
    name: "African Union",
    address: "Roosevelt Street, Addis Ababa",
    lat: 9.0004,
    lng: 38.7465,
  },
  {
    name: "Bole Atlas Mall",
    address: "Bole Atlas, Addis Ababa",
    lat: 8.996,
    lng: 38.79,
  },
  {
    name: "Shola Gebeya",
    address: "Shola Market, Yeka",
    lat: 9.0202,
    lng: 38.797,
  },
  {
    name: "Megenagna Square",
    address: "Megenagna, Addis Ababa",
    lat: 9.017,
    lng: 38.8074,
  },
  { name: "Kirkos", address: "Kirkos, Addis Ababa", lat: 9.0048, lng: 38.7568 },
  {
    name: "Kazanchis Roundabout",
    address: "Kazanchis, Addis Ababa",
    lat: 9.013,
    lng: 38.769,
  },
  {
    name: "Legehar",
    address: "Legehar / Railway Station area",
    lat: 9.018,
    lng: 38.7428,
  },
  {
    name: "Stadium",
    address: "Addis Ababa Stadium area",
    lat: 9.011,
    lng: 38.7508,
  },
  {
    name: "Old Airport",
    address: "Old Airport, Addis Ababa",
    lat: 8.9975,
    lng: 38.7797,
  },
  { name: "Summit Furi", address: "Summit area", lat: 8.999, lng: 38.87 },
  {
    name: "Kolfe",
    address: "Kolfe Keranio, Addis Ababa",
    lat: 9.0025,
    lng: 38.694,
  },
  {
    name: "Merkato",
    address: "Merkato, Addis Ababa",
    lat: 9.0306,
    lng: 38.7384,
  },
  {
    name: "Shiro Meda",
    address: "Shiro Meda, Addis Ababa",
    lat: 9.0572,
    lng: 38.77,
  },
  {
    name: "Bethel Hospital",
    address: "Weyira Area, Kolfe Keranyo",
    lat: 9.00459,
    lng: 38.69292,
  },
  {
    name: "Bethel Adebabay",
    address: "Bethel, Kolfe Keranyo",
    lat: 9.0032,
    lng: 38.6965,
  },
  {
    name: "Anfo Adebabay",
    address: "Anfo Adebabay, Kolfe Keranyo",
    lat: 9.02101,
    lng: 38.67874,
  },
  {
    name: "Anfo Meda",
    address: "Anfo, Kolfe Keranyo",
    lat: 9.0185,
    lng: 38.681,
  },
  {
    name: "Anfo Bridge",
    address: "Anfo Dildiy, Kolfe Keranyo",
    lat: 9.0146,
    lng: 38.677,
  },
  {
    name: "Anfo Mosque",
    address: "Ambo Road, Anfo Adebabay",
    lat: 9.0178,
    lng: 38.6798,
  },
  { name: "Kolfe", address: "Kolfe, Addis Ababa", lat: 9.0374, lng: 38.71696 },
  {
    name: "Kolfe Keranyo",
    address: "Kolfe Keranyo Sub-City",
    lat: 8.9977331,
    lng: 38.68622481,
  },
  {
    name: "Kolfe Tiwan",
    address: "Kolfe Tiwan, Addis Ababa",
    lat: 9.04436,
    lng: 38.71831,
  },
  {
    name: "Kolfe Health Center",
    address: "Kolfe Keranyo, Addis Ababa",
    lat: 9.045128,
    lng: 38.711155,
  },
  {
    name: "Kera",
    address: "Kera, Nefas Silk / Kirkos area",
    lat: 8.98478,
    lng: 38.75024,
  },
  {
    name: "Kera Gofa Road",
    address: "Kera, Gofa Road",
    lat: 8.98134,
    lng: 38.7497,
  },
  { name: "Gotera", address: "Gotera, Addis Ababa", lat: 8.9915, lng: 38.738 },
  {
    name: "Bulgariya Mazoriya",
    address: "Bulgariya Mazoriya, Addis Ababa",
    lat: 8.9858,
    lng: 38.744,
  },
  { name: "Lancha", address: "Lancha, Addis Ababa", lat: 8.988, lng: 38.756 },
  {
    name: "Nifas Silk",
    address: "Nifas Silk, Addis Ababa",
    lat: 8.97572,
    lng: 38.7271,
  },
  {
    name: "Nifas Silk Lafto",
    address: "Nifas Silk Lafto Sub-City",
    lat: 8.95077233,
    lng: 38.73041217,
  },
  {
    name: "Akaki Kaliti",
    address: "Akaki Kaliti Sub-City",
    lat: 8.898546,
    lng: 38.80237141,
  },
  {
    name: "Akaki Beseka",
    address: "Akaki Beseka, Addis Ababa",
    lat: 8.866667,
    lng: 38.783333,
  },
  {
    name: "Lemi Kura",
    address: "Lemi Kura Sub-City",
    lat: 9.00995695,
    lng: 38.87032423,
  },
  {
    name: "Gullele",
    address: "Gullele Sub-City",
    lat: 9.07112227,
    lng: 38.73670792,
  },
  { name: "Arada", address: "Arada Sub-City", lat: 9.03568992, lng: 38.755621 },
  { name: "Kirkos", address: "Kirkos, Addis Ababa", lat: 9.0048, lng: 38.7568 },
];
