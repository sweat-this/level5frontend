// Test-only local HTTPS edge for the production Playwright suite (issue #10). Terminates TLS
// with a freshly-generated, never-persisted self-signed certificate and reverse-proxies to the
// plain-HTTP `next start` process, so the app under test genuinely sees an HTTPS request the way
// it would behind a real load balancer/reverse proxy - required for the __Host-/Secure cookie
// attributes (session-cookie policy) to ever actually apply, which is the entire reason this
// suite exists as a separate mode from the dev-mode e2e/ suite.
//
// Not shippable/deployable: the cert is generated in-memory on every run (see selfsigned below)
// and never written to disk or committed. Playwright's config sets ignoreHTTPSErrors: true for
// this suite specifically, rather than trying to get this certificate trusted system-wide.
//
// Also models the trusted-client-IP contract's edge-side half (see src/lib/net/trusted-client-ip.ts
// and docs/architecture/web-authentication.md): strips any client-supplied copy of the configured
// trusted header before forwarding, then - only if LEVEL5_E2E_PROD_TRUSTED_IP_VALUE is set - sets
// its own value, the same "strip, then overwrite" behavior a real edge must guarantee.

import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import selfsigned from "selfsigned";

const HTTPS_PORT = Number(process.env.LEVEL5_E2E_PROD_HTTPS_PORT ?? "3443");
const APP_PORT = Number(process.env.LEVEL5_E2E_PROD_APP_PORT ?? "3200");
const TRUSTED_IP_HEADER = process.env.LEVEL5_E2E_PROD_TRUSTED_IP_HEADER;
const TRUSTED_IP_VALUE = process.env.LEVEL5_E2E_PROD_TRUSTED_IP_VALUE;

async function generateCert() {
  const attrs = [{ name: "commonName", value: "localhost" }];
  // selfsigned@5's generate() is async-only (returns a Promise), unlike earlier majors.
  const pems = await selfsigned.generate(attrs, {
    days: 1,
    keySize: 2048,
    extensions: [
      { name: "basicConstraints", cA: false },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
        ],
      },
    ],
  });
  return { key: pems.private, cert: pems.cert };
}

function proxyRequest(clientReq, clientRes) {
  const headers = { ...clientReq.headers };
  // The `Host` header the upstream Node http client sends is necessarily the internal
  // 127.0.0.1:APP_PORT address (that's who it's actually connecting to) - a real reverse proxy
  // in this position is expected to also forward the *original* public host/scheme via
  // X-Forwarded-Host/X-Forwarded-Proto, which is exactly what Next.js's own Server Actions
  // Origin-vs-host CSRF check reads (falling back to a raw Host header only when neither is
  // present) - without this, Next rejects every Server Action here as a host/origin mismatch,
  // even though the browser's real Origin (https://localhost:HTTPS_PORT) is completely correct.
  const publicHost = clientReq.headers.host ?? `localhost:${HTTPS_PORT}`;
  delete headers.host;
  headers["x-forwarded-host"] = publicHost;
  headers["x-forwarded-proto"] = "https";
  if (TRUSTED_IP_HEADER) {
    delete headers[TRUSTED_IP_HEADER.toLowerCase()];
    if (TRUSTED_IP_VALUE) {
      headers[TRUSTED_IP_HEADER.toLowerCase()] = TRUSTED_IP_VALUE;
    }
  }

  const upstreamReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: APP_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    },
  );
  upstreamReq.on("error", () => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502);
    }
    clientRes.end("Bad Gateway (test HTTPS proxy could not reach next start)");
  });
  clientReq.pipe(upstreamReq);
}

const { key, cert } = await generateCert();
const server = createHttpsServer({ key, cert }, proxyRequest);
server.listen(HTTPS_PORT, () => {
  console.log(
    `[https-proxy] listening on https://localhost:${HTTPS_PORT}, forwarding to http://127.0.0.1:${APP_PORT}`,
  );
});
