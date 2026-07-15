//! Atlas cache manifest writer. The manifest contract lives in the PaperMoon
//! main repository (docs/atlas-cache.md); this module is its only writer.
//! Files must be fully on disk (tmp + rename) before they are recorded here.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const SCHEMA_VERSION: u32 = 1;
const MANIFEST_FILE: &str = "manifest.json";

/// Serializes every read-modify-write of manifest.json inside this process.
static MANIFEST_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestCatalog {
    pub server: String,
    pub file: String,
    pub source: String,
    pub bytes: u64,
    pub sha256: String,
    pub downloaded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestAsset {
    pub dataset: String,
    pub atlas_id: i64,
    pub kind: String,
    pub variant: String,
    pub file: String,
    pub source: String,
    pub bytes: u64,
    pub sha256: String,
    pub downloaded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema_version: u32,
    pub generated_at: String,
    pub catalogs: Vec<ManifestCatalog>,
    pub assets: Vec<ManifestAsset>,
}

impl Manifest {
    fn empty() -> Self {
        Manifest {
            schema_version: SCHEMA_VERSION,
            generated_at: now_rfc3339(),
            catalogs: Vec::new(),
            assets: Vec::new(),
        }
    }
}

pub fn atlas_root() -> Result<PathBuf, String> {
    Ok(super::utils::get_app_data_dir()?
        .join("cache")
        .join("atlas"))
}

pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn sha256_hex_of_file(path: &Path) -> Result<(u64, String), String> {
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read {} for hashing: {}", path.display(), e))?;
    Ok((bytes.len() as u64, sha256_hex(&bytes)))
}

/// Converts an absolute save path into the root-relative, forward-slash form
/// the manifest requires. Paths outside the atlas root are refused.
pub fn relative_file(root: &Path, absolute: &Path) -> Result<String, String> {
    let relative = absolute.strip_prefix(root).map_err(|_| {
        format!(
            "Path {} is outside the Atlas cache root {}",
            absolute.display(),
            root.display()
        )
    })?;
    let mut parts = Vec::new();
    for component in relative.components() {
        match component {
            std::path::Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            _ => {
                return Err(format!(
                    "Path {} does not normalize under the Atlas cache root",
                    absolute.display()
                ))
            }
        }
    }
    if parts.is_empty() {
        return Err(format!(
            "Path {} is the Atlas cache root itself",
            absolute.display()
        ));
    }
    Ok(parts.join("/"))
}

fn load_for_update(root: &Path) -> Result<Manifest, String> {
    let path = root.join(MANIFEST_FILE);
    let raw = match std::fs::read(&path) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Manifest::empty()),
        Err(e) => return Err(format!("Failed to read Atlas manifest: {}", e)),
    };
    let mut manifest: Manifest = serde_json::from_slice(&raw)
        .map_err(|e| format!("Failed to parse Atlas manifest: {}", e))?;
    if manifest.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Atlas manifest schemaVersion {} is not supported (want {}); refusing to overwrite",
            manifest.schema_version, SCHEMA_VERSION
        ));
    }
    manifest.catalogs.retain(|catalog| {
        catalog.file != format!("catalog/{}/servant_recognition.raw.json", catalog.server)
    });
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn same_asset_key(left: &ManifestAsset, right: &ManifestAsset) -> bool {
    left.dataset == right.dataset
        && left.atlas_id == right.atlas_id
        && left.kind == right.kind
        && left.variant == right.variant
}

fn validate_manifest(manifest: &Manifest) -> Result<(), String> {
    let mut files = HashMap::with_capacity(manifest.assets.len() + manifest.catalogs.len());
    for catalog in &manifest.catalogs {
        if files.insert(catalog.file.as_str(), "catalog").is_some() {
            return Err(format!("Duplicate Atlas manifest file: {}", catalog.file));
        }
    }

    let mut asset_keys = HashMap::with_capacity(manifest.assets.len());
    for asset in &manifest.assets {
        if files.insert(asset.file.as_str(), "asset").is_some() {
            return Err(format!("Duplicate Atlas manifest file: {}", asset.file));
        }
        let key = (
            asset.dataset.as_str(),
            asset.atlas_id,
            asset.kind.as_str(),
            asset.variant.as_str(),
        );
        if let Some(existing) = asset_keys.insert(key, asset.file.as_str()) {
            return Err(format!(
                "Duplicate Atlas asset key for files {} and {}",
                existing, asset.file
            ));
        }
    }
    Ok(())
}

