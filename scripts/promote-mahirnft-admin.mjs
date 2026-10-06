import { createClient } from "@supabase/supabase-js";

const targetEmail = "mahirnft@gmail.com";
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

if (!supabaseUrl || !serviceKey) {
  throw new Error("NexRide admin bootstrap failed: production Supabase credentials unavailable.");
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

let targetUser = null;

for (let page = 1; page <= 50 && !targetUser; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 1000,
  });

  if (error) throw error;

  targetUser = data.users.find(
    (user) => (user.email || "").trim().toLowerCase() === targetEmail,
  );

  if (data.users.length < 1000) break;
}

if (!targetUser) {
  throw new Error("NexRide admin bootstrap failed: target account was not found.");
}

const { data: existing, error: readError } = await supabase
  .from("profiles")
  .select("id,role,admin_role,account_status")
  .eq("id", targetUser.id)
  .maybeSingle();

if (readError) throw readError;

if (existing) {
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      role: "admin",
      admin_role: "super_admin",
      account_status: "active",
    })
    .eq("id", targetUser.id);

  if (updateError) throw updateError;
} else {
  const { error: insertError } = await supabase.from("profiles").insert({
    id: targetUser.id,
    role: "admin",
    admin_role: "super_admin",
    account_status: "active",
  });

  if (insertError) throw insertError;
}

const { data: verified, error: verifyError } = await supabase
  .from("profiles")
  .select("id,role,admin_role,account_status")
  .eq("id", targetUser.id)
  .single();

if (verifyError) throw verifyError;

if (
  verified.role !== "admin" ||
  verified.admin_role !== "super_admin" ||
  verified.account_status !== "active"
) {
  throw new Error("NexRide admin bootstrap verification failed.");
}

console.log("NexRide admin bootstrap verified: mahirnft@gmail.com = admin/super_admin/active.");
