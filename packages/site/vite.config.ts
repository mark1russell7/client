/// <reference types="node" />
import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";

// GitHub Pages serves the site at /client/. SITE_BASE sets another base, for example "/" for a local preview.
const config: UserConfig = {
  base: process.env["SITE_BASE"] ?? "/client/",
  plugins: [react()],
};

export default config;
