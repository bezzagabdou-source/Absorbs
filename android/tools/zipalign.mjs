/** CLI: node tools/zipalign.mjs <input.apk> <output.apk> */
import { alignFile } from "./zipalign-lib.mjs";
const [, , source, destination] = process.argv;
if (!source || !destination) {
  console.error("usage: node tools/zipalign.mjs <input.apk> <output.apk>");
  process.exit(2);
}
const result = await alignFile(source, destination);
console.log(`aligned ${result.entries} entries → ${result.bytes} bytes`);
