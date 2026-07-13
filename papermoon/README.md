# PaperMoon Client Extensions

This directory contains PaperMoon-specific client code mounted by MXU.

- `src/atlas/`: Atlas data cache, settings, and browser UI.
- `src-tauri/atlas_download.rs`: Atlas image downloader command.

Keeping these modules outside MXU's upstream `src/` tree makes future upstream merges smaller.
