use futures_util::StreamExt;
use log::{info, warn};
use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

use super::atlas_manifest::{self, ManifestAsset, ManifestCatalog};
use super::types::{AtlasImageDownloadResult, AtlasImageEntry, AtlasImageProgressEvent};
use super::utils::build_user_agent;

/// 全局下载取消标志
static ATLAS_DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, PartialEq, Eq)]
enum ExistingFileAction {
    Skip,
    Migrate,
    Download,
}

fn existing_file_action(recorded_bytes: Option<u64>, actual_bytes: u64) -> ExistingFileAction {
    match recorded_bytes {
        Some(expected) if expected == actual_bytes => ExistingFileAction::Skip,
        Some(_) => ExistingFileAction::Download,
        None if actual_bytes > 0 => ExistingFileAction::Migrate,
        None => ExistingFileAction::Download,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasServantNamesResult {
    server: String,
    count: usize,
    path: String,
    source_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtlasServantRecognitionIndexResult {
    server: String,
    path: String,
    source_url: String,
}

#[tauri::command]
pub async fn download_atlas_servant_recognition_index(
    server: String,
) -> Result<AtlasServantRecognitionIndexResult, String> {
    let server = server.to_uppercase();
    if !matches!(server.as_str(), "TW" | "CN" | "JP") {
        return Err(format!("Unsupported Atlas server: {}", server));
    }

    let source_url = format!(
        "https://api.atlasacademy.io/export/{}/nice_servant.json",
        server
    );
    info!(
        "Downloading Atlas servant recognition index: {}",
        source_url
    );

    let client = Client::builder()
        .user_agent(build_user_agent())
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let response = client
        .get(&source_url)
        .send()
        .await
        .map_err(|e| format!("Atlas servant recognition request failed: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "Atlas servant recognition HTTP error: {}",
            response.status()
        ));
    }

    let catalog_dir = super::utils::get_app_data_dir()?
        .join("cache")
        .join("atlas")
        .join("catalog")
        .join(&server);
    tokio::fs::create_dir_all(&catalog_dir)
        .await
        .map_err(|e| format!("Failed to create Atlas catalog dir: {}", e))?;
    let path = catalog_dir.join("servant_recognition.raw.json");
    let temp_path = catalog_dir.join("servant_recognition.raw.json.tmp");
    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create Atlas index temp file: {}", e))?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| format!("Atlas servant recognition download failed: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write Atlas index: {}", e))?;
    }
    file.flush()
        .await
        .map_err(|e| format!("Failed to finish Atlas index: {}", e))?;
    tokio::fs::rename(&temp_path, &path)
        .await
        .map_err(|e| format!("Failed to move Atlas index into place: {}", e))?;

    // 不入账：前端会立即把该原始导出加工成 servant_recognition.index.json 并删除原件，
    // manifest 只记录持久保存的下载产物。

    info!(
        "Atlas servant recognition index saved: server={}, path={}",
        server,
        path.display()
    );
    Ok(AtlasServantRecognitionIndexResult {
        server,
        path: path.to_string_lossy().to_string(),
        source_url,
    })
}

#[tauri::command]
pub fn record_atlas_servant_recognition_catalog(server: String) -> Result<(), String> {
    let server = server.to_uppercase();
    if !matches!(server.as_str(), "TW" | "CN" | "JP") {
        return Err(format!("Unsupported Atlas server: {}", server));
    }

    let root = atlas_manifest::atlas_root()?;
    let path = root
        .join("catalog")
        .join(&server)
        .join("servant_recognition.index.json");
    let (bytes, sha256) = atlas_manifest::sha256_hex_of_file(&path)?;
    atlas_manifest::record_catalog(
        &root,
        ManifestCatalog {
            server: server.clone(),
            file: atlas_manifest::relative_file(&root, &path)?,
            source: format!(
                "https://api.atlasacademy.io/export/{}/nice_servant.json",
                server
            ),
            bytes,
            sha256,
            downloaded_at: atlas_manifest::now_rfc3339(),
        },
    )
}

#[tauri::command]
pub async fn download_atlas_servant_names(
    server: String,
) -> Result<AtlasServantNamesResult, String> {
    let server = server.to_uppercase();
    if !matches!(server.as_str(), "TW" | "CN" | "JP") {
        return Err(format!("Unsupported Atlas server: {}", server));
    }

    let source_url = format!(
        "https://api.atlasacademy.io/export/{}/basic_servant.json",
        server
    );
    info!("Downloading Atlas servant names: {}", source_url);

    let client = Client::builder()
        .user_agent(build_user_agent())
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&source_url)
        .send()
        .await
        .map_err(|e| format!("Atlas servant names request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Atlas servant names HTTP error: {}",
            response.status()
        ));
    }

    let payload: Vec<Value> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Atlas servant names JSON: {}", e))?;

    let servants: Vec<Value> = payload
        .iter()
        .map(|item| build_servant_name_entry(item, &server))
        .collect();

    let index = json!({
        "generatedAt": chrono::Utc::now().timestamp_millis(),
        "servants": servants,
    });

    let catalog_dir = super::utils::get_app_data_dir()?
        .join("cache")
        .join("atlas")
        .join("catalog")
        .join(&server);
    tokio::fs::create_dir_all(&catalog_dir)
        .await
        .map_err(|e| format!("Failed to create Atlas catalog dir: {}", e))?;

    let path = catalog_dir.join("basic_servants.json");
    let tmp_path = catalog_dir.join("basic_servants.json.tmp");
    let body = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("Failed to encode Atlas servant names index: {}", e))?;
    tokio::fs::write(&tmp_path, &body)
        .await
        .map_err(|e| format!("Failed to write Atlas servant names temp file: {}", e))?;
    tokio::fs::rename(&tmp_path, &path)
        .await
        .map_err(|e| format!("Failed to move Atlas servant names index into place: {}", e))?;

    let root = atlas_manifest::atlas_root()?;
    atlas_manifest::record_catalog(
        &root,
        ManifestCatalog {
            server: server.clone(),
            file: atlas_manifest::relative_file(&root, &path)?,
            source: source_url.clone(),
            bytes: body.len() as u64,
            sha256: atlas_manifest::sha256_hex(body.as_bytes()),
            downloaded_at: atlas_manifest::now_rfc3339(),
        },
    )?;

    info!(
        "Atlas servant names saved: server={}, count={}, path={}",
        server,
        payload.len(),
        path.display()
    );

    Ok(AtlasServantNamesResult {
        server,
        count: payload.len(),
        path: path.to_string_lossy().to_string(),
        source_url,
    })
}

