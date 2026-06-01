#!/usr/bin/env python3
"""UserPromptSubmit-хук: советует уровень reasoning effort по фазе spec-driven работы.

Claude Code не умеет менять effort программно из хука: вход UserPromptSubmit не
содержит текущий уровень, а в выводе нет поля для его смены. Поэтому хук лишь
подсказывает нужный `/effort` через `systemMessage` и срабатывает только на смене
фазы (дедуп по последней рекомендации в рамках сессии), чтобы не спамить.
"""
import json
import os
import sys
import tempfile


def has(text, needles):
    return any(n in text for n in needles)


def classify(text):
    # Порядок важен: ревью → спека → реализация. Первое совпадение выигрывает.
    REVIEW = ("/code-review", "code-review", "code review", "/opsx:verify",
              "opsx:verify", "ревью дифф", "ревью изменен", "сделай ревью",
              "review the diff", "review changes", "проверь дифф", "посмотри дифф")
    if has(text, REVIEW):
        return ("high", "⚙️ Фаза ревью/верификации → рекомендую `/effort high` "
                        "(внимательный разбор диффа).")

    SPEC = ("/opsx:new", "/opsx:explore", "/opsx:continue", "/opsx:ff", "/opsx:sync",
            "opsx:new", "opsx:explore", "opsx:continue", "opsx:ff",
            "openspec", "напиши спек", "обнови спек", "спецификаци", "спека", "спеку",
            "proposal", "пропозал", "design doc", "задизайн")
    if has(text, SPEC):
        CRIT = ("security", "securit", "безопасн", "critical", "критичн",
                "cross-service", "кросс-сервис", "межсервис", "несколько сервис",
                "аутентификац", "авторизац", "payment", "платеж")
        if has(text, CRIT):
            return ("max", "⚙️ Critical/security/кросс-сервисная спека → рекомендую "
                           "`/effort max` (цена ошибки высокая).")
        return ("high", "⚙️ Фаза спеки → рекомендую `/effort high` "
                        "(проектирование поведения).")

    IMPL = ("/opsx:apply", "opsx:apply", "реализуй", "реализаци", "имплемент",
            "implement", "напиши код", "сделай реализацию", "запрограммируй",
            "примени задач", "apply the change")
    if has(text, IMPL):
        HARD = ("concurren", "гонк", "race condition", "конкурент", "паралл",
                "mutex", "блокиров", "миграц", "migrat", "alter table",
                "интеграц", "integrat", "внешн систем", "external system",
                "third-party", "вебхук", "webhook", "необрат", "irrevers",
                "удал данн", "delete data", "truncate", "деструктив",
                "алгоритм", "algorit", "транзакц", "transaction", "идемпотент")
        if has(text, HARD):
            return ("high", "⚙️ Реализация с повышенным риском (гонки/миграции/"
                            "интеграции/необратимое/алгоритмы) → рекомендую "
                            "`/effort high`.")
        return ("medium", "⚙️ Реализация по готовой спеке → рекомендую "
                          "`/effort medium` (работа по плану).")
    return None


def main():
    try:
        data = json.loads(sys.stdin.read())
    except (ValueError, TypeError):
        return  # вход не разобрали — молча выходим, не мешаем промпту
    prompt = str(data.get("prompt", "")).lower()
    if not prompt.strip():
        return
    session_id = str(data.get("session_id", "")) or "nosession"

    result = classify(prompt)
    if result is None:
        return  # фаза не распознана — не дёргаем пользователя
    level, message = result

    # Текущий effort хуку недоступен, поэтому дедупим по последней рекомендации
    # в рамках сессии: подсказываем только на смене фазы, а не на каждом промпте.
    state = os.path.join(tempfile.gettempdir(), f"claude-effort-{session_id}.last")
    try:
        with open(state, encoding="utf-8") as f:
            last = f.read().strip()
    except OSError:
        last = ""
    if last == level:
        return
    try:
        with open(state, "w", encoding="utf-8") as f:
            f.write(level)
    except OSError:
        pass  # не записали состояние — подскажем всё равно, хуже не будет

    print(json.dumps({"systemMessage": message}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Хук обязан быть безвредным: любая ошибка не должна ломать промпт.
        pass
