#import <Cocoa/Cocoa.h>
#import "native_overlay.h"

#define MAX_UI_BLOCKING_RECTS 64

static BOOL g_modal_open = NO;
static BOOL g_pan_active = NO;
static float g_last_pressure = 0.0f;
static float g_cursor_x = -100.0f;
static float g_cursor_y = -100.0f;
static BOOL g_is_drawing = NO;

static NSRect g_artboard_rect = { { 0, 0 }, { 0, 0 } };
static NSRect g_ui_blocking_rects[MAX_UI_BLOCKING_RECTS];
static uint32_t g_ui_blocking_count = 0;
static BOOL g_is_dark_theme = YES;

static float g_pressure_lut[256];
static BOOL g_has_pressure_lut = NO;

void set_native_pressure_lut(const float *lut, int count) {
    if (lut != NULL && count == 256) {
        memcpy(g_pressure_lut, lut, sizeof(float) * 256);
        g_has_pressure_lut = YES;
    } else {
        g_has_pressure_lut = NO;
    }
}

@interface NativeBackgroundWorkspaceView : NSView
- (void)handleMouseDown:(NSEvent *)event;
- (void)handleMouseDragged:(NSEvent *)event;
- (void)handleMouseUp:(NSEvent *)event;
@end

static NativeBackgroundWorkspaceView *g_active_workspace_view = nil;

static BOOL is_point_in_ui(NSPoint loc, float winH) {
    // 1. Built-in Fixed UI Regions:
    // Top Navigation Bar: top 48px
    if (loc.y >= (winH - 48.0f)) {
        return YES;
    }
    // Left Sidebar Rail: left 56px (below the top nav bar)
    if (loc.x <= 56.0f && loc.y < (winH - 48.0f)) {
        return YES;
    }
    // Floating Zoom Controls Pill: [x: 56..200, y: (winH - 100)..(winH - 48)]
    // Built-in guard ensures zoom pill is 100% immune to being captured by the artboard
    if (loc.x >= 56.0f && loc.x <= 200.0f && loc.y >= (winH - 100.0f) && loc.y <= (winH - 48.0f)) {
        return YES;
    }

    // 2. Dynamic UI Rectangles registered by React (popovers, modals, zoom pill):
    for (uint32_t i = 0; i < g_ui_blocking_count; i++) {
        if (NSPointInRect(loc, g_ui_blocking_rects[i])) {
            return YES;
        }
    }
    return NO;
}

@implementation NativeBackgroundWorkspaceView

- (BOOL)isFlipped {
    return NO;
}

- (BOOL)acceptsFirstResponder {
    return YES;
}

- (NSView *)hitTest:(NSPoint)point {
    // Return nil so AppKit naturally routes mouse clicks to WKWebView on top.
    // The NSEvent local monitor intercepts drawing strokes before hit-testing.
    return nil;
}

- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        [self setWantsLayer:YES];
        // Native rounded corners (12px / 0.75rem matching Tailwind rounded-xl)
        self.layer.cornerRadius = 12.0f;
        self.layer.masksToBounds = YES;
        self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

        NSTrackingAreaOptions options = (NSTrackingActiveAlways | NSTrackingMouseMoved | NSTrackingInVisibleRect);
        NSTrackingArea *trackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds options:options owner:self userInfo:nil];
        [self addTrackingArea:trackingArea];
    }
    return self;
}

- (NSPoint)canvasPointFromWindowPoint:(NSPoint)windowLocation {
    int32_t bufW = 0;
    int32_t bufH = 0;
    rust_overlay_get_pixels(&bufW, &bufH);

    float scaleX = (g_artboard_rect.size.width > 0 && bufW > 0) ? ((float)bufW / g_artboard_rect.size.width) : 1.0f;
    float scaleY = (g_artboard_rect.size.height > 0 && bufH > 0) ? ((float)bufH / g_artboard_rect.size.height) : 1.0f;

    // Convert from window coordinates to artboard coordinates:
    float localX = windowLocation.x - g_artboard_rect.origin.x;
    float localY = windowLocation.y - g_artboard_rect.origin.y;

    // Cocoa Y=0 is at bottom; Rust canvas Y=0 is at top. Invert Y inside the artboard:
    float invY = g_artboard_rect.size.height - localY;

    float x = localX * scaleX;
    float y = invY * scaleY;

    return NSMakePoint(x, y);
}