fn build_servant_name_entry(item: &Value, server: &str) -> Value {
    let obj = item.as_object();
    let id = obj.and_then(|v| v.get("id")).and_then(Value::as_i64);
    let collection_no = obj
        .and_then(|v| v.get("collectionNo"))
        .and_then(Value::as_i64);
    let fallback_name = id.map(|value| value.to_string()).unwrap_or_default();
    let name = obj
        .and_then(|v| v.get("name"))
        .and_then(Value::as_str)
        .or_else(|| {
            obj.and_then(|v| v.get("originalName"))
                .and_then(Value::as_str)
        })
        .unwrap_or(fallback_name.as_str());
    let original_name = obj
        .and_then(|v| v.get("originalName"))
        .and_then(Value::as_str);
    let class_name = obj.and_then(|v| v.get("className")).and_then(Value::as_str);
    let rarity = obj.and_then(|v| v.get("rarity")).and_then(Value::as_i64);
    let face = obj.and_then(|v| v.get("face")).and_then(Value::as_str);

    let mut entry = Map::new();
    if let Some(id) = id {
        entry.insert("id".to_string(), json!(id));
    }
    if let Some(collection_no) = collection_no {
        entry.insert("collectionNo".to_string(), json!(collection_no));
    }
    entry.insert("name".to_string(), json!(name));
    if let Some(original_name) = original_name {
        entry.insert("originalName".to_string(), json!(original_name));
    }
    match server {
        "CN" => {
            entry.insert("nameCn".to_string(), json!(name));
        }
        "TW" => {
            entry.insert("nameTw".to_string(), json!(name));
        }
        "JP" => {
            entry.insert("nameJp".to_string(), json!(name));
        }
        _ => {}
    }
    if let Some(class_name) = class_name {
        entry.insert("className".to_string(), json!(class_name));
    }
    if let Some(rarity) = rarity {
        entry.insert("rarity".to_string(), json!(rarity));
    }
    if let Some(face) = face {
        entry.insert("face".to_string(), json!(face));
    }

    Value::Object(entry)
}

