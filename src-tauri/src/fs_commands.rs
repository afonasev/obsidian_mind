use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// Типизированные ошибки файловых команд. `Serialize` с тегом `kind`, чтобы
/// фронт различал кейсы по дискриминанту, а не парсил строку.
#[derive(Debug, Serialize, thiserror::Error)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
  /// Резолв пути вышел за пределы корня vault (через `..`, абсолютный путь
  /// или симлинк наружу).
  #[error("path escapes vault root")]
  PathEscape,
  /// Целевой путь (или его родитель) не существует.
  #[error("path not found")]
  NotFound,
  /// Ошибка ввода-вывода. `std::io::Error` не `Serialize`, поэтому храним текст.
  #[error("io error: {0}")]
  Io(String),
  /// Содержимое файла не является валидным UTF-8.
  #[error("file is not valid utf-8")]
  NotUtf8,
  /// Корень vault не существует, не директория или не канонизируется.
  #[error("invalid vault root")]
  InvalidVaultRoot,
}

impl From<std::io::Error> for AppError {
  fn from(err: std::io::Error) -> Self {
    match err.kind() {
      std::io::ErrorKind::NotFound => AppError::NotFound,
      _ => AppError::Io(err.to_string()),
    }
  }
}

/// Запись дерева каталога. `rel_path` — путь относительно корня vault с
/// прямыми слешами (`/`) на всех платформах.
#[derive(Debug, Serialize)]
pub struct DirEntry {
  name: String,
  rel_path: String,
  is_dir: bool,
}

/// Канонизирует корень vault. Корень обязан существовать и быть директорией.
fn canonical_root(vault_root: &str) -> Result<PathBuf, AppError> {
  let root = Path::new(vault_root)
    .canonicalize()
    .map_err(|_| AppError::InvalidVaultRoot)?;
  if !root.is_dir() {
    return Err(AppError::InvalidVaultRoot);
  }
  Ok(root)
}

/// Резолвит `rel_path` относительно `vault_root` и проверяет, что результат —
/// потомок (или сам) канонического корня.
///
/// Для существующих путей канонизируется сам результат; для создаваемых —
/// канонизируется родитель, а финальный компонент присоединяется к нему. Это
/// закрывает побег через `..` и симлинки, ведущие за пределы vault: за
/// симлинком наружу мы не следуем — канонический путь не будет потомком корня.
pub fn resolve_within(vault_root: &str, rel_path: &str) -> Result<PathBuf, AppError> {
  let root = canonical_root(vault_root)?;

  // Абсолютный rel_path — сразу побег: команды работают только с путями
  // относительно корня.
  let rel = Path::new(rel_path);
  if rel.is_absolute() {
    return Err(AppError::PathEscape);
  }

  let joined = root.join(rel);

  let canonical = match joined.canonicalize() {
    Ok(path) => path,
    Err(_) => {
      // Путь ещё не существует (создаваемый) — канонизируем родителя и
      // присоединяем последний компонент.
      let parent = joined.parent().ok_or(AppError::PathEscape)?;
      let file_name = match joined.components().next_back() {
        Some(Component::Normal(name)) => name.to_owned(),
        // `.`, `..`, корень и т. п. как финальный компонент недопустимы.
        _ => return Err(AppError::PathEscape),
      };
      let canonical_parent = parent
        .canonicalize()
        .map_err(|_| AppError::PathEscape)?;
      canonical_parent.join(file_name)
    }
  };

  if !canonical.starts_with(&root) {
    return Err(AppError::PathEscape);
  }

  Ok(canonical)
}

/// Преобразует абсолютный путь внутри корня в относительный с прямыми слешами.
fn to_rel_string(root: &Path, path: &Path) -> Result<String, AppError> {
  let rel = path.strip_prefix(root).map_err(|_| AppError::PathEscape)?;
  let parts: Vec<String> = rel
    .components()
    .filter_map(|component| match component {
      Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
      _ => None,
    })
    .collect();
  Ok(parts.join("/"))
}

/// Рекурсивно обходит дерево каталога `dir`, наполняя `out` записями.
fn walk(root: &Path, dir: &Path, out: &mut Vec<DirEntry>) -> Result<(), AppError> {
  for entry in std::fs::read_dir(dir)? {
    let entry = entry?;
    let path = entry.path();
    let is_dir = entry.file_type()?.is_dir();
    let name = entry.file_name().to_string_lossy().into_owned();
    let rel_path = to_rel_string(root, &path)?;
    out.push(DirEntry {
      name,
      rel_path,
      is_dir,
    });
    if is_dir {
      walk(root, &path, out)?;
    }
  }
  Ok(())
}

