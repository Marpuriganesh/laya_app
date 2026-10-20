#import <Cocoa/Cocoa.h>
#import "native_overlay.h"

static BOOL g_modal_open = NO;
static BOOL g_pan_active = NO;
static float g_last_pressure = 0.0f;
static float g_cursor_x = -100.0f;
static float g_cursor_y = -100.0f;
static BOOL g_is_drawing = NO;

@interface OverlaySketchCanvasView : NSView
- (void)handleMouseDown:(NSEvent *)event;
- (void)handleMouseDragged:(NSEvent *)event;
- (void)handleMouseUp:(NSEvent *)event;
@end

static OverlaySketchCanvasView *g_active_canvas_view = nil;

@implementation OverlaySketchCanvasView

- (BOOL)isFlipped {
    return NO;
}

- (BOOL)acceptsFirstResponder {
    return YES;
}

// Pass AppKit hit-testing through when the click is outside our artboard bounds.
// This lets React toolbar buttons, panels, and workspace receive normal mouse events
// even though this NSView is above the WebView in the Z-order.
- (NSView *)hitTest:(NSPoint)point {
    NSPoint localPoint = [self convertPoint:point fromView:self.superview];
    if (!NSPointInRect(localPoint, self.bounds)) {
        return nil; // outside our frame entirely — shouldn't normally happen
    }
    // Let the event monitor consume artboard events; return nil here so AppKit
    // does not block the event reaching the WebView for toolbar/panel regions.
    // The monitor intercepts drawing events before they reach hit-testing.
    return nil;
}

- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        [self setWantsLayer:YES];
        // Transparent ink layer — the React artboard paper div sits behind this view
        // and provides the white/checkerboard background through the transparent WebView.
        self.layer.backgroundColor = [[NSColor clearColor] CGColor];
        self.layer.opaque = NO;

        NSTrackingAreaOptions options = (NSTrackingActiveAlways | NSTrackingMouseMoved | NSTrackingInVisibleRect);
        NSTrackingArea *trackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds options:options owner:self userInfo:nil];
        [self addTrackingArea:trackingArea];
    }
    return self;
}

- (NSPoint)canvasPointFromWindowPoint:(NSPoint)windowLocation {
    NSPoint p = [self convertPoint:windowLocation fromView:nil];
    int32_t bufW = 0;
    int32_t bufH = 0;
    rust_overlay_get_pixels(&bufW, &bufH);

    float scaleX = (self.bounds.size.width > 0 && bufW > 0) ? ((float)bufW / self.bounds.size.width) : 1.0f;
    float scaleY = (self.bounds.size.height > 0 && bufH > 0) ? ((float)bufH / self.bounds.size.height) : 1.0f;

    // Cocoa Y=0 is at the bottom; our pixel buffer Y=0 is at the top.
    // Invert Y so pen position maps correctly into canvas space.
    float x = (float)p.x * scaleX;
    float y = (float)(self.bounds.size.height - p.y) * scaleY;

    return NSMakePoint(x, y);
}

- (void)handleMouseDown:(NSEvent *)event {
    NSPoint p = [self convertPoint:[event locationInWindow] fromView:nil];
    g_cursor_x = (float)p.x;
    g_cursor_y = (float)p.y;

    NSPoint cp = [self canvasPointFromWindowPoint:[event locationInWindow]];
    BOOL isTablet = ([event subtype] == NSEventSubtypeTabletPoint);

    float pressure = (float)[event pressure];
    if (!isTablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }

    g_last_pressure = pressure;
    g_is_drawing = YES;

    rust_overlay_begin_stroke((float)cp.x, (float)cp.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)handleMouseDragged:(NSEvent *)event {
    NSPoint p = [self convertPoint:[event locationInWindow] fromView:nil];
    g_cursor_x = (float)p.x;
    g_cursor_y = (float)p.y;

    NSPoint cp = [self canvasPointFromWindowPoint:[event locationInWindow]];
    BOOL isTablet = ([event subtype] == NSEventSubtypeTabletPoint);

    float pressure = (float)[event pressure];
    if (!isTablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }

    g_last_pressure = pressure;

    rust_overlay_paint_event((float)cp.x, (float)cp.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)handleMouseUp:(NSEvent *)event {
    g_is_drawing = NO;
    rust_overlay_end_stroke();
    [self setNeedsDisplay:YES];
}

- (void)mouseMoved:(NSEvent *)event {
    NSPoint p = [self convertPoint:[event locationInWindow] fromView:nil];
    g_cursor_x = (float)p.x;
    g_cursor_y = (float)p.y;
    [self setNeedsDisplay:YES];
}

- (void)drawRect:(NSRect)dirtyRect {
    int32_t bufferWidth = 0;
    int32_t bufferHeight = 0;
    const uint8_t *pixelBuffer = rust_overlay_get_pixels(&bufferWidth, &bufferHeight);

    if (!pixelBuffer || bufferWidth <= 0 || bufferHeight <= 0) {
        return;
    }

    CGContextRef ctx = [[NSGraphicsContext currentContext] CGContext];
    if (!ctx) return;

    // 1. Draw Canvas Framebuffer — ink-only layer over the transparent background.
    // The buffer contains straight (non-premultiplied) RGBA from Porter-Duff compositing.
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
            CGContextDrawImage(ctx, CGRectMake(0, 0, self.bounds.size.width, self.bounds.size.height), image);
            CGImageRelease(image);
        }
        CGDataProviderRelease(provider);
    }
    CGColorSpaceRelease(colorSpace);

    // 2. Draw Live Brush Reticle under the pen nib
    if (g_cursor_x >= 0 && g_cursor_x <= self.bounds.size.width &&
        g_cursor_y >= 0 && g_cursor_y <= self.bounds.size.height) {
        float diameter = rust_overlay_get_diameter();
        bool sizeDyn = rust_overlay_get_size_dynamics();
        float scaleX = (bufferWidth > 0 && self.bounds.size.width > 0) ? (self.bounds.size.width / (float)bufferWidth) : 1.0f;
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
    if (g_active_canvas_view) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [g_active_canvas_view setNeedsDisplay:YES];
        });
    }
}

