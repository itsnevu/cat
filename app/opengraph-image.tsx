import { ImageResponse } from "next/og";

/**
 * 1200×630 social card (og:image / twitter:image) rendered at build time via
 * the file-based metadata convention — replaces the 256px logo, which is too
 * small for a summary_large_image card. Colors mirror lib/brand.ts.
 */
export const alt = "SPHYNX — the gatekeeper for 24/7 markets";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          backgroundColor: "#1E1610",
          color: "#F3E9D2",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, letterSpacing: 12, color: "#E8B85A" }}>
          MARKETS NEVER CLOSE NOW · NEITHER DOES THE GATEKEEPER
        </div>
        <div style={{ display: "flex", fontSize: 172, fontWeight: 800, letterSpacing: -6, marginTop: 8 }}>
          SPHYNX
        </div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 20, color: "#B9A98A" }}>
          Every swap answers the riddle · you approve every brokerage order · a scoped, expiring key
        </div>
        <div style={{ display: "flex", fontSize: 24, marginTop: 12, color: "#8E8069" }}>
          Mainnet · unaudited · deposits capped · no track record
        </div>
        <div
          style={{
            position: "absolute",
            left: 96,
            bottom: 64,
            display: "flex",
            fontSize: 26,
            color: "#E8B85A",
          }}
        >
          sphynxagent.xyz
        </div>
      </div>
    ),
    size
  );
}
