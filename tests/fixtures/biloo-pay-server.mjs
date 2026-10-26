/** Isolated synthetic Supabase/Chapa HTTP boundaries backed by actual local PostgreSQL. */
import { createServer } from "node:http";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
export const ids = {
  rider: "10000000-0000-4000-8000-000000000001",
  driver: "20000000-0000-4000-8000-000000000001",
  admin: "50000000-0000-4000-8000-000000000001",
  cash: "30000000-0000-4000-8000-000000000001",
  digital: "30000000-0000-4000-8000-000000000002",
  account: "40000000-0000-4000-8000-000000000001",
};
export const encryptionSecret = "biloo-local-test-encryption-key-only";
function encrypted(value) {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(encryptionSecret).digest(),
      iv,
    );
  const result = Buffer.concat([cipher.update(value), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    result.toString("base64url"),
  ].join(".");
}
export async function startPayFixture() {
  let db;
  const payments = new Map(),
    payouts = new Map();
  let providerState = "success";
  async function reset() {
    await db?.close();
    db = new PGlite();
    payments.clear();
    payouts.clear();
    providerState = "success";
    await db.exec(readFileSync("tests/fixtures/biloo-pay-schema.sql", "utf8"));
    await db.exec(
      readFileSync(
        "supabase/migrations/20261026044430_biloo_pay_secure_ledger.sql",
        "utf8",
      ),
    );
    await db.exec(`insert into public.profiles(id,role,account_status,admin_role) values('${ids.rider}','rider','active',null),('${ids.driver}','driver','active',null),('${ids.admin}','admin','active','super_admin');
      insert into public.drivers values('${ids.driver}','approved');
      update biloo_pay.settings set writes_enabled=true,commission_bps=2000,policy_version='synthetic-local-test';
      insert into public.ride_requests values('${ids.cash}','${ids.rider}','${ids.driver}','completed','cash','pending',100,100,80,'TEST pickup','TEST cash destination',now(),now()),
        ('${ids.digital}','${ids.rider}','${ids.driver}','completed','chapa','pending',200,200,160,'TEST pickup','TEST digital destination',now(),now());`);
    await db.query(
      "insert into public.driver_payout_accounts(id,driver_id,bank_code,bank_name,account_name,account_number_ciphertext,account_number_last4,status,updated_at) values($1,$2,'1','TEST bank','TEST Driver',$3,'3456','configured',now())",
      [ids.account, ids.driver, encrypted("123456")],
    );
  }
  await reset();
  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3007");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ||
        "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.end();
      return;
    }
    const send = (body, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, "http://127.0.0.1:54391");
    const raw = await Array.fromAsync(req);
    const body = raw.length ? JSON.parse(Buffer.concat(raw).toString()) : {};
    try {
      if (url.pathname === "/__test/reset") {
        await reset();
        return send({ test: true });
      }
      if (url.pathname === "/__test/provider") {
        providerState = body.state;
        return send({ test: true });
      }
      if (url.pathname === "/__test/counts")
        return send(
          (
            await db.query(
              "select (select count(*)::int from biloo_pay.journals) journals,(select count(*)::int from biloo_pay.settlements) settlements",
            )
          ).rows[0],
        );
      if (url.pathname.startsWith("/chapa/")) {
        if (url.pathname.endsWith("/transaction/initialize")) {
          payments.set(body.tx_ref, body);
          return send({
            status: "success",
            data: {
              checkout_url:
                "https://checkout.chapa.co/TEST-ONLY-" + body.tx_ref,
            },
          });
        }
        if (url.pathname.includes("/transaction/verify/")) {
          const ref = decodeURIComponent(url.pathname.split("/").pop()),
            p = payments.get(ref);
          return p
            ? send({
                status: "success",
                data: {
                  ...p,
                  status: providerState,
                  mode: "test",
                  reference: "TEST-PROVIDER-" + ref,
                },
              })
            : send({}, 404);
        }
        if (url.pathname.endsWith("/banks"))
          return send({
            status: "success",
            data: [{ id: 1, name: "TEST bank" }],
          });
        if (url.pathname.endsWith("/transfers")) {
          payouts.set(body.reference, body);
          return send({
            status: "success",
            data: { reference: body.reference, status: "pending" },
          });
        }
        if (url.pathname.includes("/transfers/verify/")) {
          const p = payouts.get(
            decodeURIComponent(url.pathname.split("/").pop()),
          );
          return p
            ? send({
                status: "success",
                data: { ...p, status: providerState, mode: "test" },
              })
            : send({}, 404);
        }
        return send({ error: "unknown synthetic provider route" }, 404);
      }
      const token = (req.headers.authorization || "").replace(/^Bearer /, "");
      const uid = Object.values(ids).find((id) =>
        token.includes(
          Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString(
            "base64url",
          ),
        ),
      );
      if (url.pathname === "/auth/v1/user") {
        if (!uid) return send({ message: "invalid local-test token" }, 401);
        const role =
          uid === ids.rider ? "rider" : uid === ids.driver ? "driver" : "admin";
        return send({
          id: uid,
          email: role + "@example.test",
          aud: "authenticated",
          role: "authenticated",
          created_at: "2026-01-01T00:00:00Z",
          app_metadata: {},
          user_metadata: { full_name: "TEST " + role, role },
        });
      }
      const service = token === "local-test-service-key";
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        if (!service) return send({ message: "denied" }, 403);
        const name = url.pathname.split("/").pop();
        if (
          !/^biloo_pay_[a-z_]+_server$/.test(name) ||
          Object.keys(body).some((k) => !/^p_[a-z_]+$/.test(k))
        )
          return send({}, 403);
        const keys = Object.keys(body),
          values = Object.values(body);
        const data = await db.transaction(async (tx) => {
          await tx.exec("set local role service_role");
          return (
            await tx.query(
              `select public.${name}(${keys.map((k, i) => k + "=>$" + (i + 1)).join(",")}) value`,
              values,
            )
          ).rows[0].value;
        });
        return send(data);
      }
      if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.split("/").pop();
        const single = req.headers.accept?.includes("object+json");
        let rows = [];
        if (table === "profiles") {
          const id = url.searchParams.get("id")?.replace(/^eq\./, "") || uid;
          if (!service && id !== uid) return send([], 403);
          rows = (
            await db.query("select * from public.profiles where id=$1", [id])
          ).rows.map((r) => ({
            ...r,
            full_name: "TEST " + r.role,
            phone: "+251900000000",
          }));
        } else if (table === "drivers")
          rows = (
            await db.query("select * from public.drivers where id=$1", [
              url.searchParams.get("id")?.replace(/^eq\./, "") || uid,
            ])
          ).rows.map((r) => ({
            ...r,
            is_online: false,
            vehicle: "TEST car",
            vehicle_plate: "TEST 001",
          }));
        else if (table === "driver_payout_accounts" && service)
          rows = (
            await db.query(
              "select * from public.driver_payout_accounts where driver_id=$1",
              [url.searchParams.get("driver_id")?.replace(/^eq\./, "")],
            )
          ).rows;
        return send(single ? rows[0] || null : rows);
      }
      send({ error: "local fixture route unavailable" }, 404);
    } catch (error) {
      send({ message: error.message, code: error.code || "TEST_ERROR" }, 400);
    }
  });
  await new Promise((resolve) => server.listen(54391, "127.0.0.1", resolve));
  return {
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}
