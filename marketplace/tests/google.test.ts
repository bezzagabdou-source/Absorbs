import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrivateKey, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { verifyGoogleIdToken, resetGoogleCertificateCache } from "@/lib/auth/google";

/**
 * The verifier trusts nothing but a signature made by Google's private key, so the
 * tests play Google: a real RSA key pair, a real RS256 signature, and a stubbed
 * certificate endpoint that serves a certificate carrying that public key.
 */
const PROJECT = "mohtal-9b1d3";
const KID = "test-kid";
const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
const fs = require("node:fs") as typeof import("node:fs");
const os = require("node:os") as typeof import("node:os");
const path = require("node:path") as typeof import("node:path");

const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), "dz-google-"));
const keyPem = path.join(fixtures, "google.key");
const certPem = path.join(fixtures, "google.crt");
execFileSync("openssl", ["genrsa", "-out", keyPem, "2048"], { stdio: "ignore" });
execFileSync("openssl", ["req", "-new", "-x509", "-key", keyPem, "-subj", "/CN=google-test", "-days", "30", "-out", certPem], { stdio: "ignore" });

const privateKey: KeyObject = createPrivateKey(fs.readFileSync(keyPem, "utf8"));
const certificate: string = fs.readFileSync(certPem, "utf8");

type Claims = Record<string, unknown>;

function token(claims: Claims, options: { alg?: string; kid?: string | null; signature?: string } = {}) {
  const header = { alg: options.alg ?? "RS256", kid: options.kid === undefined ? KID : options.kid, typ: "JWT" };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode(header)}.${encode(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(body);
  const signature = options.signature ?? signer.sign(privateKey).toString("base64url");
  return `${body}.${signature}`;
}

const now = () => Math.floor(Date.now() / 1000);
const validClaims = (over: Claims = {}): Claims => ({
  aud: PROJECT,
  iss: `https://securetoken.google.com/${PROJECT}`,
  sub: "uid-123",
  exp: now() + 3600,
  iat: now() - 10,
  email: "buyer@example.com",
  email_verified: true,
  name: "Buyer",
  picture: "https://example.com/a.png",
  firebase: { sign_in_provider: "google.com" },
  ...over,
});

const googleFetch = () => (async (url: string | URL | Request) => {
  expect(String(url)).toContain("securetoken@system.gserviceaccount.com");
  return new Response(JSON.stringify({ [KID]: certificate }), { status: 200 });
}) as unknown as typeof fetch;

const googleFetchDown = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;

beforeEach(() => { process.env.FIREBASE_PROJECT_ID = PROJECT; resetGoogleCertificateCache(); });
afterAll(() => { delete process.env.FIREBASE_PROJECT_ID; resetGoogleCertificateCache(); });

describe("Firebase Google ID token verification", () => {
  it("accepts a correctly signed Google token and normalises the email", async () => {
    const identity = await verifyGoogleIdToken(token(validClaims({ email: "  Buyer@Example.COM " })), googleFetch());
    expect(identity).toEqual({
      uid: "uid-123", email: "buyer@example.com", emailVerified: true,
      name: "Buyer", picture: "https://example.com/a.png", signInProvider: "google.com",
    });
  });

  it("rejects a tampered payload even with a valid-looking signature", async () => {
    const good = token(validClaims());
    const [header, , signature] = good.split(".");
    const forged = Buffer.from(JSON.stringify(validClaims({ email: "attacker@example.com" }))).toString("base64url");
    await expect(verifyGoogleIdToken(`${header}.${forged}.${signature}`, googleFetch()))
      .rejects.toMatchObject({ code: "google_invalid_token", status: 401 });
  });

  it("rejects a token that is not signed by Google's key", async () => {
    const { privateKey: other } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const body = `${Buffer.from(JSON.stringify({ alg: "RS256", kid: KID })).toString("base64url")}.${Buffer.from(JSON.stringify(validClaims())).toString("base64url")}`;
    const signer = createSign("RSA-SHA256"); signer.update(body);
    await expect(verifyGoogleIdToken(`${body}.${signer.sign(other).toString("base64url")}`, googleFetch()))
      .rejects.toMatchObject({ code: "google_invalid_token" });
  });

  it("rejects wrong audience, wrong issuer and expired tokens", async () => {
    for (const claims of [
      validClaims({ aud: "someone-else" }),
      validClaims({ iss: "https://securetoken.google.com/other" }),
      validClaims({ exp: now() - 5 }),
      validClaims({ iat: now() + 600 }),
    ]) {
      process.env.FIREBASE_PROJECT_ID = PROJECT;
      await expect(verifyGoogleIdToken(token(claims), googleFetch())).rejects.toMatchObject({ code: "google_invalid_token" });
    }
  });

  it("only accepts the Google provider", async () => {
    await expect(verifyGoogleIdToken(token(validClaims({ firebase: { sign_in_provider: "password" } })), googleFetch()))
      .rejects.toMatchObject({ code: "google_unsupported_provider", status: 403 });
  });

  it("requires a usable e-mail address", async () => {
    await expect(verifyGoogleIdToken(token(validClaims({ email: "" })), googleFetch()))
      .rejects.toMatchObject({ code: "google_email_required", status: 400 });
  });

  it("refuses to verify when the project is not configured or certificates are unreachable", async () => {
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    await expect(verifyGoogleIdToken(token(validClaims()), googleFetch())).rejects.toMatchObject({ code: "google_not_configured", status: 503 });
    process.env.FIREBASE_PROJECT_ID = PROJECT;
    resetGoogleCertificateCache();
    await expect(verifyGoogleIdToken(token(validClaims()), googleFetchDown)).rejects.toMatchObject({ code: "google_unavailable", status: 503 });
  });

  it("rejects a token whose header is not RS256", async () => {
    await expect(verifyGoogleIdToken(token(validClaims(), { alg: "HS256" }), googleFetch()))
      .rejects.toMatchObject({ code: "google_invalid_token" });
  });

  it("rejects malformed input cheaply, before any network call", async () => {
    for (const bad of ["", "abc", "a.b.c", "x".repeat(9000)]) {
      await expect(verifyGoogleIdToken(bad, googleFetchDown)).rejects.toMatchObject({ code: "google_invalid_token" });
    }
  });
});
