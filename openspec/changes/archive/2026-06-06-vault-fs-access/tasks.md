## 1. Rust: ошибки и команды ФС

- [x] 1.1 Завести `enum AppError` (`Serialize + thiserror::Error`) с кейсами `PathEscape`, `NotFound`, `Io`, `NotUtf8`, `InvalidVaultRoot`
- [x] 1.2 Хелпер `resolve_within(vault_root, rel_path) -> Result<PathBuf, AppError>`: canonicalize корня, резолв относительного пути, проверка, что результат — потомок корня (для создаваемых — проверять канонический родитель)
- [x] 1.3 Команды `fs_read_dir`, `fs_read_text`, `fs_write_text`, `fs_create_dir`, `fs_remove`, `fs_rename` — каждая принимает `vault_root` + относительный путь(и), возвращает `Result<T, AppError>`, использует `resolve_within` до любого сайд-эффекта
- [x] 1.4 Регистрация команд в `src-tauri/src/lib.rs` (`invoke_handler![...]`)
- [x] 1.5 `#[cfg(test)]`-юнит-тесты `resolve_within`: нормальный путь, `..`-побег, симлинк наружу, несуществующий корень

## 2. Tauri-конфиг и права

- [x] 2.1 Подключить `tauri-plugin-dialog`; добавить минимальную capability в `src-tauri/capabilities/` (только нужное право выбора директории, явный `windows`)
- [x] 2.2 Проверить `tauri.conf.json` (CSP допустимо `null` на этом этапе — сетевого I/O нет)

## 3. Front: мост и активный vault

- [x] 3.1 `src/vault/fs-bridge.ts`: типизированные `invoke<T>`-врапперы над командами; типы записей дерева; `isTauri()`-детект; в web — деградация (типизированный признак «нет ФС»)
- [x] 3.2 Выбор директории-vault диалогом + типизированный результат (абсолютный путь)
- [x] 3.3 Хранение last-vault в app-prefs (`src/persistence`): `loadLastVaultPath` / `saveLastVaultPath`
- [x] 3.4 Тесты `fs-bridge.test.ts`: успешные вызовы (мок IPC), проброс типизированных ошибок, деградация без Tauri

## 4. Документация

- [x] 4.1 `docs/architecture.md`: раздел Tauri / IPC — список команд, модель confinement (vault_root + rel_path), `AppError`
- [x] 4.2 `README.md`: новое требование — при старте выбрать директорию-vault
- [x] 4.3 `make check` зелёный (format + lint + type-check + test 100% + e2e); `cargo test` для Rust-части
