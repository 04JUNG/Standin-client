import { defineConfig, mergeConfig } from "vite";
import base from "../../vite.config";
export default mergeConfig(
  base,
  defineConfig({
    server: {
      host: "127.0.0.1",
      port: 1427,
      proxy: {
        "/v1": "http://127.0.0.1:18467",
        "/fixture": "http://127.0.0.1:18467",
      },
    },
  }),
);
