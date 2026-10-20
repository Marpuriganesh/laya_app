#import <Cocoa/Cocoa.h>
#import "native_overlay.h"

static BOOL g_modal_open = NO;
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

- (instancetype)initWithFrame:(NSRect)frame {
    self = [super initWithFrame:frame];
    if (self) {
        [self setWantsLayer:YES];
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

    return NSMakePoint((float)p.x * scaleX, (float)p.y * scaleY);
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

    // 1. Draw Canvas Framebuffer directly
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
            kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big,
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
    if (g_cursor_x >= 0 && g_cursor_y >= 0) {
        float diameter = rust_overlay_get_diameter();
        bool sizeDyn = rust_overlay_get_size_dynamics();
        float effectiveRadius = diameter * 0.5f;
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

void trigger_native_overlay_repaint(void) {
    if (g_active_canvas_view) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [g_active_canvas_view setNeedsDisplay:YES];
        });
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

            NSRect frame = [contentView bounds];
            OverlaySketchCanvasView *canvasView = [[OverlaySketchCanvasView alloc] initWithFrame:frame];
            [canvasView setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];

            // Safely place native canvas view below all other subviews
            [contentView addSubview:canvasView positioned:NSWindowBelow relativeTo:nil];
            g_active_canvas_view = canvasView;

            // Safely set transparent background
            @try {
                if ([webView respondsToSelector:@selector(setValue:forKey:)]) {
                    [webView setValue:@NO forKey:@"drawsBackground"];
                }
            } @catch (id ex) {
                // Ignore any key error
            }

            rust_overlay_init((uint32_t)frame.size.width, (uint32_t)frame.size.height);

            // First-class Apple AppKit Local Event Monitor
            [NSEvent addLocalMonitorForEventsMatchingMask:
                (NSEventMaskLeftMouseDown | NSEventMaskLeftMouseDragged | NSEventMaskLeftMouseUp)
                handler:^NSEvent *(NSEvent *event) {
                    @try {
                        if (g_modal_open) {
                            return event;
                        }

                        NSPoint loc = [event locationInWindow];
                        float winH = (float)window.contentView.bounds.size.height;

                        // UI Hit Bounds:
                        // Top Bar is top 48px: y > (winH - 48.0)
                        // Left Sidebar Rail is left 64px: x < 64.0
                        BOOL in_top_bar = (loc.y > winH - 48.0f);
                        BOOL in_sidebar = (loc.x < 64.0f);

                        if (in_top_bar || in_sidebar) {
                            return event; // Pass through to React UI!
                        }

                        // Event is in the Canvas Area: Handle via Native Rust Canvas with TRUE pressure!
                        if ([event type] == NSEventTypeLeftMouseDown) {
                            [canvasView handleMouseDown:event];
                            return nil;
                        } else if ([event type] == NSEventTypeLeftMouseDragged) {
                            [canvasView handleMouseDragged:event];
                            return nil;
                        } else if ([event type] == NSEventTypeLeftMouseUp) {
                            [canvasView handleMouseUp:event];
                            return nil;
                        }
                    } @catch (id ex) {
                        NSLog(@"[NativeOverlay] Monitor Exception: %@", ex);
                    }
                    return event;
                }
            ];

            NSLog(@"[NativeOverlay] Native Rust Canvas Overlay successfully initialized under React UI!");
        } @catch (NSException *exception) {
            NSLog(@"[NativeOverlay] Setup Exception: %@", exception);
        }
    }
}
