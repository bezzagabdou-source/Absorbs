/** Registers the "@/" alias resolver. Passed to node via --import. */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./loader.mjs", pathToFileURL(import.meta.filename ?? __filename).href);
