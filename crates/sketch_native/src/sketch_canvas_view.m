#import <Cocoa/Cocoa.h>
#import "sketch_canvas_view.h"

// Latest input metrics for live HUD & cursor rendering
static float g_last_pressure = 0.0f;
static float g_cursor_view_x = -100.0f;
static float g_cursor_view_y = -100.0f;
static BOOL g_is_drawing = NO;
static BOOL g_is_tablet = NO;
static BOOL g_flip_x = NO;
static BOOL g_flip_y = YES; // Default ON per user test confirmation!

@interface SketchCanvasView : NSView
@end

@implementation SketchCanvasView

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
        // Track mouse movement even when not clicking to update the brush ring cursor
        NSTrackingAreaOptions options = (NSTrackingActiveAlways | NSTrackingMouseMoved | NSTrackingInVisibleRect);
        NSTrackingArea *trackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds options:options owner:self userInfo:nil];
        [self addTrackingArea:trackingArea];
    }
    return self;
}

- (NSPoint)canvasPointFromLocation:(NSPoint)windowLocation {
    NSPoint p = [self convertPoint:windowLocation fromView:nil];
    int32_t bufW = 0;
    int32_t bufH = 0;
    rust_native_get_pixels(&bufW, &bufH);

    float scaleX = (self.bounds.size.width > 0 && bufW > 0) ? ((float)bufW / self.bounds.size.width) : 1.0f;
    float scaleY = (self.bounds.size.height > 0 && bufH > 0) ? ((float)bufH / self.bounds.size.height) : 1.0f;

    float rawX = (float)p.x * scaleX;
    float rawY = (float)p.y * scaleY;
    float invertedY = (float)(self.bounds.size.height - p.y) * scaleY;
    float invertedX = (float)(self.bounds.size.width - p.x) * scaleX;

    float x = g_flip_x ? invertedX : rawX;
    float y = g_flip_y ? invertedY : rawY;

    return NSMakePoint(x, y);
}

- (void)mouseMoved:(NSEvent *)event {
    NSPoint p = [self convertPoint:[event locationInWindow] fromView:nil];
    g_cursor_view_x = (float)p.x;
    g_cursor_view_y = (float)p.y;
    [self setNeedsDisplay:YES];
}

