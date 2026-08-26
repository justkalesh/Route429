// ---------------------------------------------------------------------------
// Module declarations for non-TypeScript imports
// ---------------------------------------------------------------------------

/** Allow importing .html files as text strings (via wrangler text module rules) */
declare module "*.html" {
  const content: string;
  export default content;
}