- (NSPoint)windowPointFromCanvasPoint:(NSPoint)canvasPoint {
    int32_t bufW = 0;
    int32_t bufH = 0;
    rust_overlay_get_pixels(&bufW, &bufH);

    float scaleX = (g_artboard_rect.size.width > 0 && bufW > 0) ? ((float)bufW / g_artboard_rect.size.width) : 1.0f;
    float scaleY = (g_artboard_rect.size.height > 0 && bufH > 0) ? ((float)bufH / g_artboard_rect.size.height) : 1.0f;

    float localX = canvasPoint.x / scaleX;
    float invY = canvasPoint.y / scaleY;
    float localY = g_artboard_rect.size.height - invY;

    float winX = g_artboard_rect.origin.x + localX;
    float winY = g_artboard_rect.origin.y + localY;

    return NSMakePoint(winX, winY);
}

- (void)handleMouseDown:(NSEvent *)event {
    NSPoint loc = [event locationInWindow];
    g_cursor_x = (float)loc.x;
    g_cursor_y = (float)loc.y;

    NSPoint cp = [self canvasPointFromWindowPoint:loc];
    BOOL isTablet = ([event subtype] == NSEventSubtypeTabletPoint);

    float pressure = (float)[event pressure];
    if (!isTablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }
    if (g_has_pressure_lut) {
        int idx = (int)fminf(255.0f, fmaxf(0.0f, roundf(pressure * 255.0f)));
        pressure = g_pressure_lut[idx];
    }

    g_last_pressure = pressure;
    g_is_drawing = YES;

    rust_overlay_begin_stroke((float)cp.x, (float)cp.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)handleMouseDragged:(NSEvent *)event {
    NSPoint loc = [event locationInWindow];
    g_cursor_x = (float)loc.x;
    g_cursor_y = (float)loc.y;

    NSPoint cp = [self canvasPointFromWindowPoint:loc];
    BOOL isTablet = ([event subtype] == NSEventSubtypeTabletPoint);

    float pressure = (float)[event pressure];
    if (!isTablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }
    if (g_has_pressure_lut) {
        int idx = (int)fminf(255.0f, fmaxf(0.0f, roundf(pressure * 255.0f)));
        pressure = g_pressure_lut[idx];
    }

    g_last_pressure = pressure;

    rust_overlay_paint_event((float)cp.x, (float)cp.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)handleMouseUp:(NSEvent *)event {
    NSPoint loc = [event locationInWindow];
    g_cursor_x = (float)loc.x;
    g_cursor_y = (float)loc.y;

    NSPoint cp = [self canvasPointFromWindowPoint:loc];
    BOOL isTablet = ([event subtype] == NSEventSubtypeTabletPoint);

    float pressure = (float)[event pressure];
    if (!isTablet && pressure <= 0.001f) {
        pressure = (g_last_pressure > 0.001f) ? g_last_pressure : 1.0f;
    }
    if (g_has_pressure_lut) {
        int idx = (int)fminf(255.0f, fmaxf(0.0f, roundf(pressure * 255.0f)));
        pressure = g_pressure_lut[idx];
    }
    g_last_pressure = pressure;

    rust_overlay_paint_event((float)cp.x, (float)cp.y, pressure);
    g_is_drawing = NO;
    rust_overlay_end_stroke();
    [self setNeedsDisplay:YES];
}

- (void)mouseMoved:(NSEvent *)event {
    NSPoint loc = [event locationInWindow];
    if (NSPointInRect(loc, g_artboard_rect)) {
        g_cursor_x = (float)loc.x;
        g_cursor_y = (float)loc.y;
    } else {
        g_cursor_x = -100.0f;
        g_cursor_y = -100.0f;
    }
    [self setNeedsDisplay:YES];
}

- (void)drawRect:(NSRect)dirtyRect {
    CGContextRef ctx = [[NSGraphicsContext currentContext] CGContext];
    if (!ctx) return;

    // 1. Draw Native Workspace Backdrop with theme awareness
    if (g_is_dark_theme) {
        // Dark theme workbench (#18181b / zinc-900)
        [[NSColor colorWithCalibratedRed:24.0f/255.0f green:24.0f/255.0f blue:27.0f/255.0f alpha:1.0f] setFill];
    } else {
        // Light theme workbench (#e4e4e7 / zinc-200 for clean contrast against white paper)
        [[NSColor colorWithCalibratedRed:228.0f/255.0f green:228.0f/255.0f blue:231.0f/255.0f alpha:1.0f] setFill];
    }
    NSRectFill(self.bounds);

    if (g_artboard_rect.size.width <= 0 || g_artboard_rect.size.height <= 0) {
        return;
    }

    // 2. Draw Artboard Paper Drop Shadow & Surface
    CGContextSaveGState(ctx);
    CGColorRef shadowColor = g_is_dark_theme
        ? CGColorCreateGenericRGB(0.0, 0.0, 0.0, 0.40)
        : CGColorCreateGenericRGB(0.0, 0.0, 0.0, 0.18);
    CGContextSetShadowWithColor(ctx, CGSizeMake(0, -4), 14.0f, shadowColor);
    CGColorRelease(shadowColor);

    // Clean white paper background
    [[NSColor whiteColor] setFill];
    NSBezierPath *paperPath = [NSBezierPath bezierPathWithRoundedRect:g_artboard_rect xRadius:2.0f yRadius:2.0f];
    [paperPath fill];
    CGContextRestoreGState(ctx); // Clear shadow state

    // Artboard subtle border
    if (g_is_dark_theme) {
        [[NSColor colorWithCalibratedWhite:0.3f alpha:0.4f] setStroke];
    } else {
        [[NSColor colorWithCalibratedWhite:0.75f alpha:0.8f] setStroke];
    }
    [paperPath setLineWidth:1.0f];
    [paperPath stroke];

    // 3. Draw Rust Canvas Framebuffer onto Artboard Paper
    int32_t bufferWidth = 0;
    int32_t bufferHeight = 0;
    const uint8_t *pixelBuffer = rust_overlay_get_pixels(&bufferWidth, &bufferHeight);

    if (pixelBuffer && bufferWidth > 0 && bufferHeight > 0) {
        CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
        CGDataProviderRef provider = CGDataProviderCreateWithData(NULL, pixelBuffer, bufferWidth * bufferHeight * 4, NULL);
        if (provider) {
            CGImageRef image = CGImageCreate(
                bufferWidth,
                bufferHeight,
                8,
                32,
                bufferWidth * 4,
                colorSpace,
                kCGImageAlphaLast | kCGBitmapByteOrder32Big,
                provider,
                NULL,
                NO,
                kCGRenderingIntentDefault
            );

            if (image) {
                CGContextSaveGState(ctx);
                [paperPath addClip]; // Clip strokes to artboard paper boundary
                CGContextDrawImage(ctx, g_artboard_rect, image);
                CGContextRestoreGState(ctx);
                CGImageRelease(image);
            }
            CGDataProviderRelease(provider);
        }
        CGColorSpaceRelease(colorSpace);
    }

    // 3.5. Attach the last point to the brush tip with same pressure and size
    if (g_is_drawing && g_cursor_x >= 0 && g_cursor_y >= 0) {
        float tipX = 0, tipY = 0;
        if (rust_overlay_get_smoothed_tip(&tipX, &tipY)) {
            NSPoint tipWin = [self windowPointFromCanvasPoint:NSMakePoint(tipX, tipY)];
            NSPoint curWin = NSMakePoint(g_cursor_x, g_cursor_y);

            float dx = curWin.x - tipWin.x;
            float dy = curWin.y - tipWin.y;
            if (dx * dx + dy * dy > 0.25f) {
                CGContextSaveGState(ctx);
                [paperPath addClip]; // Clip strokes to artboard paper boundary

                float diameter = rust_overlay_get_diameter();
                bool sizeDyn = rust_overlay_get_size_dynamics();
                float scaleX = (bufferWidth > 0 && g_artboard_rect.size.width > 0) ? (g_artboard_rect.size.width / (float)bufferWidth) : 1.0f;
                float effectiveWidth = diameter * scaleX;
                if (sizeDyn && g_last_pressure > 0.001f) {
                    effectiveWidth *= fmaxf(0.08f, g_last_pressure);
                }
                effectiveWidth = fmaxf(effectiveWidth, 1.0f);

                uint8_t rgba[4] = {24, 24, 27, 255};
                rust_overlay_get_brush_color(rgba);
                float r = rgba[0] / 255.0f;
                float g = rgba[1] / 255.0f;
                float b = rgba[2] / 255.0f;
                float a = rgba[3] / 255.0f;

                CGContextSetRGBStrokeColor(ctx, r, g, b, a);
                CGContextSetLineWidth(ctx, effectiveWidth);
                CGContextSetLineCap(ctx, kCGLineCapRound);
                CGContextSetLineJoin(ctx, kCGLineJoinRound);

                CGContextBeginPath(ctx);
                CGContextMoveToPoint(ctx, tipWin.x, tipWin.y);
                CGContextAddLineToPoint(ctx, curWin.x, curWin.y);
                CGContextStrokePath(ctx);

                CGContextRestoreGState(ctx);
            }
        }
    }

    // 4. Draw Live Brush Reticle under the pen nib
    if (g_cursor_x >= 0 && g_cursor_y >= 0 && NSPointInRect(NSMakePoint(g_cursor_x, g_cursor_y), g_artboard_rect)) {
        float diameter = rust_overlay_get_diameter();
        bool sizeDyn = rust_overlay_get_size_dynamics();
        float scaleX = (bufferWidth > 0 && g_artboard_rect.size.width > 0) ? (g_artboard_rect.size.width / (float)bufferWidth) : 1.0f;
        float effectiveRadius = (diameter * 0.5f) * scaleX;
        if (sizeDyn && g_last_pressure > 0.001f) {
            effectiveRadius *= fmaxf(0.08f, g_last_pressure);
        }
        effectiveRadius = fmaxf(effectiveRadius, 2.0f);

        NSRect ringRect = NSMakeRect(g_cursor_x - effectiveRadius,
                                     g_cursor_y - effectiveRadius,
                                     effectiveRadius * 2.0f,
                                     effectiveRadius * 2.0f);
        NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:ringRect];
        [[NSColor colorWithCalibratedWhite:0.2f alpha:0.4f] setStroke];
        [ring setLineWidth:2.0f];
        [ring stroke];

        [[NSColor colorWithCalibratedWhite:1.0f alpha:0.9f] setStroke];
        [ring setLineWidth:1.0f];
        [ring stroke];
    }
}

@end

void set_native_overlay_modal_open(bool is_open) {
    g_modal_open = is_open;
}

void set_native_overlay_pan_active(bool is_panning) {
    g_pan_active = is_panning;
}

void trigger_native_overlay_repaint(void) {
    if (g_active_workspace_view) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [g_active_workspace_view setNeedsDisplay:YES];
        });
    }
}

