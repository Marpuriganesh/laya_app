fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=src/sketch_canvas_view.m");
        println!("cargo:rerun-if-changed=src/sketch_canvas_view.h");
        cc::Build::new()
            .file("src/sketch_canvas_view.m")
            .flag("-fobjc-arc")
            .flag("-mmacosx-version-min=11.0")
            .compile("sketch_native_cocoa");

        println!("cargo:rustc-link-lib=framework=Cocoa");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=QuartzCore");
    }
}
