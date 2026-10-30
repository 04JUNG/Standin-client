//! Reserve each destination atomically, including concurrent downloads.
use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub fn write_unique(folder: &Path, name: &str, bytes: &[u8]) -> io::Result<PathBuf> {
    write_unique_with_sidecar(folder, name, bytes, None)
}

/// The companion uses the reserved FBX basename. Never overwrite either file.
pub fn write_unique_with_sidecar(folder: &Path, name: &str, bytes: &[u8], metadata: Option<&[u8]>) -> io::Result<PathBuf> {
    let file = Path::new(name);
    if file.file_name().and_then(|s| s.to_str()) != Some(name) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "invalid file name",
        ));
    }
    let stem = file
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("standin_pose");
    let ext = file.extension().and_then(|s| s.to_str()).unwrap_or("fbx");
    for n in 0..=9999 {
        let path = folder.join(if n == 0 {
            name.to_owned()
        } else {
            format!("{stem} ({n}).{ext}")
        });
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut output) => {
                if let Err(error) = output.write_all(bytes) {
                    drop(output);
                    let _ = std::fs::remove_file(&path);
                    return Err(error);
                }
                if let Some(data) = metadata {
                    let sidecar = path.with_extension("scene.json");
                    match OpenOptions::new().write(true).create_new(true).open(&sidecar) {
                        Ok(mut companion) => {
                            if let Err(error) = companion.write_all(data) {
                                drop(companion);
                                drop(output);
                                let _ = std::fs::remove_file(&sidecar);
                                let _ = std::fs::remove_file(&path);
                                return Err(error);
                            }
                        }
                        Err(error) => {
                            drop(output);
                            let _ = std::fs::remove_file(&path);
                            if error.kind() == io::ErrorKind::AlreadyExists { continue; }
                            return Err(error);
                        }
                    }
                }
                return Ok(path);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "too many duplicate files",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn companion_collision_preserves_both_existing_files() {
        let folder = std::env::temp_dir().join(format!("standin-pair-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("pose.scene.json"), b"old").unwrap();
        let path = write_unique_with_sidecar(&folder, "pose.fbx", b"fbx", Some(b"metadata")).unwrap();
        assert_eq!(path.file_name().unwrap(), "pose (1).fbx");
        assert!(!folder.join("pose.fbx").exists());
        assert_eq!(std::fs::read(folder.join("pose.scene.json")).unwrap(), b"old");
        assert_eq!(std::fs::read(path.with_extension("scene.json")).unwrap(), b"metadata");
        std::fs::remove_dir_all(folder).unwrap();
    }
    #[test]
    fn concurrent_downloads_preserve_every_existing_file() {
        let folder = std::env::temp_dir().join(format!("standin-unique-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("pose.fbx"), b"original").unwrap();
        let workers: Vec<_> = (0..8)
            .map(|i| {
                let folder = folder.clone();
                std::thread::spawn(move || {
                    let data = format!("revision-{i}");
                    let path = write_unique(&folder, "pose.fbx", data.as_bytes()).unwrap();
                    assert_eq!(std::fs::read(path).unwrap(), data.as_bytes());
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        assert_eq!(std::fs::read(folder.join("pose.fbx")).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 9);
        assert!(write_unique(&folder, "../escape.fbx", b"bad").is_err());
        std::fs::remove_dir_all(folder).unwrap();
    }
}