fn write_atomically(root: &Path, manifest: &Manifest) -> Result<(), String> {
    std::fs::create_dir_all(root)
        .map_err(|e| format!("Failed to create Atlas cache root: {}", e))?;
    let body = serde_json::to_vec_pretty(manifest)
        .map_err(|e| format!("Failed to encode Atlas manifest: {}", e))?;
    let path = root.join(MANIFEST_FILE);
    let tmp = root.join(format!("{}.tmp", MANIFEST_FILE));
    std::fs::write(&tmp, body).map_err(|e| format!("Failed to write Atlas manifest: {}", e))?;
    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("Failed to move Atlas manifest into place: {}", e))
}

/// Loads the recorded byte sizes keyed by root-relative file path, for skip
/// decisions before a batch download. A missing manifest yields an empty map.
pub fn recorded_bytes(root: &Path) -> Result<HashMap<String, u64>, String> {
    let _guard = MANIFEST_LOCK
        .lock()
        .map_err(|_| "Atlas manifest lock poisoned")?;
    let manifest = load_for_update(root)?;
    let mut map = HashMap::with_capacity(manifest.assets.len() + manifest.catalogs.len());
    for catalog in &manifest.catalogs {
        map.insert(catalog.file.clone(), catalog.bytes);
    }
    for asset in &manifest.assets {
        map.insert(asset.file.clone(), asset.bytes);
    }
    Ok(map)
}

/// Upserts asset entries by their semantic key and writes the manifest once.
pub fn record_assets(root: &Path, entries: Vec<ManifestAsset>) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }
    let _guard = MANIFEST_LOCK
        .lock()
        .map_err(|_| "Atlas manifest lock poisoned")?;
    let mut manifest = load_for_update(root)?;
    for entry in entries {
        if manifest
            .catalogs
            .iter()
            .any(|catalog| catalog.file == entry.file)
        {
            return Err(format!(
                "Atlas asset file conflicts with catalog: {}",
                entry.file
            ));
        }
        let key_index = manifest
            .assets
            .iter()
            .position(|asset| same_asset_key(asset, &entry));
        let file_index = manifest
            .assets
            .iter()
            .position(|asset| asset.file == entry.file);
        match (key_index, file_index) {
            (Some(key), Some(file)) if key != file => {
                return Err(format!(
                    "Atlas asset file conflicts with another key: {}",
                    entry.file
                ));
            }
            (Some(index), _) => manifest.assets[index] = entry,
            (None, Some(_)) => {
                return Err(format!(
                    "Atlas asset file conflicts with another key: {}",
                    entry.file
                ));
            }
            (None, None) => manifest.assets.push(entry),
        }
    }
    validate_manifest(&manifest)?;
    manifest.generated_at = now_rfc3339();
    write_atomically(root, &manifest)
}

