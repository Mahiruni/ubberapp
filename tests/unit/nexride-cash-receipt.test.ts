import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const script = readFileSync("public/nexride/screens/completion.js", "utf8");
const fragment = script.slice(
  script.indexOf("const paymentStatus=()=>"),
  script.indexOf("function render(){"),
);

function presentation(status: string, method: string) {
  const receipt = { payment: { status, method } };
  return runInNewContext(fragment + ";paymentPresentation()", { receipt }) as {
    status: string;
    label: string;
    details: string;
    notice: string;
  };
}

describe("cash payment receipt", () => {
  it.each(["pending", "failed", "unknown"])(
    "never reports online payment failure for cash with status %s",
    (status) => {
      const display = presentation(status, "Cash");
      expect(display.status).toBe("cash");
      expect(display.label).toBe("Cash payment");
      expect(display.details).toBe("Cash · with driver");
      expect(display.notice).toBe("");
    },
  );
  it("does not claim unverified cash payments are paid", () => {
    expect(presentation("pending", "cash").label).not.toBe("Paid");
    expect(presentation("paid", "Cash").label).toBe("Paid");
  });
  it("preserves genuine electronic payment failure warnings", () => {
    const display = presentation("failed", "Chapa");
    expect(display.status).toBe("failed");
    expect(display.label).toBe("Payment failed");
    expect(display.notice).toContain("payment was not completed");
  });
});