#[tauri::command]
pub fn fs_read_dir(vault_root: String, rel_path: String) -> Result<Vec<DirEntry>, AppError> {
  let root = canonical_root(&vault_root)?;
  let target = resolve_within(&vault_root, &rel_path)?;
  let mut entries = Vec::new();
  walk(&root, &target, &mut entries)?;
  Ok(entries)
}

#[tauri::command]
pub fn fs_read_text(vault_root: String, rel_path: String) -> Result<String, AppError> {
  let target = resolve_within(&vault_root, &rel_path)?;
  let bytes = std::fs::read(&target)?;
  String::from_utf8(bytes).map_err(|_| AppError::NotUtf8)
}

#[tauri::command]
pub fn fs_write_text(
  vault_root: String,
  rel_path: String,
  contents: String,
) -> Result<(), AppError> {
  let target = resolve_within(&vault_root, &rel_path)?;
  std::fs::write(&target, contents)?;
  Ok(())
}

#[tauri::command]
pub fn fs_create_dir(vault_root: String, rel_path: String) -> Result<(), AppError> {
  let target = resolve_within(&vault_root, &rel_path)?;
  std::fs::create_dir_all(&target)?;
  Ok(())
}

#[tauri::command]
pub fn fs_remove(vault_root: String, rel_path: String) -> Result<(), AppError> {
  let target = resolve_within(&vault_root, &rel_path)?;
  if target.is_dir() {
    std::fs::remove_dir_all(&target)?;
  } else {
    std::fs::remove_file(&target)?;
  }
  Ok(())
}

#[tauri::command]
pub fn fs_rename(vault_root: String, from_rel: String, to_rel: String) -> Result<(), AppError> {
  let from = resolve_within(&vault_root, &from_rel)?;
  let to = resolve_within(&vault_root, &to_rel)?;
  std::fs::rename(&from, &to)?;
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir() -> PathBuf {
    let mut dir = std::env::temp_dir();
    let unique = format!(
      "vault-fs-test-{}-{:?}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock before epoch")
        .as_nanos()
    );
    dir.push(unique);
    std::fs::create_dir_all(&dir).expect("create temp dir");
    dir
  }

  #[test]
  fn resolves_normal_path_inside_root() {
    let root = temp_dir();
    let canonical_root = root.canonicalize().expect("canonicalize root");
    std::fs::write(root.join("note.md"), "hi").expect("write file");

    let resolved = resolve_within(root.to_str().expect("utf8 root"), "note.md")
      .expect("resolve inside root");

    assert_eq!(resolved, canonical_root.join("note.md"));
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn resolves_not_yet_existing_path_via_parent() {
    let root = temp_dir();
    let canonical_root = root.canonicalize().expect("canonicalize root");

    let resolved = resolve_within(root.to_str().expect("utf8 root"), "new.md")
      .expect("resolve creatable path");

    assert_eq!(resolved, canonical_root.join("new.md"));
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn rejects_dotdot_escape() {
    let root = temp_dir();

    let result = resolve_within(root.to_str().expect("utf8 root"), "../secret");

    assert!(matches!(result, Err(AppError::PathEscape)));
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn rejects_absolute_path() {
    let root = temp_dir();

    let result = resolve_within(root.to_str().expect("utf8 root"), "/etc/passwd");

    assert!(matches!(result, Err(AppError::PathEscape)));
    std::fs::remove_dir_all(&root).ok();
  }

  #[test]
  fn rejects_nonexistent_root() {
    let result = resolve_within("/no/such/vault/root/zzz", "note.md");

    assert!(matches!(result, Err(AppError::InvalidVaultRoot)));
  }

  #[cfg(unix)]
  #[test]
  fn rejects_symlink_pointing_outside_root() {
    use std::os::unix::fs::symlink;

    let outside = temp_dir();
    std::fs::write(outside.join("secret.txt"), "top secret").expect("write secret");

    let root = temp_dir();
    // Симлинк внутри vault, ведущий на файл за его пределами.
    symlink(outside.join("secret.txt"), root.join("link.txt")).expect("create symlink");

    let result = resolve_within(root.to_str().expect("utf8 root"), "link.txt");

    assert!(matches!(result, Err(AppError::PathEscape)));
    std::fs::remove_dir_all(&root).ok();
    std::fs::remove_dir_all(&outside).ok();
  }
}
