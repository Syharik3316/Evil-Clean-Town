"""Генерирует пару ключей VAPID для Web Push и печатает их в формате .env.

Запуск (из backend/, с активным venv, где установлен pywebpush):
    python scripts/generate_vapid_keys.py

Ключи одноразовые для конкретного окружения — сгенерируйте свою пару для
prod и не коммитьте её; вставьте вывод в backend/.env (см. app/core/config.py).
"""
from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02
from py_vapid.utils import b64urlencode


def main() -> None:
    vapid = Vapid02()
    vapid.generate_keys()

    public_raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    private_value = vapid.private_key.private_numbers().private_value
    private_raw = private_value.to_bytes(32, "big")

    print("Добавьте в backend/.env:\n")
    print(f"VAPID_PUBLIC_KEY={b64urlencode(public_raw)}")
    print(f"VAPID_PRIVATE_KEY={b64urlencode(private_raw)}")
    print("VAPID_SUBJECT=mailto:admin@syharik.ru")


if __name__ == "__main__":
    main()
