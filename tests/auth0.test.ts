import { describe, expect, it } from "vitest";
import { authBaseUrl } from "@/lib/auth0";

const RENDER = "https://deepretain.onrender.com";

describe("authBaseUrl", () => {
  it("uses Render's public URL when APP_BASE_URL is unset", () => {
    expect(authBaseUrl({ RENDER_EXTERNAL_URL: RENDER })).toBe(RENDER);
  });

  it("ignores a localhost APP_BASE_URL on Render", () => {
    expect(authBaseUrl({ APP_BASE_URL: "http://localhost:3000", RENDER_EXTERNAL_URL: RENDER })).toBe(RENDER);
    expect(authBaseUrl({ APP_BASE_URL: "http://127.0.0.1:3000", RENDER_EXTERNAL_URL: RENDER })).toBe(RENDER);
  });

  it("keeps a public APP_BASE_URL, such as a custom domain", () => {
    expect(authBaseUrl({ APP_BASE_URL: "https://deepretain.example.com", RENDER_EXTERNAL_URL: RENDER })).toBe(
      "https://deepretain.example.com",
    );
  });

  it("keeps localhost for local development", () => {
    expect(authBaseUrl({ APP_BASE_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
    expect(authBaseUrl({})).toBeUndefined();
  });
});
