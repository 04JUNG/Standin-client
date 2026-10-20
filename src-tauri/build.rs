fn main() {
    // tauri-build embeds the ICO in the Windows executable but does not track
    // it as a build input. Rebuild the PE resources after an icon-only change.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build()
}