void update_canvas_artboard_rect(float x, float y, float width, float height) {
    if (!g_active_workspace_view) return;
    void (^applyBlock)(void) = ^{
        NSWindow *window = [g_active_workspace_view window];
        if (!window) return;
        float winH = (float)window.contentView.bounds.size.height;
        // Invert Y for Cocoa window coordinates (0 is bottom-left):
        g_artboard_rect = NSMakeRect(x, winH - y - height, width, height);
        [g_active_workspace_view setNeedsDisplay:YES];
    };

    if ([NSThread isMainThread]) {
        applyBlock();
    } else {
        dispatch_async(dispatch_get_main_queue(), applyBlock);
    }
}

void set_ui_blocking_rects(const float *rects, uint32_t count) {
    if (!g_active_workspace_view) return;
    uint32_t safeCount = (count < MAX_UI_BLOCKING_RECTS) ? count : MAX_UI_BLOCKING_RECTS;

    if (safeCount == 0 || !rects) {
        void (^clearBlock)(void) = ^{
            g_ui_blocking_count = 0;
        };
        if ([NSThread isMainThread]) {
            clearBlock();
        } else {
            dispatch_async(dispatch_get_main_queue(), clearBlock);
        }
        return;
    }

    // Retain rect data in NSData so we do not read from a dropped Rust buffer
    NSData *data = [NSData dataWithBytes:rects length:(safeCount * 4 * sizeof(float))];
    void (^applyBlock)(void) = ^{
        NSWindow *window = [g_active_workspace_view window];
        if (!window) return;
        float winH = (float)window.contentView.bounds.size.height;

        const float *r = (const float *)[data bytes];
        g_ui_blocking_count = safeCount;
        for (uint32_t i = 0; i < safeCount; i++) {
            float rx = r[i * 4 + 0];
            float ry = r[i * 4 + 1];
            float rw = r[i * 4 + 2];
            float rh = r[i * 4 + 3];
            // Convert Web top-left coords to Cocoa bottom-left coords:
            g_ui_blocking_rects[i] = NSMakeRect(rx, winH - ry - rh, rw, rh);
        }
    };

    if ([NSThread isMainThread]) {
        applyBlock();
    } else {
        dispatch_async(dispatch_get_main_queue(), applyBlock);
    }
}

