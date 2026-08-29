//! 队伍预设持久化
//!
//! 预设原先只存在 WebView 的 localStorage 里，而 macOS 上 WKWebView 的数据目录随
//! bundle identifier 分区：以 .app 启动和直接跑裸二进制会落到两个不同的 store，
//! 同一套队伍在另一种启动方式下就“消失”了。这里改为写 PaperMoon 数据目录下的
//! `config/battle-presets.json`，与 `mxu-<project>.json` 一样与启动方式无关。

use std::path::PathBuf;

const PRESETS_FILE: &str = "battle-presets.json";

fn presets_path() -> Result<PathBuf, String> {
    Ok(super::utils::get_app_data_dir()?
        .join("config")
        .join(PRESETS_FILE))
}

/// 读取队伍预设原文；文件不存在或为空时返回 None，由前端决定是否从 localStorage 迁移。
#[tauri::command]
pub fn read_battle_presets() -> Result<Option<String>, String> {
    let path = presets_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| format!("读取队伍预设失败: {}", e))?;
    if content.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(content))
}

/// 覆盖写入队伍预设。只接受 JSON 数组，避免把损坏内容写进用户数据目录。
#[tauri::command]
pub fn write_battle_presets(content: String) -> Result<(), String> {
    let parsed: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("队伍预设不是合法 JSON: {}", e))?;
    if !parsed.is_array() {
        return Err("队伍预设必须是 JSON 数组".to_string());
    }

    let path = presets_path()?;
    if let Some(dir) = path.parent() {
        if !dir.exists() {
            std::fs::create_dir_all(dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
    }

    // 原子写：与 app_config::save_config 一致，避免进程中途退出时把文件截断为 0 字节。
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, &content).map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("写入临时队伍预设文件失败: {}", e)
    })?;
    if let Err(e) = std::fs::rename(&tmp_path, &path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("重命名队伍预设文件失败: {}", e));
    }
    Ok(())
}
