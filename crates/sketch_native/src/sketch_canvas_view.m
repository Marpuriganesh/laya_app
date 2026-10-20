#import <Cocoa/Cocoa.h>
#import "sketch_canvas_view.h"

// Latest input metrics for live HUD rendering
static float g_last_pressure = 0.0f;
static float g_last_x = 0.0f;
static float g_last_y = 0.0f;
static BOOL g_is_drawing = NO;
static BOOL g_is_tablet = NO;
static BOOL g_flip_x = NO;
static BOOL g_flip_y = NO;

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

- (void)mouseDown:(NSEvent *)event {
    [self.window makeFirstResponder:self];
    NSPoint cp = [self canvasPointFromLocation:[event locationInWindow]];
    
    g_is_tablet = ([event subtype] == NSEventSubtypeTabletPoint);
    
    float pressure = (float)[event pressure];
    if (!g_is_tablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }
    
    g_last_pressure = pressure;
    g_last_x = (float)cp.x;
    g_last_y = (float)cp.y;
    g_is_drawing = YES;

    rust_native_begin_stroke((float)cp.x, (float)cp.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)mouseDragged:(NSEvent *)event {
    NSPoint cp = [self canvasPointFromLocation:[event locationInWindow]];
    
    if ([event subtype] == NSEventSubtypeTabletPoint) {
        g_is_tablet = YES;
    }
    
    float pressure = (float)[event pressure];
    if (!g_is_tablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }
    
    g_last_pressure = pressure;
    g_last_x = (float)cp.x;
    g_last_y = (float)cp.y;

    rust_native_paint_event((float)cp.x, (float)cp.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)mouseUp:(NSEvent *)event {
    g_is_drawing = NO;
    rust_native_end_stroke();
    [self setNeedsDisplay:YES];
}

// Tablet events are already routed to mouseDragged: with accurate window coordinates.
// We removed tabletPoint: to prevent duplicate out-of-order coordinate collisions.

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

    // 1. Create CoreGraphics Image from Rust RGBA8 buffer
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
            // Draw image matching canvas coordinates
            CGContextDrawImage(ctx, CGRectMake(0, 0, self.bounds.size.width, self.bounds.size.height), image);
            CGImageRelease(image);
        }
        CGDataProviderRelease(provider);
    }
    CGColorSpaceRelease(colorSpace);

    // 2. Draw live crosshair under last known stylus position
    if (g_last_x > 0 || g_last_y > 0) {
        float viewX = g_flip_x ? (self.bounds.size.width - g_last_x) : g_last_x;
        float viewY = g_flip_y ? (self.bounds.size.height - g_last_y) : g_last_y;

        NSBezierPath *ring = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(viewX - 8, viewY - 8, 16, 16)];
        [[NSColor colorWithCalibratedRed:1.0f green:0.2f blue:0.2f alpha:0.8f] setStroke];
        [ring setLineWidth:1.5f];
        [ring stroke];
    }

    // 3. Draw Sleek Semi-Transparent Status HUD at the top of the window
    NSRect hudRect = NSMakeRect(16, self.bounds.size.height - 60, 560, 44);
    NSBezierPath *hudBackground = [NSBezierPath bezierPathWithRoundedRect:hudRect xRadius:8 yRadius:8];
    [[NSColor colorWithCalibratedWhite:0.1f alpha:0.90f] setFill];
    [hudBackground fill];

    // HUD Text: Input Type, Coordinates, and Pressure
    NSString *deviceTypeStr = g_is_tablet ? @"STYLUS (TABLET)" : @"MOUSE";
    NSString *hudText = [NSString stringWithFormat:@"%@ | (%.0f, %.0f) | Pressure: %.1f%% | [X-Flip:%@] [Y-Flip:%@]",
                         deviceTypeStr, g_last_x, g_last_y, g_last_pressure * 100.0f,
                         g_flip_x ? @"ON" : @"OFF", g_flip_y ? @"ON" : @"OFF"];
    
    NSDictionary *textAttributes = @{
        NSFontAttributeName: [NSFont monospacedSystemFontOfSize:11 weight:NSFontWeightMedium],
        NSForegroundColorAttributeName: [NSColor whiteColor]
    };
    [hudText drawAtPoint:NSMakePoint(26, self.bounds.size.height - 42) withAttributes:textAttributes];

    NSString *hintText = @"Shortcuts: [X] Toggle Flip X | [Y] Toggle Flip Y | [C] Clear | [E] Eraser";
    NSDictionary *hintAttributes = @{
        NSFontAttributeName: [NSFont systemFontOfSize:10 weight:NSFontWeightRegular],
        NSForegroundColorAttributeName: [NSColor colorWithCalibratedWhite:0.75f alpha:1.0f]
    };
    [hintText drawAtPoint:NSMakePoint(26, self.bounds.size.height - 56) withAttributes:hintAttributes];

    // Pressure Gauge Bar
    float fillWidth = 80.0f * fmaxf(0.0f, fminf(1.0f, g_last_pressure));
    NSRect barBackgroundRect = NSMakeRect(460, self.bounds.size.height - 44, 80, 10);
    NSBezierPath *barBg = [NSBezierPath bezierPathWithRoundedRect:barBackgroundRect xRadius:3 yRadius:3];
    [[NSColor colorWithCalibratedWhite:0.3f alpha:1.0f] setFill];
    [barBg fill];

    if (fillWidth > 0.0f) {
        NSRect barFillRect = NSMakeRect(460, self.bounds.size.height - 44, fillWidth, 10);
        NSBezierPath *barFill = [NSBezierPath bezierPathWithRoundedRect:barFillRect xRadius:3 yRadius:3];
        [[NSColor colorWithCalibratedRed:0.2f green:0.8f blue:0.4f alpha:1.0f] setFill];
        [barFill fill];
    }
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
        printf("🎨 SketchApp Native Rust Canvas Initialized!\n");
        printf("📐 Window: %dx%d (100%% Native Cocoa Window)\n", width, height);
        printf("⚡ Input: Direct macOS NSEvent (Zero WebKit, Zero IPC)\n");
        printf("🕹️  Shortcuts:\n");
        printf("   [C] Clear Canvas       | [E] Toggle Eraser\n");
        printf("   [ [ / ] ] Brush Size   | [1-5] Quick Colors\n");
        printf("=======================================================\n\n");
        fflush(stdout);

        [NSApp run];
    }
    return 0;
}
