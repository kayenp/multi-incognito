import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Express listens on 3000 (see backend/index.js); proxy API calls there to avoid CORS in dev.
const API_TARGET = process.env.API_TARGET || "http://localhost:3000";

export default defineConfig({
	plugins: [tailwindcss()],
	server: {
		port: 5173,
		proxy: {
			"/api": { target: API_TARGET, changeOrigin: true },
		},
	},
});
