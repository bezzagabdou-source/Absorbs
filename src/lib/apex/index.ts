/**
 * NEXUS APEX — the deterministic massive-project factory.
 *
 *   planFromText(text)     → ApexPlan (blueprint, palette, features, size)
 *   buildApexProject(plan) → complete working project (single file + tree + report)
 *
 * Nothing here calls a model and nothing here needs the network: the models only
 * choose a plan. The engine then writes the whole project offline, which is why a
 * generated site is never a half-finished snippet.
 */

export { APEX_MODULES, APEX_MODULE_IDS, APEX_MODULE_STATS, apexModule, type ApexModuleDef } from "./modules";
export { PALETTES, PALETTE_IDS, PALETTE_HINTS, paletteById, guessPalette, FONT_STACKS, type Palette, type PaletteId } from "./palettes";
export { APEX_CSS, STUDIO_CSS, themeVars, paletteSeries, studioCss, hexAlpha, shade } from "./theme";
export {
  BLUEPRINTS,
  BLUEPRINT_IDS,
  blueprintById,
  scoreBlueprints,
  type ApexBlueprint,
  type PageSpec,
  type SectionSpec,
  type ProjectKind,
} from "./blueprints";
export { planFromText, suggestBlueprints, detectLang, type PlanOptions, type PlanResult } from "./planner";
export {
  buildApexProject,
  selectModules,
  pagesFor,
  resolveModuleId,
  detectFeatures,
  detectGameModule,
  paletteFor,
  planSlug,
  byteLength,
  resolveHost,
  HOST_DATA,
  type ApexPlan,
  type ApexProject,
  type ApexFile,
  type ApexStats,
  type BuildOptions,
  type Scale,
} from "./compose";
export { verifyProject, verifyProject as verifyApexProject, type VerifyReport, type VerifyCheck } from "./compose";
export {
  completeStandalone,
  extractCode,
  looksLikeDeliverable,
  TAILWIND_LITE,
  STANDALONE_KINDS,
  type StandaloneResult,
  type StandaloneOptions,
  type StandaloneKind,
} from "./standalone";
export {
  buildData,
  countRows,
  genProducts,
  genOrders,
  genCustomers,
  genTransactions,
  genContacts,
  genTasks,
  genEvents,
  genPosts,
  genCourses,
  genStudents,
  genPatients,
  genListings,
  genDestinations,
  genMenu,
  genInventory,
  genSupport,
  genSubscriptions,
  WILAYAS,
  seedFrom,
  mulberry32,
  type DataBundle,
} from "./data-gen";
