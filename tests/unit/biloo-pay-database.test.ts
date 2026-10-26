import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const rider = "10000000-0000-4000-8000-000000000001";
const driver = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const ride = "30000000-0000-4000-8000-000000000001";
const ride2 = "30000000-0000-4000-8000-000000000002";
const account = "40000000-0000-4000-8000-000000000001";
let db: PGlite;
const scalar = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ value: any }>(sql, args)).rows[0]?.value;
async function cash(id = ride, actor = driver, key = "cash_confirmation_0001") {
  return scalar("select public.biloo_pay_confirm_cash_server($1,$2,$3) value", [
    id,
    actor,
    key,
  ]);
}
async function digital() {
  await db.exec(
    `update public.ride_requests set payment_method='chapa' where id='${ride}';`,
  );
  const a = await scalar(
    "select public.biloo_pay_begin_payment_server($1,$2,$3,$4,'test') value",
    [ride, rider, "checkout_request_00001", "biloo-test-ref"],
  );
  const evidence = {
    status: "success",
    txRef: a.tx_ref,
    amountMinor: 10000,
    currency: "ETB",
    mode: "test",
    reference: "provider-test-reference",
  };
  return { a, evidence };
}
async function settle(a: any, evidence: any) {
  return scalar("select public.biloo_pay_settle_chapa_server($1,$2) value", [
    a.id,
    evidence,
  ]);
}
async function reserve(minor: number, key = "withdrawal_request_001") {
  return scalar(
    "select public.biloo_pay_reserve_payout_server($1,$2,$3,$4,$5) value",
    [driver, account, minor, key, "payout_" + key],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("tests/fixtures/biloo-pay-schema.sql", "utf8"));
  await db.exec(
    readFileSync(
      "supabase/migrations/20261026044430_biloo_pay_secure_ledger.sql",
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(`begin;
    insert into public.profiles(id,role,account_status) values('${rider}','rider','active'),('${driver}','driver','active'),('${other}','driver','active');
    insert into public.drivers values('${driver}','approved'),('${other}','approved');
    update biloo_pay.settings set writes_enabled=true,commission_bps=2000,policy_version='local-test-only';
    insert into public.ride_requests values('${ride}','${rider}','${driver}','completed','cash','pending',100,100,80,'Local pickup','Local destination',now(),now()),
      ('${ride2}','${rider}','${driver}','completed','cash','pending',100,100,80,'Local pickup','Local destination',now(),now());
    insert into public.driver_payout_accounts(id,driver_id,bank_code,bank_name,account_name,account_number_ciphertext,account_number_last4,status,updated_at) values('${account}','${driver}','1','Test bank','Test driver','encrypted-test-only','0001','configured',now());
    set local role service_role;`);
});
afterEach(async () => {
  await db.exec("rollback");
});

describe("Biloo Pay PostgreSQL accounting and permissions", () => {
  it("requires a second database activation gate", async () => {
    await db.exec(
      "reset role; update biloo_pay.settings set writes_enabled=false; set role service_role;",
    );
    await expect(cash()).rejects.toThrow("BILOO_PAY_NOT_ENABLED");
  });
  it("confirms cash once, records commission debt, and NEVER credits a wallet", async () => {
    expect((await cash()).status).toBe("recorded");
    expect((await cash()).existing).toBe(true);
    const balance = await scalar("select biloo_pay.driver_balance($1) value", [
      driver,
    ]);
    expect(balance).toEqual({
      availableMinor: 0,
      commissionDueMinor: 2000,
      digitalPayableMinor: 0,
      withdrawalPendingMinor: 0,
    });
    expect(
      await scalar("select count(*)::int value from biloo_pay.journals"),
    ).toBe(1);
    await db.exec("set constraints all immediate");
  });
  it("does not confirm cash when a trip merely completes", async () => {
    await db.exec(
      `update public.ride_requests set status='in_trip' where id='${ride}'; update public.ride_requests set status='completed' where id='${ride}';`,
    );
    expect(
      await scalar(
        "select payment_status value from public.ride_requests where id=$1",
        [ride],
      ),
    ).toBe("pending");
    expect(
      await scalar("select count(*)::int value from biloo_pay.settlements"),
    ).toBe(0);
  });
  it("rejects confirmation by another driver", async () => {
    await expect(cash(ride, other)).rejects.toThrow("BILOO_PAY_FORBIDDEN");
  });
  it("rejects an unreviewed historical commission", async () => {
    await db.exec(
      `reset role; alter table biloo_pay.terms disable trigger immutable; delete from biloo_pay.terms; set role service_role;`,
    );
    await expect(cash()).rejects.toThrow("BILOO_PAY_TERMS_REVIEW_REQUIRED");
  });
  it("rejects a cash confirmation for an electronic trip", async () => {
    await digital();
    await expect(cash()).rejects.toThrow("BILOO_PAY_CASH_NOT_ELIGIBLE");
  });
  it("posts a verified digital fare and commission exactly once", async () => {
    const { a, evidence } = await digital();
    await settle(a, evidence);
    await settle(a, evidence);
    expect(
      await scalar("select count(*)::int value from biloo_pay.journals"),
    ).toBe(1);
    expect(
      await scalar("select biloo_pay.driver_balance($1) value", [driver]),
    ).toMatchObject({ availableMinor: 8000, digitalPayableMinor: 8000 });
    await db.exec("set constraints all immediate");
  });
  it.each([
    ["mode", "live"],
    ["amountMinor", 9999],
    ["currency", "USD"],
    ["txRef", "another"],
    ["reference", ""],
    ["status", "pending"],
  ])("rejects provider %s mismatches", async (field, value) => {
    const { a, evidence } = await digital();
    await expect(settle(a, { ...evidence, [field]: value })).rejects.toThrow(
      "BILOO_PAY_PROVIDER_MISMATCH",
    );
  });
  it("binds an idempotency key to its ride even if amounts are equal", async () => {
    await digital();
    await db.exec(
      `update public.ride_requests set payment_method='chapa' where id='${ride2}';`,
    );
    await expect(
      scalar(
        "select public.biloo_pay_begin_payment_server($1,$2,$3,$4,'test') value",
        [ride2, rider, "checkout_request_00001", "second-ref"],
      ),
    ).rejects.toThrow("BILOO_PAY_IDEMPOTENCY_CONFLICT");
  });
  it("reserves only one potentially chargeable attempt per ride", async () => {
    const { a } = await digital();
    const duplicate = await scalar(
      "select public.biloo_pay_begin_payment_server($1,$2,$3,$4,'test') value",
      [ride, rider, "different_key_0000001", "another-ref"],
    );
    expect(duplicate.id).toBe(a.id);
    expect(duplicate.existing).toBe(true);
  });
  it("settles cash commission from digital funds with a balanced offset", async () => {
    await cash(ride2);
    const { a, evidence } = await digital();
    await settle(a, evidence);
    expect(
      await scalar("select biloo_pay.driver_balance($1) value", [driver]),
    ).toMatchObject({
      availableMinor: 6000,
      commissionDueMinor: 0,
      digitalPayableMinor: 6000,
    });
  });
  it("nets cash commission from existing digital funds without a second commission charge", async () => {
    const { a, evidence } = await digital();
    await settle(a, evidence);
    await cash(ride2);
    expect(
      await scalar("select biloo_pay.driver_balance($1) value", [driver]),
    ).toMatchObject({ availableMinor: 6000, commissionDueMinor: 0 });
    expect(
      await scalar(
        "select -sum(amount_minor)::int value from biloo_pay.entries where account='commission_revenue'",
      ),
    ).toBe(4000);
    expect(
      await scalar(
        "select commission_offset_minor::int value from biloo_pay.settlements where ride_id=$1",
        [ride2],
      ),
    ).toBe(2000);
    await db.exec("set constraints all immediate");
  });
  it("reserves withdrawals atomically and prevents overspending", async () => {
    const { a, evidence } = await digital();
    await settle(a, evidence);
    const p = await reserve(6000);
    expect((await reserve(6000)).id).toBe(p.id);
    expect(
      await scalar("select biloo_pay.driver_balance($1) value", [driver]),
    ).toMatchObject({ availableMinor: 2000, withdrawalPendingMinor: 6000 });
    await expect(reserve(3000, "other_withdrawal_00001")).rejects.toThrow(
      "BILOO_PAY_INSUFFICIENT_FUNDS",
    );
  });
  it("requires exact verification evidence before payout success or release", async () => {
    const { a, evidence } = await digital();
    await settle(a, evidence);
    const p = await reserve(6000);
    await expect(
      scalar(
        "select public.biloo_pay_finalize_payout_server($1,'paid',$2) value",
        [p.id, { reference: p.reference }],
      ),
    ).rejects.toThrow("BILOO_PAY_PAYOUT_EVIDENCE_REQUIRED");
  });
  it.each(["paid", "failed"])(
    "handles verified payout %s once without creating funds",
    async (state) => {
      const { a, evidence } = await digital();
      await settle(a, evidence);
      const p = await reserve(6000);
      const e = {
        state,
        reference: p.reference,
        amountMinor: 6000,
        currency: "ETB",
        mode: "test",
      };
      await scalar(
        "select public.biloo_pay_finalize_payout_server($1,$2,$3) value",
        [p.id, state, e],
      );
      await scalar(
        "select public.biloo_pay_finalize_payout_server($1,$2,$3) value",
        [p.id, state, e],
      );
      expect(
        await scalar("select biloo_pay.driver_balance($1) value", [driver]),
      ).toMatchObject({
        availableMinor: state === "paid" ? 2000 : 8000,
        withdrawalPendingMinor: 0,
      });
      await db.exec("set constraints all immediate");
    },
  );
  it("holds withdrawals when a signed reversal needs review", async () => {
    const { a, evidence } = await digital();
    await settle(a, evidence);
    await scalar(
      "select public.biloo_pay_provider_review_server($1,'charge.reversed',$2) value",
      [a.tx_ref, "a".repeat(64)],
    );
    await expect(reserve(1000)).rejects.toThrow("BILOO_PAY_FINANCE_HOLD");
  });
  it("prevents editing or deleting a posted ledger", async () => {
    await cash();
    await db.exec("reset role");
    await expect(
      db.exec("update biloo_pay.entries set amount_minor=0"),
    ).rejects.toThrow("BILOO_PAY_IMMUTABLE");
  });
  it("rejects unbalanced journals at the transaction boundary", async () => {
    await db.exec(
      `insert into biloo_pay.journals(idempotency_key,kind,actor_id) values('unbalanced','cash_collection','${driver}');`,
    );
    await expect(db.exec("set constraints all immediate")).rejects.toThrow(
      "BILOO_PAY_UNBALANCED_JOURNAL",
    );
  });
  it.each(["anon", "authenticated"])(
    "denies %s access to financial RPCs and private records",
    async (role) => {
      await db.exec(`set local role ${role}`);
      await expect(
        scalar("select public.biloo_pay_snapshot_server($1,'driver') value", [
          driver,
        ]),
      ).rejects.toThrow(/permission denied/);
    },
  );
  it("preserves ordinary authenticated Driver trip updates without private schema access", async () => {
    await db.exec(
      `update public.ride_requests set status='in_trip' where id='${ride}'; set local role authenticated;`,
    );
    await db.query(
      "update public.ride_requests set status='completed' where id=$1",
      [ride],
    );
    expect(
      await scalar(
        "select payment_status value from public.ride_requests where id=$1",
        [ride],
      ),
    ).toBe("pending");
  });
  it("protects money columns from direct client updates", async () => {
    await db.exec("set local role authenticated");
    await expect(
      db.query(
        "update public.ride_requests set payment_status='paid' where id=$1",
        [ride],
      ),
    ).rejects.toThrow("BILOO_PAY_FINANCIAL_FIELDS_PROTECTED");
  });
  it("makes the environment immutable after the first posting", async () => {
    await cash();
    await db.exec("reset role");
    await expect(
      db.exec("update biloo_pay.settings set mode='live'"),
    ).rejects.toThrow("BILOO_PAY_ENVIRONMENT_IMMUTABLE");
  });
  it("freezes the withdrawal destination even if the saved account changes", async () => {
    const { a, evidence } = await digital();
    await settle(a, evidence);
    const p = await reserve(1000);
    await scalar(
      "select public.biloo_pay_save_account_server($1,'2','Another test bank','Test driver','v1.new-ciphertext','0002') value",
      [driver],
    );
    const held = await scalar(
      "select public.biloo_pay_payout_server($1) value",
      [p.id],
    );
    expect(held.bank_code).toBe("1");
    expect(held.account_ciphertext).toBe("encrypted-test-only");
    expect(
      await scalar(
        "select count(*)::int value from biloo_pay.audit where action='payout_account_saved'",
      ),
    ).toBe(1);
  });
  it("gives neither public client role execute rights on any new money RPC", async () => {
    const exposed =
      await scalar(`select count(*)::int value from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'biloo_pay_%'
      and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))`);
    expect(exposed).toBe(0);
  });
  it("retains the finance hold until a provider refund/reversal is reconciled", async () => {
    const { a, evidence } = await digital();
    await settle(a, evidence);
    await scalar(
      "select public.biloo_pay_provider_review_server($1,'charge.reversed',$2) value",
      [a.tx_ref, "b".repeat(64)],
    );
    const c = await scalar("select id value from biloo_pay.cases limit 1");
    await db.exec("reset role");
    await db.query(
      "insert into public.profiles values($1,'admin','active','super_admin')",
      ["50000000-0000-4000-8000-000000000001"],
    );
    await db.exec("set role service_role");
    expect(
      await scalar("select biloo_pay.driver_balance($1) value", [driver]),
    ).toMatchObject({ availableMinor: 0 });
    await expect(
      scalar(
        "select public.biloo_pay_review_case_server($1,$2,'closed','Do not release without verification') value",
        ["50000000-0000-4000-8000-000000000001", c],
      ),
    ).rejects.toThrow("BILOO_PAY_PROVIDER_REVIEW_REQUIRED");
  });
  it("does not expose another role's report through the service RPC", async () => {
    await expect(
      scalar("select public.biloo_pay_snapshot_server($1,'admin') value", [
        rider,
      ]),
    ).rejects.toThrow("BILOO_PAY_FORBIDDEN");
  });
});
