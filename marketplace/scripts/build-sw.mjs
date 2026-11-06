import { build } from "esbuild";
await build({ entryPoints: ["src/sw.ts"], outfile: "public/sw.js", bundle: true, format: "iife", target: ["es2020"], minify: true, legalComments: "none", banner: { js: "/* Generated from src/sw.ts. Do not edit public/sw.js. */" } });
