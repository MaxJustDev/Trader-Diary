# TraderDiary Backend

## Setup

1. Create virtual environment:
```bash
python -m venv venv
venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create `.env` file with encryption key:
```
ENCRYPTION_KEY=your_fernet_key_here
```

4. Run the backend:
```bash
python run.py
```

Or using uvicorn directly:
```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8001`

API documentation at `http://localhost:8001/docs`
