/**
 * What ships at launch (docs/superpowers/specs/2026-11-15-lean-core-design.md). A part switched
 * off stays in the code, the database and its tests; members just don't see it. Tests that cover
 * a hidden part turn it back on with `window.__pcFeatures` before the app loads.
 */
const LAUNCH = {
  /** Group orders: money, pickups and decisions are a product of their own. */
  groupOrders: false,
  /** Recipes as their own section with the full form. Reading a linked recipe still works. */
  recipes: false,
  /** The People tab, connecting and following. Ask how covers reaching someone. */
  people: false,
  /** The bring list on Plans. The Plan chat covers who brings what. */
  bringList: false,
  /** Hosting levels in the interface. The server keeps its simple rule. */
  hostingLevels: false,
};

export type Feature = keyof typeof LAUNCH;

const override = (globalThis as { __pcFeatures?: Partial<Record<Feature, boolean>> })
  .__pcFeatures;

export const features: Readonly<Record<Feature, boolean>> = { ...LAUNCH, ...override };
