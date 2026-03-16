import nkzw from "@nkzw/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [nkzw],
  ignorePatterns: ["node_modules", "dist", "build", "extension.js", ".specstory", "docs"],
});