void update_canvas_artboard_rect(float x, float y, float width, float height) {
    if (!g_active_canvas_view) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = [g_active_canvas_view window];
        if (!window) return;
        float winH = (float)window.contentView.bounds.size.height;
        // Invert Y for Cocoa window coordinates (0 is bottom-left):
        NSRect frame = NSMakeRect(x, winH - y - height, width, height);
        [g_active_canvas_view setFrame:frame];
        [g_active_canvas_view setNeedsDisplay:YES];
    });
}

void setup_native_canvas_overlay(void *ns_window_ptr, void *ns_view_ptr) {
    if (!ns_window_ptr || !ns_view_ptr) return;

    @autoreleasepool {
        @try {
            NSWindow *window = (__bridge NSWindow *)ns_window_ptr;
            NSView *webView = (__bridge NSView *)ns_view_ptr;
            NSView *contentView = [window contentView];
            if (!contentView) return;

            // Initial artboard frame (centered 1000x1000 default)
            float winW = (float)contentView.bounds.size.width;
            float winH = (float)contentView.bounds.size.height;
            float initW = 1000.0f;
            float initH = 1000.0f;
            NSRect frame = NSMakeRect((winW - initW) * 0.5f, (winH - initH) * 0.5f, initW, initH);

            OverlaySketchCanvasView *canvasView = [[OverlaySketchCanvasView alloc] initWithFrame:frame];

            // Place the ink canvas ABOVE the WebView so strokes are visible on screen.
            // The view itself is transparent everywhere except painted strokes, so the
            // React UI (toolbars, panels, color pickers) still shows through the clear regions.
            // AppKit hit-testing naturally falls through our transparent view to React controls
            // outside the artboard rect because we consume events only inside the artboard.
            [contentView addSubview:canvasView positioned:NSWindowAbove relativeTo:nil];
            g_active_canvas_view = canvasView;

            // Ensure WKWebView transparent background
            @try {
                if ([webView respondsToSelector:@selector(setValue:forKey:)]) {
                    [webView setValue:@NO forKey:@"drawsBackground"];
                }
            } @catch (id ex) {}

            rust_overlay_init(1000, 1000);

            // First-class Apple AppKit Local Event Monitor
            [NSEvent addLocalMonitorForEventsMatchingMask:
                (NSEventMaskLeftMouseDown | NSEventMaskLeftMouseDragged | NSEventMaskLeftMouseUp | NSEventMaskMouseMoved)
                handler:^NSEvent *(NSEvent *event) {
                    @try {
                        if (g_modal_open || g_pan_active || !g_active_canvas_view) {
                            return event;
                        }

                        NSPoint loc = [event locationInWindow];

                        // Handle live hover tracking for reticle
                        if ([event type] == NSEventTypeMouseMoved) {
                            if (NSPointInRect(loc, g_active_canvas_view.frame)) {
                                NSPoint p = [g_active_canvas_view convertPoint:loc fromView:nil];
                                g_cursor_x = (float)p.x;
                                g_cursor_y = (float)p.y;
                                [g_active_canvas_view setNeedsDisplay:YES];
                            } else if (g_cursor_x >= 0) {
                                g_cursor_x = -100.0f;
                                g_cursor_y = -100.0f;
                                [g_active_canvas_view setNeedsDisplay:YES];
                            }
                            return event; // Never consume hover; let React UI buttons/menus receive hover
                        }

                        // Only intercept if point is INSIDE the artboard paper canvas!
                        if (!NSPointInRect(loc, g_active_canvas_view.frame)) {
                            return event; // Outside artboard: Pass straight to React UI (zoom, pan, toolbars)!
                        }

                        // Event is ON THE ARTBOARD: Draw via Native Rust Brush Engine!
                        if ([event type] == NSEventTypeLeftMouseDown) {
                            [g_active_canvas_view handleMouseDown:event];
                            return nil;
                        } else if ([event type] == NSEventTypeLeftMouseDragged) {
                            [g_active_canvas_view handleMouseDragged:event];
                            return nil;
                        } else if ([event type] == NSEventTypeLeftMouseUp) {
                            [g_active_canvas_view handleMouseUp:event];
                            return nil;
                        }
                    } @catch (id ex) {
                        NSLog(@"[NativeOverlay] Monitor Exception: %@", ex);
                    }
                    return event;
                }
            ];

            NSLog(@"[NativeOverlay] Native Artboard Canvas initialized successfully!");
        } @catch (NSException *exception) {
            NSLog(@"[NativeOverlay] Setup Exception: %@", exception);
        }
    }
}
