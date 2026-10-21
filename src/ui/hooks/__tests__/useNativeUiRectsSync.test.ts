import { describe, it, expect } from "vitest";
import {
  collectNativeUiRects,
  type QueryableDocument,
  type QueryableElement,
} from "../useNativeUiRectsSync";

describe("collectNativeUiRects", () => {
  it("returns empty array when document has no matching UI elements", () => {
    const mockDoc: QueryableDocument = {
      querySelectorAll: () => [],
    };
    const rects = collectNativeUiRects(mockDoc);
    expect(rects).toEqual([]);
  });

  it("gathers rectangles for elements with valid dimensions", () => {
    const topBar: QueryableElement = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 1440,
        height: 48,
      }),
    };

    const zoomPill: QueryableElement = {
      getBoundingClientRect: () => ({
        left: 12,
        top: 60,
        width: 114,
        height: 31,
      }),
    };

    const mockDoc: QueryableDocument = {
      querySelectorAll: () => [topBar, zoomPill],
    };

    const rects = collectNativeUiRects(mockDoc);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toEqual([0, 0, 1440, 48]);
    expect(rects[1]).toEqual([12, 60, 114, 31]);
  });

  it("gathers rectangles for dialogs and popovers", () => {
    const popover: QueryableElement = {
      getBoundingClientRect: () => ({
        left: 500,
        top: 100,
        width: 300,
        height: 300,
      }),
    };

    const mockDoc: QueryableDocument = {
      querySelectorAll: () => [popover],
    };

    const rects = collectNativeUiRects(mockDoc);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual([500, 100, 300, 300]);
  });

  it("filters out zero-dimension (hidden) elements", () => {
    const hiddenPanel: QueryableElement = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      }),
    };

    const mockDoc: QueryableDocument = {
      querySelectorAll: () => [hiddenPanel],
    };

    const rects = collectNativeUiRects(mockDoc);
    expect(rects).toEqual([]);
  });

  it("gathers multiple overlapping or adjacent subwindows", () => {
    const mainPicker: QueryableElement = {
      getBoundingClientRect: () => ({
        left: 600,
        top: 64,
        width: 320,
        height: 520,
      }),
    };
    const gamutSubwindow: QueryableElement = {
      getBoundingClientRect: () => ({
        left: 330,
        top: 64,
        width: 250,
        height: 220,
      }),
    };
    const gridSubwindow: QueryableElement = {
      getBoundingClientRect: () => ({
        left: 330,
        top: 300,
        width: 250,
        height: 180,
      }),
    };

    const mockDoc: QueryableDocument = {
      querySelectorAll: () => [mainPicker, gamutSubwindow, gridSubwindow],
    };

    const rects = collectNativeUiRects(mockDoc);
    expect(rects).toHaveLength(3);
    expect(rects[0]).toEqual([600, 64, 320, 520]);
    expect(rects[1]).toEqual([330, 64, 250, 220]);
    expect(rects[2]).toEqual([330, 300, 250, 180]);
  });
});
