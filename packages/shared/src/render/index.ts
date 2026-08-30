/**
 * The invoice render engine (backlog Epic 3.1) — the single source of truth for
 * turning a template config + invoice data into HTML, shared by the live preview
 * (browser) and the server-side PDF (Puppeteer). Framework-agnostic: a pure
 * function returning a string, no React, no DOM.
 */
export * from './paper.js';
export * from './fonts.js';
export * from './template-config.js';
export * from './invoice-data.js';
export * from './labels.js';
export * from './format.js';
export * from './invoice-math.js';
export * from './styles.js';
export * from './blocks.js';
export * from './render.js';
export * from './presets.js';
export * from './sample.js';
