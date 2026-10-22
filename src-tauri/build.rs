fn main() {
  let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
  if target_os == "macos" {
    println!("cargo:rerun-if-changed=src/native_overlay.m");
    println!("cargo:rerun-if-changed=src/native_overlay.h");
    cc::Build::new()
      .file("src/native_overlay.m")
      .flag("-fobjc-arc")
      .flag("-mmacosx-version-min=11.0")
      .compile("native_overlay");

    println!("cargo:rustc-link-lib=framework=Cocoa");
    println!("cargo:rustc-link-lib=framework=CoreGraphics");
    println!("cargo:rustc-link-lib=framework=QuartzCore");
  }
  tauri_build::build();
}