void set_workspace_theme(bool is_dark) {
    g_is_dark_theme = is_dark;
    if (g_active_workspace_view) {
        void (^applyBlock)(void) = ^{
            [g_active_workspace_view setNeedsDisplay:YES];
        };
        if ([NSThread isMainThread]) {
            applyBlock();
        } else {
            dispatch_async(dispatch_get_main_queue(), applyBlock);
        }
    }
}

void setup_native_canvas_overlay(void *ns_window_ptr, void *ns_view_ptr) {
    if (!ns_window_ptr || !ns_view_ptr) return;

    @autoreleasepool {
        @try {
            NSWindow *window = (__bridge NSWindow *)ns_window_ptr;
            NSView *webView = (__bridge NSView *)ns_view_ptr;
            NSView *contentView = [window contentView];
            if (!contentView) return;

            // Detect initial macOS system appearance so theme matches before React mounts
            @try {
                NSAppearance *appearance = [window effectiveAppearance] ?: [NSApp effectiveAppearance];
                NSAppearanceName matched = [appearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua, NSAppearanceNameDarkAqua]];
                g_is_dark_theme = ![matched isEqualToString:NSAppearanceNameAqua];
            } @catch (id ex) {}

            // Ensure window supports smooth transparency & rounded corners
            [window setOpaque:NO];
            [window setBackgroundColor:[NSColor clearColor]];
            [contentView setWantsLayer:YES];
            contentView.layer.cornerRadius = 12.0f;
            contentView.layer.masksToBounds = YES;

            // Initialize Native Background View to fill the ENTIRE window
            NativeBackgroundWorkspaceView *workspaceView = [[NativeBackgroundWorkspaceView alloc] initWithFrame:contentView.bounds];

            // Safely place native workspace view BEHIND the transparent WKWebView
            [contentView addSubview:workspaceView positioned:NSWindowBelow relativeTo:nil];
            g_active_workspace_view = workspaceView;

            // Ensure WKWebView transparent background so native canvas & backdrop show through
            @try {
                if ([webView respondsToSelector:@selector(setValue:forKey:)]) {
                    [webView setValue:@NO forKey:@"drawsBackground"];
                }
                if ([webView respondsToSelector:@selector(setUnderPageBackgroundColor:)]) {
                    [(id)webView performSelector:@selector(setUnderPageBackgroundColor:) withObject:[NSColor clearColor]];
                }
            } @catch (id ex) {}

            // Immediate initial repaint to paint workspace theme backdrop right on launch
            [workspaceView setNeedsDisplay:YES];
            [contentView setNeedsDisplay:YES];
            dispatch_async(dispatch_get_main_queue(), ^{
                if (g_active_workspace_view) {
                    [g_active_workspace_view setNeedsDisplay:YES];
                }
            });

            rust_overlay_init(1000, 1000);

            // Disable AppKit mouse coalescing so the native drawing engine receives
            // every single raw high-frequency hardware sample (120Hz-240Hz stylus/tablet points)
            // without macOS dropping or compressing intermediate samples.
            [NSEvent setMouseCoalescingEnabled:NO];

            // First-class Apple AppKit Local Event Monitor
            [NSEvent addLocalMonitorForEventsMatchingMask:
                (NSEventMaskLeftMouseDown | NSEventMaskLeftMouseDragged | NSEventMaskLeftMouseUp | NSEventMaskMouseMoved | NSEventMaskTabletPoint)
                handler:^NSEvent *(NSEvent *event) {
                    @try {
                        if (!g_active_workspace_view) {
                            return event;
                        }

                        NSWindow *mainCanvasWin = [g_active_workspace_view window];
                        // If event occurred in another window (e.g. detached secondary panel window),
                        // never intercept as canvas drawing: always pass through to WebKit!
                        if (!mainCanvasWin || [event window] != mainCanvasWin) {
                            return event;
                        }

                        NSPoint loc = [event locationInWindow];
                        float winH = (float)mainCanvasWin.contentView.bounds.size.height;

                        // Hover tracking for brush reticle
                        if ([event type] == NSEventTypeMouseMoved) {
                            if (NSPointInRect(loc, g_artboard_rect)) {
                                g_cursor_x = (float)loc.x;
                                g_cursor_y = (float)loc.y;
                                [g_active_workspace_view setNeedsDisplay:YES];
                            } else if (g_cursor_x >= 0) {
                                g_cursor_x = -100.0f;
                                g_cursor_y = -100.0f;
                                [g_active_workspace_view setNeedsDisplay:YES];
                            }
                            return event; // Always pass hover to React UI
                        }

                        // Active Drawing: If already drawing a stroke, drag and up must always continue/end the stroke
                        if (g_is_drawing) {
                            if ([event type] == NSEventTypeLeftMouseDragged) {
                                [g_active_workspace_view handleMouseDragged:event];
                                return nil;
                            } else if ([event type] == NSEventTypeLeftMouseUp) {
                                [g_active_workspace_view handleMouseUp:event];
                                return nil;
                            }
                        }

                        // 1. If point is on React UI (top bar, sidebar rail, popover, modal, zoom pill):
                        // Pass event directly through to WKWebView!
                        if (is_point_in_ui(loc, winH)) {
                            return event;
                        }

                        // 2. If a modal is open or workspace pan is active:
                        // Pass event through to React!
                        if (g_modal_open || g_pan_active) {
                            return event;
                        }

                        // 3. If point is OUTSIDE the artboard paper:
                        // Pass event through to React for canvas panning and shortcuts!
                        if (!NSPointInRect(loc, g_artboard_rect)) {
                            return event;
                        }

                        // 4. Point is directly ON THE ARTBOARD (and no UI blocking):
                        // Draw via Native Rust Brush Engine with zero latency!
                        if ([event type] == NSEventTypeLeftMouseDown) {
                            [g_active_workspace_view handleMouseDown:event];
                            return nil;
                        }
                    } @catch (id ex) {
                        NSLog(@"[NativeOverlay] Monitor Exception: %@", ex);
                    }
                    return event;
                }
            ];

            NSLog(@"[NativeOverlay] Native Background Workspace View initialized successfully!");
        } @catch (NSException *exception) {
            NSLog(@"[NativeOverlay] Setup Exception: %@", exception);
        }
    }
}