- (void)mouseDown:(NSEvent *)event {
    [self.window makeFirstResponder:self];
    NSPoint p = [self convertPoint:[event locationInWindow] fromView:nil];
    g_cursor_view_x = (float)p.x;
    g_cursor_view_y = (float)p.y;

    NSPoint cp = [self canvasPointFromLocation:[event locationInWindow]];
    
    g_is_tablet = ([event subtype] == NSEventSubtypeTabletPoint);
    
    float pressure = (float)[event pressure];
    if (!g_is_tablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }
    
    g_last_pressure = pressure;
    g_is_drawing = YES;

    rust_native_begin_stroke((float)cp.x, (float)cp.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)mouseDragged:(NSEvent *)event {
    NSPoint p = [self convertPoint:[event locationInWindow] fromView:nil];
    g_cursor_view_x = (float)p.x;
    g_cursor_view_y = (float)p.y;

    NSPoint cp = [self canvasPointFromLocation:[event locationInWindow]];
    
    if ([event subtype] == NSEventSubtypeTabletPoint) {
        g_is_tablet = YES;
    }
    
    float pressure = (float)[event pressure];
    if (!g_is_tablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }
    
    g_last_pressure = pressure;

    rust_native_paint_event((float)cp.x, (float)cp.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)mouseUp:(NSEvent *)event {
    g_is_drawing = NO;
    rust_native_end_stroke();
    [self setNeedsDisplay:YES];
}

- (void)keyDown:(NSEvent *)event {
    NSString *characters = [event charactersIgnoringModifiers];
    if (characters.length > 0) {
        unichar ch = [characters characterAtIndex:0];
        if (ch == 'x' || ch == 'X') {
            g_flip_x = !g_flip_x;
            printf("🔀 [COORDINATES] Flip X: %s\n", g_flip_x ? "ON" : "OFF");
            [self setNeedsDisplay:YES];
            return;
        }
        if (ch == 'y' || ch == 'Y') {
            g_flip_y = !g_flip_y;
            printf("🔀 [COORDINATES] Flip Y: %s\n", g_flip_y ? "ON" : "OFF");
            [self setNeedsDisplay:YES];
            return;
        }
        rust_native_on_key((char)ch);
        [self setNeedsDisplay:YES];
    }
}

- (void)drawRect:(NSRect)dirtyRect {
    int32_t bufferWidth = 0;
    int32_t bufferHeight = 0;
    const uint8_t *pixelBuffer = rust_native_get_pixels(&bufferWidth, &bufferHeight);
    
    if (!pixelBuffer || bufferWidth <= 0 || bufferHeight <= 0) {
        return;
    }

    CGContextRef ctx = [[NSGraphicsContext currentContext] CGContext];
    if (!ctx) return;

    // 1. Blit Canvas Pixel Buffer
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

    // Get current live brush configuration from Rust
    NativeBrushInfo brushInfo;
    memset(&brushInfo, 0, sizeof(brushInfo));
    rust_native_get_brush_info(&brushInfo);

    // 2. Draw Live Brush Outline Cursor (Right under the pen nib, scaling with pressure!)
    if (g_cursor_view_x >= 0 && g_cursor_view_y >= 0) {
        float effectiveRadius = (brushInfo.diameter * 0.5f);
        if (brushInfo.size_by_pressure && g_last_pressure > 0.001f) {
            effectiveRadius *= fmaxf(0.08f, g_last_pressure);
        }
        effectiveRadius = fmaxf(effectiveRadius, 2.0f);

        NSRect ringRect = NSMakeRect(g_cursor_view_x - effectiveRadius,
                                     g_cursor_view_y - effectiveRadius,
                                     effectiveRadius * 2.0f,
                                     effectiveRadius * 2.0f);
        NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:ringRect];
        
        // Outer subtle shadow for visibility on light and dark canvases
        [[NSColor colorWithCalibratedWhite:0.2f alpha:0.5f] setStroke];
        [ring setLineWidth:2.0f];
        [ring stroke];

        // Inner crisp reticle ring
        [[NSColor colorWithCalibratedWhite:1.0f alpha:0.9f] setStroke];
        [ring setLineWidth:1.0f];
        [ring stroke];

        // Center pinpoint
        NSRect dotRect = NSMakeRect(g_cursor_view_x - 1.5f, g_cursor_view_y - 1.5f, 3.0f, 3.0f);
        NSBezierPath *dot = [NSBezierPath bezierPathWithOvalInRect:dotRect];
        [[NSColor colorWithCalibratedRed:1.0f green:0.2f blue:0.2f alpha:0.8f] setFill];
        [dot fill];
    }

    // 3. Draw Sleek Top Control Bar & Live Diagnostics
    float barWidth = fminf(880.0f, self.bounds.size.width - 32.0f);
    NSRect hudRect = NSMakeRect(16, self.bounds.size.height - 70, barWidth, 54);
    NSBezierPath *hudBackground = [NSBezierPath bezierPathWithRoundedRect:hudRect xRadius:10 yRadius:10];
    [[NSColor colorWithCalibratedWhite:0.12f alpha:0.92f] setFill];
    [hudBackground fill];

    // Presets Row
    const char *presetNames[] = {"1: Pencil", "2: Ink Pen", "3: Airbrush", "4: Chisel Marker", "5: Wash/Chalk"};
    float btnX = 28.0f;
    for (int i = 0; i < 5; i++) {
        BOOL isSelected = (brushInfo.preset_index == (i + 1));
        NSRect btnRect = NSMakeRect(btnX, self.bounds.size.height - 38, 92, 18);
        NSBezierPath *btnBg = [NSBezierPath bezierPathWithRoundedRect:btnRect xRadius:4 yRadius:4];
        
        if (isSelected) {
            [[NSColor colorWithCalibratedRed:0.2f green:0.5f blue:1.0f alpha:1.0f] setFill];
        } else {
            [[NSColor colorWithCalibratedWhite:0.22f alpha:0.8f] setFill];
        }
        [btnBg fill];

        NSString *btnLabel = [NSString stringWithUTF8String:presetNames[i]];
        NSDictionary *btnAttr = @{
            NSFontAttributeName: [NSFont systemFontOfSize:10 weight:isSelected ? NSFontWeightBold : NSFontWeightRegular],
            NSForegroundColorAttributeName: [NSColor whiteColor]
        };
        [btnLabel drawAtPoint:NSMakePoint(btnX + 6, self.bounds.size.height - 35) withAttributes:btnAttr];
        btnX += 98.0f;
    }

    // Color Swatch Box
    NSRect swatchRect = NSMakeRect(btnX + 10, self.bounds.size.height - 38, 38, 18);
    NSBezierPath *swatch = [NSBezierPath bezierPathWithRoundedRect:swatchRect xRadius:4 yRadius:4];
    [[NSColor colorWithCalibratedRed:brushInfo.color_r / 255.0f
                               green:brushInfo.color_g / 255.0f
                                blue:brushInfo.color_b / 255.0f
                               alpha:1.0f] setFill];
    [swatch fill];
    [[NSColor colorWithCalibratedWhite:1.0f alpha:0.3f] setStroke];
    [swatch stroke];

    // Tool & Parameter Info Line
    NSString *toolMode = brushInfo.is_erase ? @"ERASER [E]" : @"BRUSH [E]";
    NSString *sizeDyn = brushInfo.size_by_pressure ? @"ON" : @"OFF";
    NSString *alphaDyn = brushInfo.opacity_by_pressure ? @"ON" : @"OFF";

    NSString *infoLine = [NSString stringWithFormat:@"%@ | Size: %.0fpx [ [ / ] ] | Softness: %.0f%% [S] | Spacing: %.0f%% [D] | Opacity: %.0f%% [O] | Size Dyn: %@ [P] | Flow Dyn: %@ [A]",
                          toolMode,
                          brushInfo.diameter,
                          brushInfo.softness * 100.0f,
                          brushInfo.spacing * 100.0f,
                          brushInfo.opacity * 100.0f,
                          sizeDyn,
                          alphaDyn];

    NSDictionary *infoAttr = @{
        NSFontAttributeName: [NSFont monospacedSystemFontOfSize:10 weight:NSFontWeightMedium],
        NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.85f alpha:1.0f]
    };
    [infoLine drawAtPoint:NSMakePoint(28, self.bounds.size.height - 60) withAttributes:infoAttr];

    // Live Analog Pressure Gauge
    float pressureBarWidth = 90.0f;
    float gaugeX = hudRect.origin.x + hudRect.size.width - pressureBarWidth - 24.0f;
    NSRect barBgRect = NSMakeRect(gaugeX, self.bounds.size.height - 38, pressureBarWidth, 12);
    NSBezierPath *barBg = [NSBezierPath bezierPathWithRoundedRect:barBgRect xRadius:3 yRadius:3];
    [[NSColor colorWithCalibratedWhite:0.25f alpha:1.0f] setFill];
    [barBg fill];

    float fillWidth = pressureBarWidth * fmaxf(0.0f, fminf(1.0f, g_last_pressure));
    if (fillWidth > 0.0f) {
        NSRect fillRect = NSMakeRect(gaugeX, self.bounds.size.height - 38, fillWidth, 12);
        NSBezierPath *fillPath = [NSBezierPath bezierPathWithRoundedRect:fillRect xRadius:3 yRadius:3];
        [[NSColor colorWithCalibratedRed:0.2f green:0.85f blue:0.45f alpha:1.0f] setFill];
        [fillPath fill];
    }

    NSString *pressureText = [NSString stringWithFormat:@"%.0f%%", g_last_pressure * 100.0f];
    NSDictionary *pAttr = @{
        NSFontAttributeName: [NSFont monospacedSystemFontOfSize:9 weight:NSFontWeightBold],
        NSForegroundColorAttributeName: [NSColor whiteColor]
    };
    [pressureText drawAtPoint:NSMakePoint(gaugeX + 30, self.bounds.size.height - 37) withAttributes:pAttr];
}

