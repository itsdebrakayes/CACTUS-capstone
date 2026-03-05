import { describe, expect, it } from "vitest";

describe("Mapbox Token Validation", () => {
  it("should have VITE_MAPBOX_TOKEN set in environment", () => {
    const token = process.env.VITE_MAPBOX_TOKEN;
    expect(token).toBeDefined();
    expect(token).toMatch(/^pk\./); // Mapbox public tokens start with 'pk.'
    expect(token?.length).toBeGreaterThan(20); // Tokens are typically long strings
  });

  it("should validate token format", () => {
    const token = process.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      expect.fail("Token not set");
      return;
    }
    
    // Mapbox public token format: pk.{base64_encoded_data} (may have multiple dots)
    const parts = token.split(".");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]).toBe("pk");
    expect(token.length).toBeGreaterThan(30);
  });
});
