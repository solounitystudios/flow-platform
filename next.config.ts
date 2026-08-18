import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },
  // Dev only: GitHub Codespaces' local port-forwarding hop does not preserve
  // the browser's real `Origin` header on the way to `next dev` — it arrives
  // as the literal artifact `localhost:<port>`, while `x-forwarded-host`
  // correctly carries the public forwarded domain (confirmed from the dev
  // server log: "`x-forwarded-host` header with value `<codespace>.app.github.dev`
  // does not match `origin` header with value `localhost:3000`"). Next's
  // Server Actions CSRF check (app-render/action-handler.js) compares
  // allowedOrigins against that Origin value, not the forwarded host, so the
  // forwarded domain itself would not fix this — the artifact value is what
  // has to be listed. Not needed in production, which isn't proxied through
  // this local hop.
  ...(isDev && {
    experimental: {
      serverActions: {
        allowedOrigins: [`localhost:${process.env.PORT ?? "3000"}`],
      },
    },
  }),
};

export default nextConfig;
