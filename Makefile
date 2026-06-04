.PHONY: help init run format lint type-check test test-e2e check build clean

help: ## Показать список доступных целей
	@echo "Команды Obsidian Mind"
	@echo ""
	@awk 'BEGIN {FS = ":.*## "} /^[-a-zA-Z0-9_]+:.*## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

init: ## Установить зависимости и Playwright-браузеры
	@command -v rustup >/dev/null 2>&1 || \
		echo "WARNING: rustup not found — Tauri commands (make run/build) will not work. Install via https://rustup.rs"
	bun install
	bunx playwright install --with-deps chromium

run: ## Запустить desktop-приложение (Vite + Tauri webview)
	bun run tauri dev

format: ## Применить форматирование Biome ко всем файлам
	bun run format

lint: ## Проверка кода Biome'ом (падает на любом warning)
	bun run lint

type-check: ## Проверка типов TypeScript
	bun run type-check

test: ## Unit/component-тесты Vitest с покрытием 100%
	bun run test

test-e2e: ## End-to-end тесты Playwright
	bun run test:e2e

check: ## Полный прогон: format:check + lint + type-check + test + test-e2e
	bun run check

build: ## Собрать desktop-приложение через Tauri
	bun run tauri build

clean: ## Удалить артефакты сборки и кэши
	rm -rf dist/ coverage/ src-tauri/target/ playwright-report/ test-results/ .vite/
