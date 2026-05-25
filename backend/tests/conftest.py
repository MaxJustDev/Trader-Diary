import os
import sys

# Make `app` importable when running pytest from backend/
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Provide a dummy ENCRYPTION_KEY so services/encryption.py can be imported in tests.
# Tests that call decrypt_password with real ciphertext must supply their own key.
if not os.getenv("ENCRYPTION_KEY"):
    from cryptography.fernet import Fernet
    os.environ["ENCRYPTION_KEY"] = Fernet.generate_key().decode()