@end

@interface SketchAppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate>
@end

@implementation SketchAppDelegate
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}
@end

int run_native_cocoa_app(int width, int height, const char* title) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

        SketchAppDelegate *delegate = [[SketchAppDelegate alloc] init];
        [NSApp setDelegate:delegate];

        NSRect frame = NSMakeRect(0, 0, width, height);
        NSWindow *window = [[NSWindow alloc]
            initWithContentRect:frame
            styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
            backing:NSBackingStoreBuffered
            defer:NO];

        [window setTitle:[NSString stringWithUTF8String:title]];
        [window center];

        SketchCanvasView *canvasView = [[SketchCanvasView alloc] initWithFrame:frame];
        [window setContentView:canvasView];
        [window setAcceptsMouseMovedEvents:YES];
        [window makeFirstResponder:canvasView];

        [window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];

        printf("\n=======================================================\n");
        printf("🎨 SketchApp High-Performance Native Brush Engine Test!\n");
        printf("📐 Canvas: %dx%d (100%% Rust sketch_core Engine)\n", width, height);
        printf("⚡ Tablet: Direct macOS NSEvent pressure telemetry\n");
        printf("🕹️  Controls:\n");
        printf("   [1-5]   Presets: 1:Pencil | 2:Ink | 3:Airbrush | 4:Marker | 5:Chalk\n");
        printf("   [ [ ] ] Fine Size (-3 / +3 px) | [- / +] Coarse Size\n");
        printf("   [s / S] Softness (- / + 5%%)    | [d / D] Spacing (- / + 2%%)\n");
        printf("   [o / O] Opacity (- / + 10%%)   | [P] Size Dynamics | [A] Alpha Dynamics\n");
        printf("   [E]     Toggle Eraser Mode     | [K] Cycle Palette Colors\n");
        printf("   [C]     Clear Canvas to White\n");
        printf("=======================================================\n\n");
        fflush(stdout);

        [NSApp run];
    }
    return 0;
}
