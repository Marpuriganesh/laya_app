#import <Cocoa/Cocoa.h>
#import "sketch_canvas_view.h"

// Latest input metrics for live HUD rendering
static float g_last_pressure = 0.0f;
static float g_last_x = 0.0f;
static float g_last_y = 0.0f;
static BOOL g_is_drawing = NO;
static BOOL g_is_tablet = NO;

@interface SketchCanvasView : NSView
@end

@implementation SketchCanvasView

- (BOOL)isFlipped {
    // Canvas (0, 0) is top-left, matching raster image buffer coordinate space.
    return YES;
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

- (void)mouseDown:(NSEvent *)event {
    [self.window makeFirstResponder:self];
    NSPoint location = [self convertPoint:[event locationInWindow] fromView:nil];
    
    // Check if event originated from a tablet/stylus digitizer
    g_is_tablet = ([event subtype] == NSEventSubtypeTabletPoint);
    
    // Extract hardware analog pressure (0.0 .. 1.0)
    float pressure = (float)[event pressure];
    if (!g_is_tablet && pressure <= 0.001f) {
        pressure = 1.0f; // Default full pressure for standard mouse click
    }
    
    g_last_pressure = pressure;
    g_last_x = (float)location.x;
    g_last_y = (float)location.y;
    g_is_drawing = YES;

    rust_native_begin_stroke((float)location.x, (float)location.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)mouseDragged:(NSEvent *)event {
    NSPoint location = [self convertPoint:[event locationInWindow] fromView:nil];
    
    if ([event subtype] == NSEventSubtypeTabletPoint) {
        g_is_tablet = YES;
    }
    
    float pressure = (float)[event pressure];
    if (!g_is_tablet && pressure <= 0.001f) {
        pressure = 1.0f;
    }
    
    g_last_pressure = pressure;
    g_last_x = (float)location.x;
    g_last_y = (float)location.y;

    rust_native_paint_event((float)location.x, (float)location.y, pressure);
    [self setNeedsDisplay:YES];
}

- (void)mouseUp:(NSEvent *)event {
    g_is_drawing = NO;
    rust_native_end_stroke();
    [self setNeedsDisplay:YES];
}

- (void)tabletPoint:(NSEvent *)event {
    // Explicit high-frequency tablet digitizer point event from macOS AppKit
    g_is_tablet = YES;
    NSPoint location = [self convertPoint:[event locationInWindow] fromView:nil];
    float pressure = (float)[event pressure];
    
    g_last_pressure = pressure;
    g_last_x = (float)location.x;
    g_last_y = (float)location.y;

    if (g_is_drawing) {
        rust_native_paint_event((float)location.x, (float)location.y, pressure);
        [self setNeedsDisplay:YES];
    }
}

- (void)keyDown:(NSEvent *)event {
    NSString *characters = [event charactersIgnoringModifiers];
    if (characters.length > 0) {
        unichar ch = [characters characterAtIndex:0];
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

    // 1. Blit the Rust pixel buffer directly onto the view surface
    NSBitmapImageRep *imageRep = [[NSBitmapImageRep alloc]
        initWithBitmapDataPlanes:(unsigned char **)&pixelBuffer
        pixelsWide:bufferWidth
        pixelsHigh:bufferHeight
        bitsPerSample:8
        samplesPerPixel:4
        hasAlpha:YES
        isPlanar:NO
        colorSpaceName:NSDeviceRGBColorSpace
        bitmapFormat:NSBitmapFormatAlphaNonpremultiplied
        bytesPerRow:bufferWidth * 4
        bitsPerPixel:32];

    if (imageRep) {
        [imageRep drawInRect:self.bounds];
    }

    // 2. Draw Sleek Semi-Transparent Status HUD
    NSRect hudRect = NSMakeRect(16, self.bounds.size.height - 54, 460, 38);
    NSBezierPath *hudBackground = [NSBezierPath bezierPathWithRoundedRect:hudRect xRadius:8 yRadius:8];
    [[NSColor colorWithCalibratedWhite:0.1f alpha:0.85f] setFill];
    [hudBackground fill];

    // HUD Text: Input Type, Coordinates, and Pressure
    NSString *deviceTypeStr = g_is_tablet ? @"STYLUS (TABLET)" : @"MOUSE";
    NSString *hudText = [NSString stringWithFormat:@"%@  |  Pos: (%.0f, %.0f)  |  Pressure: %.1f%%",
                         deviceTypeStr, g_last_x, g_last_y, g_last_pressure * 100.0f];
    
    NSDictionary *textAttributes = @{
        NSFontAttributeName: [NSFont monospacedSystemFontOfSize:12 weight:NSFontWeightMedium],
        NSForegroundColorAttributeName: [NSColor whiteColor]
    };
    [hudText drawAtPoint:NSMakePoint(28, self.bounds.size.height - 44) withAttributes:textAttributes];

    // Pressure Gauge Bar
    NSRect barBackgroundRect = NSMakeRect(350, self.bounds.size.height - 40, 110, 10);
    NSBezierPath *barBg = [NSBezierPath bezierPathWithRoundedRect:barBackgroundRect xRadius:3 yRadius:3];
    [[NSColor colorWithCalibratedWhite:0.3f alpha:1.0f] setFill];
    [barBg fill];

    float fillWidth = 110.0f * fmaxf(0.0f, fminf(1.0f, g_last_pressure));
    if (fillWidth > 0.0f) {
        NSRect barFillRect = NSMakeRect(350, self.bounds.size.height - 40, fillWidth, 10);
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
