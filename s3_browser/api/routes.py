"""REST API routes for S3 browser."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from s3_browser import s3_client

router = APIRouter(prefix="/api", tags=["api"])


class MoveCopyBody(BaseModel):
    """Request body for move/copy operations."""

    src_bucket: str
    src_keys: list[str]
    dst_bucket: str
    dst_prefix: str


@router.get("/buckets")
def get_buckets() -> dict:
    """List all S3 buckets."""
    try:
        buckets = s3_client.list_buckets()
        return {"buckets": buckets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/objects")
def get_objects(bucket: str, prefix: str = "") -> dict:
    """List objects and prefixes under bucket/prefix."""
    try:
        objects = s3_client.list_objects(bucket=bucket, prefix=prefix)
        parts = prefix.rstrip("/").split("/")[:-1] if prefix else []
        parent_prefix = "/".join(parts) + "/" if parts else ""
        return {
            "objects": [
                {
                    "key": o.key,
                    "size": o.size,
                    "last_modified": o.last_modified,
                    "is_prefix": o.is_prefix,
                }
                for o in objects
            ],
            "parent_prefix": parent_prefix,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _dst_key_for_item(src_key: str, dst_prefix: str) -> str:
    """Compute destination key for a source key."""
    dst_prefix = dst_prefix.rstrip("/") + "/" if dst_prefix else ""
    if src_key.endswith("/"):
        folder_name = src_key.rstrip("/").split("/")[-1]
        return dst_prefix + folder_name + "/"
    return dst_prefix + src_key.split("/")[-1]


@router.post("/move")
def move_objects(body: MoveCopyBody) -> dict:
    """Move object(s) or prefix(es) from source to destination (server-side)."""
    try:
        for src_key in body.src_keys:
            if src_key == "..":
                continue
            dst_key = _dst_key_for_item(src_key, body.dst_prefix)
            if src_key.endswith("/"):
                s3_client.move_prefix(body.src_bucket, src_key, body.dst_bucket, dst_key)
            else:
                s3_client.move_object(body.src_bucket, src_key, body.dst_bucket, dst_key)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/copy")
def copy_objects(body: MoveCopyBody) -> dict:
    """Copy object(s) or prefix(es) from source to destination (server-side)."""
    try:
        for src_key in body.src_keys:
            if src_key == "..":
                continue
            dst_key = _dst_key_for_item(src_key, body.dst_prefix)
            if src_key.endswith("/"):
                s3_client.copy_prefix_recursive(
                    body.src_bucket, src_key, body.dst_bucket, dst_key
                )
            else:
                s3_client.copy_object(
                    body.src_bucket, src_key, body.dst_bucket, dst_key
                )
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/object")
def delete_object_endpoint(bucket: str, key: str) -> dict:
    """Delete an S3 object or prefix (recursive)."""
    try:
        if key == "..":
            raise HTTPException(status_code=400, detail="Cannot delete parent")
        if key.endswith("/"):
            s3_client.delete_prefix(bucket, key)
        else:
            s3_client.delete_object(bucket, key)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
