from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
import os
import shutil
import logging
from app.database import _db_path, engine, SessionLocal, Base

router = APIRouter()
logger = logging.getLogger(__name__)

SQLITE_MAGIC = b"SQLite format 3\x00"


@router.get("/backup")
async def backup_database():
    """Download the SQLite database file."""
    if not os.path.exists(_db_path):
        raise HTTPException(status_code=404, detail="Database file not found")

    filename = f"traderdiary-backup-{__import__('datetime').date.today().isoformat()}.db"
    return FileResponse(
        path=_db_path,
        media_type="application/octet-stream",
        filename=filename,
    )


@router.post("/restore")
async def restore_database(file: UploadFile = File(...)):
    """Replace the database with an uploaded backup. Validates SQLite magic bytes."""
    content = await file.read()

    # Validate SQLite magic
    if not content.startswith(SQLITE_MAGIC):
        raise HTTPException(status_code=400, detail="Invalid file: not a SQLite database")

    # Write to a temp file first, then replace
    tmp_path = _db_path + ".restore_tmp"
    try:
        with open(tmp_path, "wb") as f:
            f.write(content)

        # Dispose all connections
        engine.dispose()

        # Replace existing DB
        shutil.move(tmp_path, _db_path)
        logger.info("Database restored from upload (%d bytes)", len(content))

        # Recreate tables (new DB may be missing none, but ensures schema)
        Base.metadata.create_all(bind=engine)

        return {"message": "Database restored successfully", "size_bytes": len(content)}
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        logger.error("Restore failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")
