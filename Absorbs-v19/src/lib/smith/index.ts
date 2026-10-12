/** NEXUS SMITH — public surface of the instant game factory. */
export * from "@/lib/smith/blueprints";
export * from "@/lib/smith/skins";
export {
  buildSmithGame,
  sanitizeConfig,
  defaultTitle,
  makeSlug,
  verifySmithHtml,
  type SmithBuild,
} from "@/lib/smith/compose";
export { SMITH_RUNTIME } from "@/lib/smith/runtime";