/// Upserts one catalogue entry by its `file` key and writes the manifest.
pub fn record_catalog(root: &Path, entry: ManifestCatalog) -> Result<(), String> {
    let _guard = MANIFEST_LOCK
        .lock()
        .map_err(|_| "Atlas manifest lock poisoned")?;
    let mut manifest = load_for_update(root)?;
    if manifest.assets.iter().any(|asset| asset.file == entry.file) {
        return Err(format!(
            "Atlas catalog file conflicts with asset: {}",
            entry.file
        ));
    }
    if let Some(existing) = manifest.catalogs.iter_mut().find(|c| c.file == entry.file) {
        *existing = entry;
    } else {
        manifest.catalogs.push(entry);
    }
    manifest.generated_at = now_rfc3339();
    write_atomically(root, &manifest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(file: &str, bytes: u64) -> ManifestAsset {
        ManifestAsset {
            dataset: "servants".into(),
            atlas_id: 100100,
            kind: "faces".into(),
            variant: "ascension/1".into(),
            file: file.into(),
            source: "https://example.invalid/f.png".into(),
            bytes,
            sha256: "00".into(),
            downloaded_at: now_rfc3339(),
        }
    }

    #[test]
    fn records_and_upserts_assets() {
        let root = tempfile::tempdir().unwrap();
        record_assets(root.path(), vec![asset("assets/servants/faces/a.png", 10)]).unwrap();
        record_assets(root.path(), vec![asset("assets/servants/faces/a.png", 20)]).unwrap();
        let map = recorded_bytes(root.path()).unwrap();
        assert_eq!(map.len(), 1);
        assert_eq!(map["assets/servants/faces/a.png"], 20);
        let raw = std::fs::read_to_string(root.path().join(MANIFEST_FILE)).unwrap();
        assert!(raw.contains("\"schemaVersion\": 1"));
        assert!(raw.contains("\"atlasId\": 100100"));
    }

    #[test]
    fn records_catalog_separately_from_assets() {
        let root = tempfile::tempdir().unwrap();
        record_catalog(
            root.path(),
            ManifestCatalog {
                server: "TW".into(),
                file: "catalog/TW/basic_servants.json".into(),
                source: "https://example.invalid/basic.json".into(),
                bytes: 15,
                sha256: "00".into(),
                downloaded_at: now_rfc3339(),
            },
        )
        .unwrap();
        record_assets(root.path(), vec![asset("assets/servants/faces/a.png", 10)]).unwrap();
        let map = recorded_bytes(root.path()).unwrap();
        assert_eq!(map.len(), 2);
        assert_eq!(map["catalog/TW/basic_servants.json"], 15);
    }

    #[test]
    fn removes_legacy_ephemeral_recognition_catalog_on_update() {
        let root = tempfile::tempdir().unwrap();
        record_catalog(
            root.path(),
            ManifestCatalog {
                server: "TW".into(),
                file: "catalog/TW/servant_recognition.raw.json".into(),
                source: "https://example.invalid/nice.json".into(),
                bytes: 10,
                sha256: "00".into(),
                downloaded_at: now_rfc3339(),
            },
        )
        .unwrap();
        record_catalog(
            root.path(),
            ManifestCatalog {
                server: "TW".into(),
                file: "catalog/TW/basic_servants.json".into(),
                source: "https://example.invalid/basic.json".into(),
                bytes: 15,
                sha256: "00".into(),
                downloaded_at: now_rfc3339(),
            },
        )
        .unwrap();

        let raw = std::fs::read_to_string(root.path().join(MANIFEST_FILE)).unwrap();
        assert!(!raw.contains("servant_recognition.raw.json"));
        assert!(raw.contains("basic_servants.json"));
    }

    #[test]
    fn refuses_unknown_schema_version() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(
            root.path().join(MANIFEST_FILE),
            r#"{"schemaVersion":2,"generatedAt":"","catalogs":[],"assets":[]}"#,
        )
        .unwrap();
        let err = record_assets(root.path(), vec![asset("assets/a.png", 1)]).unwrap_err();
        assert!(err.contains("schemaVersion"), "unexpected error: {err}");
    }

    #[test]
    fn updates_assets_by_semantic_key() {
        let root = tempfile::tempdir().unwrap();
        record_assets(root.path(), vec![asset("assets/old.png", 10)]).unwrap();
        record_assets(root.path(), vec![asset("assets/new.png", 20)]).unwrap();
        let map = recorded_bytes(root.path()).unwrap();
        assert_eq!(map.len(), 1);
        assert_eq!(map["assets/new.png"], 20);
    }

    #[test]
    fn refuses_file_reuse_for_another_asset_key() {
        let root = tempfile::tempdir().unwrap();
        record_assets(root.path(), vec![asset("assets/a.png", 10)]).unwrap();
        let mut conflicting = asset("assets/a.png", 20);
        conflicting.variant = "ascension/2".into();
        let error = record_assets(root.path(), vec![conflicting]).unwrap_err();
        assert!(error.contains("conflicts"), "unexpected error: {error}");
    }

    #[test]
    fn relativizes_only_paths_under_root() {
        let root = Path::new("/data/cache/atlas");
        assert_eq!(
            relative_file(
                root,
                Path::new("/data/cache/atlas/assets/servants/faces/a.png")
            )
            .unwrap(),
            "assets/servants/faces/a.png"
        );
        assert!(relative_file(root, Path::new("/data/elsewhere/a.png")).is_err());
        assert!(relative_file(root, Path::new("/data/cache/atlas")).is_err());
    }
}
