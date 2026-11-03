import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  generarSecreto,
  hashSecreto,
  redirectUriValida,
  rolPuedeUsarMcp,
  urlPublica,
  verificarPkce,
  verificarSecreto,
} from "./oauth-util";

describe("verificarPkce", () => {
  const verifier = "a".repeat(43) + "-._~XYZ0123";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  it("acepta el verifier que corresponde al challenge", () => {
    expect(verificarPkce(verifier, challenge)).toBe(true);
  });

  it("rechaza otro verifier", () => {
    expect(verificarPkce("b".repeat(50), challenge)).toBe(false);
  });

  it("rechaza verifiers fuera de formato (cortos o con caracteres raros)", () => {
    expect(verificarPkce("corto", challenge)).toBe(false);
    expect(verificarPkce("a".repeat(42) + "!", challenge)).toBe(false);
  });
});

describe("secretos", () => {
  it("llevan prefijo y no se repiten", () => {
    const a = generarSecreto("mlla_at_");
    const b = generarSecreto("mlla_at_");
    expect(a.startsWith("mlla_at_")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("se verifican contra su hash", () => {
    const s = generarSecreto("mlla_cs_");
    expect(verificarSecreto(s, hashSecreto(s))).toBe(true);
    expect(verificarSecreto(s + "x", hashSecreto(s))).toBe(false);
  });
});

describe("redirectUriValida", () => {
  it("acepta https y la propia computadora", () => {
    expect(redirectUriValida("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriValida("http://localhost:6274/oauth/callback")).toBe(true);
    expect(redirectUriValida("http://127.0.0.1:33418/callback")).toBe(true);
  });

  it("rechaza http a otro lado, esquemas raros y fragmentos", () => {
    expect(redirectUriValida("http://evil.com/cb")).toBe(false);
    expect(redirectUriValida("javascript:alert(1)")).toBe(false);
    expect(redirectUriValida("https://claude.ai/cb#x")).toBe(false);
    expect(redirectUriValida("no es una url")).toBe(false);
  });
});

describe("rolPuedeUsarMcp", () => {
  it("dueños, admin y encargadas sí; empleadas no", () => {
    expect(rolPuedeUsarMcp("superadmin")).toBe(true);
    expect(rolPuedeUsarMcp("admin")).toBe(true);
    expect(rolPuedeUsarMcp("encargada")).toBe(true);
    expect(rolPuedeUsarMcp("empleado")).toBe(false);
  });
});

describe("urlPublica", () => {
  const original = process.env.MALALA_PUBLIC_BASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.MALALA_PUBLIC_BASE_URL;
    else process.env.MALALA_PUBLIC_BASE_URL = original;
  });

  it("detrás de Caddy toma el protocolo de X-Forwarded-Proto", () => {
    delete process.env.MALALA_PUBLIC_BASE_URL;
    const h = new Headers({ host: "malala.com.ar", "x-forwarded-proto": "https" });
    expect(urlPublica(h)).toBe("https://malala.com.ar");
  });

  it("sin X-Forwarded-Proto, un dominio va por https", () => {
    delete process.env.MALALA_PUBLIC_BASE_URL;
    expect(urlPublica(new Headers({ host: "malala.com.ar" }))).toBe("https://malala.com.ar");
  });

  it("afuera manda MALALA_PUBLIC_BASE_URL", () => {
    process.env.MALALA_PUBLIC_BASE_URL = "https://malala.com.ar/";
    expect(urlPublica(new Headers({ host: "2.25.185.242:3060" }))).toBe("https://malala.com.ar");
  });

  it("en local usa el host del request aunque la variable apunte a producción", () => {
    process.env.MALALA_PUBLIC_BASE_URL = "https://malala.com.ar";
    expect(urlPublica(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });
});
