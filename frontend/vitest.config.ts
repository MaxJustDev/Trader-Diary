import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./test/setup.ts"],
    },
    resolve: {
        alias: {
            "@": path.resolve(root),
        },
    },
});
