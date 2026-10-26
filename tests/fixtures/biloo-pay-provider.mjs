// Loaded ONLY by the isolated payment E2E command via NODE_OPTIONS.
// This is a provider test double. It is never imported by application code.
if (process.env.BILOO_PAY_LOCAL_TEST !== "1")
  throw Error("Local fixture loader requires explicit test mode");
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const target = new URL(
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url,
  );
  if (target.origin === "https://api.chapa.co") {
    return fetchOriginal(
      "http://127.0.0.1:54391/chapa" + target.pathname,
      init,
    );
  }
  if (["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
    return fetchOriginal(input, init);
  // A test must not reach a real authentication, payment, map or telemetry service.
  return Promise.reject(
    Error("External network is disabled in Biloo Pay E2E fixtures"),
  );
};
