export type IdentityActivityKind = "document_submitted" | "document_status_changed" | "phone_verified" | "phone_changed" | "identity_review_submitted" | "identity_review_status_changed" | "deletion_requested" | "deletion_review_status_changed";
const labels: Record<IdentityActivityKind,readonly [string,string]> = {
  document_submitted:["Identity document submitted","የማንነት ሰነድ ተልኳል"],
  document_status_changed:["Identity document reviewed","የማንነት ሰነድ ተገምግሟል"],
  phone_verified:["Phone ownership verified","የስልክ ባለቤትነት ተረጋግጧል"],
  phone_changed:["Verified phone changed","የተረጋገጠ ስልክ ተቀይሯል"],
  identity_review_submitted:["Account ownership review requested","የመለያ ግምገማ ተጠይቋል"],
  identity_review_status_changed:["Account ownership review updated","የመለያ ግምገማ ተዘምኗል"],
  deletion_requested:["Account deletion review requested","መለያ መሰረዝ ተጠይቋል"],
  deletion_review_status_changed:["Account deletion review updated","የመለያ ማስወገድ ግምገማ ተዘምኗል"],
};
export function identityActivityLabel(type: string,lang:"en"|"am"="en"):string {
  const label=labels[type as IdentityActivityKind];
  return label ? label[lang==="am"?1:0] : (lang==="am"?"የመለያ እንቅስቃሴ":"Account activity");
}