#[tauri::command]
pub async fn download_atlas_images(
    app: tauri::AppHandle,
    image_list: Vec<AtlasImageEntry>,
    concurrency: Option<u32>,
) -> Result<AtlasImageDownloadResult, String> {
    info!(
        "Starting batch download of {} Atlas images",
        image_list.len()
    );

    // 重置取消标志
    ATLAS_DOWNLOAD_CANCELLED.store(false, Ordering::SeqCst);

    let atlas_root = Arc::new(atlas_manifest::atlas_root()?);
    let recorded = Arc::new(atlas_manifest::recorded_bytes(&atlas_root)?);
    let manifest_updates: Arc<tokio::sync::Mutex<Vec<ManifestAsset>>> =
        Arc::new(tokio::sync::Mutex::new(Vec::new()));

    let concurrency_limit = concurrency.unwrap_or(4) as usize;
    let semaphore = Arc::new(Semaphore::new(concurrency_limit));

    let client = Client::builder()
        .user_agent(build_user_agent())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let total = image_list.len() as u32;
    let downloaded = Arc::new(std::sync::atomic::AtomicU32::new(0));
    let skipped = Arc::new(std::sync::atomic::AtomicU32::new(0));
    let failed = Arc::new(std::sync::atomic::AtomicU32::new(0));
    let errors = Arc::new(tokio::sync::Mutex::new(Vec::new()));

    let mut tasks = Vec::new();

    for entry in image_list {
        let client = client.clone();
        let semaphore = semaphore.clone();
        let downloaded = downloaded.clone();
        let skipped = skipped.clone();
        let failed = failed.clone();
        let errors = errors.clone();
        let atlas_root = atlas_root.clone();
        let recorded = recorded.clone();
        let manifest_updates = manifest_updates.clone();

        tasks.push(tokio::spawn(async move {
            if ATLAS_DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
                return;
            }

            let save_path = PathBuf::from(&entry.save_path);
            let relative_file = match atlas_manifest::relative_file(&atlas_root, &save_path) {
                Ok(relative) => relative,
                Err(e) => {
                    failed.fetch_add(1, Ordering::SeqCst);
                    warn!("{}", e);
                    errors.lock().await.push(e);
                    return;
                }
            };
            let manifest_entry = |bytes: u64, sha256: String| ManifestAsset {
                dataset: entry.dataset.clone(),
                atlas_id: entry.atlas_id,
                kind: entry.kind.clone(),
                variant: entry.variant.clone(),
                file: relative_file.clone(),
                source: entry.url.clone(),
                bytes,
                sha256,
                downloaded_at: atlas_manifest::now_rfc3339(),
            };

            // 同一 semaphore 同时限制旧缓存哈希和网络下载，避免全量任务
            // 在 manifest 首次迁移时并发读取数千个文件。
            let _permit = match semaphore.acquire().await {
                Ok(p) => p,
                Err(_) => return,
            };

            if ATLAS_DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
                return;
            }

            // 增量下载：manifest 有账且字节数一致才算已完成；
            // 磁盘有完整文件但没入账的（旧布局迁移），补哈希入账，不重新下载。
            if let Ok(metadata) = std::fs::metadata(&save_path) {
                match existing_file_action(recorded.get(&relative_file).copied(), metadata.len()) {
                    ExistingFileAction::Skip => {
                        skipped.fetch_add(1, Ordering::SeqCst);
                        return;
                    }
                    ExistingFileAction::Migrate => {
                        if let Ok((bytes, sha256)) = atlas_manifest::sha256_hex_of_file(&save_path)
                        {
                            manifest_updates
                                .lock()
                                .await
                                .push(manifest_entry(bytes, sha256));
                            skipped.fetch_add(1, Ordering::SeqCst);
                            return;
                        }
                    }
                    ExistingFileAction::Download => {}
                }
            }

            // 确保目录存在
            if let Some(parent) = save_path.parent() {
                if let Err(e) = tokio::fs::create_dir_all(parent).await {
                    failed.fetch_add(1, Ordering::SeqCst);
                    let err_msg = format!("Failed to create dir for {}: {}", entry.url, e);
                    warn!("{}", err_msg);
                    errors.lock().await.push(err_msg);
                    return;
                }
            }

            let temp_path = save_path.with_extension("tmp");

            match download_single_image(&client, &entry.url, &temp_path).await {
                Ok((bytes, sha256)) => {
                    // 重命名临时文件为最终文件；先落盘成功，后入账
                    match tokio::fs::rename(&temp_path, &save_path).await {
                        Ok(_) => {
                            manifest_updates
                                .lock()
                                .await
                                .push(manifest_entry(bytes, sha256));
                            downloaded.fetch_add(1, Ordering::SeqCst);
                        }
                        Err(e) => {
                            let _ = tokio::fs::remove_file(&temp_path).await;
                            failed.fetch_add(1, Ordering::SeqCst);
                            let err_msg = format!("Failed to rename file {}: {}", entry.url, e);
                            warn!("{}", err_msg);
                            errors.lock().await.push(err_msg);
                        }
                    }
                }
                Err(e) => {
                    let _ = tokio::fs::remove_file(&temp_path).await;
                    failed.fetch_add(1, Ordering::SeqCst);
                    let err_msg = format!("Failed to download {}: {}", entry.url, e);
                    warn!("{}", err_msg);
                    errors.lock().await.push(err_msg);
                }
            }
        }));
    }

    // 启动一个专门的任务定期上报进度
    let app_for_progress = app.clone();
    let downloaded_progress = downloaded.clone();
    let skipped_progress = skipped.clone();
    let failed_progress = failed.clone();

    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();

    let progress_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    break;
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(500)) => {
                    let d = downloaded_progress.load(Ordering::SeqCst);
                    let s = skipped_progress.load(Ordering::SeqCst);
                    let f = failed_progress.load(Ordering::SeqCst);

                    let _ = app_for_progress.emit(
                        "atlas-image-progress",
                        AtlasImageProgressEvent {
                            downloaded: d,
                            skipped: s,
                            total,
                            failed: f,
                        },
                    );

                    // 如果完成，退出循环
                    if d + s + f >= total || ATLAS_DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
                        break;
                    }
                }
            }
        }
    });

    // 等待所有下载任务完成
    for task in tasks {
        let _ = task.await;
    }

    // 停止进度上报任务
    let _ = stop_tx.send(());
    let _ = progress_task.await;

    // 批结束（含取消）统一入账：只有已落盘的文件才会出现在这里
    let updates = std::mem::take(&mut *manifest_updates.lock().await);
    let manifest_error = atlas_manifest::record_assets(&atlas_root, updates).err();
    if let Some(error) = &manifest_error {
        warn!("{}", error);
    }

    let final_downloaded = downloaded.load(Ordering::SeqCst);
    let final_skipped = skipped.load(Ordering::SeqCst);
    let final_failed = failed.load(Ordering::SeqCst);
    let final_errors = errors.lock().await.clone();

    // 发送最终进度
    let _ = app.emit(
        "atlas-image-progress",
        AtlasImageProgressEvent {
            downloaded: final_downloaded,
            skipped: final_skipped,
            total,
            failed: final_failed,
        },
    );

    info!(
        "Batch download complete: {} downloaded, {} skipped, {} failed",
        final_downloaded, final_skipped, final_failed
    );

    if let Some(error) = manifest_error {
        return Err(format!("Atlas 素材已落盘，但缓存清单写入失败: {}", error));
    }

    if ATLAS_DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
        return Err("下载已取消".to_string());
    }

    Ok(AtlasImageDownloadResult {
        total,
        downloaded: final_downloaded,
        skipped: final_skipped,
        failed: final_failed,
        errors: final_errors,
    })
}

async fn download_single_image(
    client: &Client,
    url: &str,
    temp_path: &PathBuf,
) -> Result<(u64, String), String> {
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let mut file = tokio::fs::File::create(temp_path)
        .await
        .map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    let mut bytes: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if ATLAS_DOWNLOAD_CANCELLED.load(Ordering::SeqCst) {
            return Err("Cancelled".to_string());
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        bytes += chunk.len() as u64;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| e.to_string())?;
    }
    file.flush().await.map_err(|e| e.to_string())?;

    Ok((bytes, format!("{:x}", hasher.finalize())))
}

#[tauri::command]
pub fn cancel_atlas_images() -> Result<(), String> {
    info!("Cancelling Atlas image download");
    ATLAS_DOWNLOAD_CANCELLED.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_manifest_size_mismatch_requires_download() {
        assert_eq!(
            existing_file_action(Some(100), 50),
            ExistingFileAction::Download
        );
        assert_eq!(
            existing_file_action(Some(100), 100),
            ExistingFileAction::Skip
        );
        assert_eq!(existing_file_action(None, 50), ExistingFileAction::Migrate);
        assert_eq!(existing_file_action(None, 0), ExistingFileAction::Download);
    }
}
