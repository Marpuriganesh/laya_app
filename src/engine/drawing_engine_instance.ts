/**
 * Global Drawing Engine Instance
 * Central singleton instance linking the React UI to the decoupled drawing engine core.
 */

import { DrawingAppEngine } from "./drawing_app_engine";

export const globalDrawingEngine = new DrawingAppEngine(2048, 2048);
