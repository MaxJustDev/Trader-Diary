import os
from cryptography.fernet import Fernet, InvalidToken

_ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not _ENCRYPTION_KEY:
    raise RuntimeError(
        "ENCRYPTION_KEY environment variable is not set. "
        "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )

cipher = Fernet(_ENCRYPTION_KEY.encode() if isinstance(_ENCRYPTION_KEY, str) else _ENCRYPTION_KEY)


def encrypt_password(password: str) -> str:
    return cipher.encrypt(password.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    try:
        return cipher.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        raise ValueError("Failed to decrypt password - encryption key may have changed")
