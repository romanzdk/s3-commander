"""Boto3 S3 client wrapper for list, copy, delete operations."""

import logging
from dataclasses import dataclass
from typing import Any

import boto3

logger = logging.getLogger(__name__)


@dataclass
class S3Object:
    """S3 object or prefix (folder) representation."""

    key: str
    size: int
    last_modified: str | None
    is_prefix: bool


def list_buckets() -> list[dict[str, Any]]:
    """List all S3 buckets in the account."""
    client = _get_client_internal()
    response = client.list_buckets()
    return [{"name": b["Name"], "created": b["CreationDate"].isoformat()} for b in response["Buckets"]]


def list_objects(bucket: str, prefix: str = "", max_keys: int = 1000) -> list[S3Object]:
    """
    List objects and common prefixes (folders) under the given bucket/prefix.
    Returns S3Object list with '..' parent folder when prefix is non-empty.
    """
    client = _get_client_internal()
    prefix = prefix.rstrip("/") + "/" if prefix else ""
    seen_prefixes: set[str] = set()
    objects: list[S3Object] = []

    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix, Delimiter="/", MaxKeys=max_keys):
        for p in page.get("CommonPrefixes", []):
            pfx = p["Prefix"].rstrip("/").split("/")[-1]
            if pfx and pfx not in seen_prefixes:
                seen_prefixes.add(pfx)
                objects.append(S3Object(key=p["Prefix"], size=0, last_modified=None, is_prefix=True))

        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key == prefix:
                continue
            name = key[len(prefix) :].rstrip("/")
            if "/" in name:
                top = name.split("/")[0]
                if top not in seen_prefixes:
                    seen_prefixes.add(top)
                    objects.append(S3Object(key=prefix + top + "/", size=0, last_modified=None, is_prefix=True))
            else:
                objects.append(
                    S3Object(
                        key=key,
                        size=obj.get("Size", 0),
                        last_modified=obj.get("LastModified", "").isoformat() if obj.get("LastModified") else None,
                        is_prefix=False,
                    )
                )

    if prefix:
        objects.insert(0, S3Object(key="..", size=0, last_modified=None, is_prefix=True))

    return objects


def copy_object(src_bucket: str, src_key: str, dst_bucket: str, dst_key: str) -> None:
    """Server-side copy of an S3 object."""
    client = _get_client_internal()
    copy_source = {"Bucket": src_bucket, "Key": src_key}
    client.copy_object(CopySource=copy_source, Bucket=dst_bucket, Key=dst_key)
    logger.info("Copied s3://%s/%s to s3://%s/%s", src_bucket, src_key, dst_bucket, dst_key)


def delete_object(bucket: str, key: str) -> None:
    """Delete an S3 object."""
    client = _get_client_internal()
    client.delete_object(Bucket=bucket, Key=key)
    logger.info("Deleted s3://%s/%s", bucket, key)


def move_object(src_bucket: str, src_key: str, dst_bucket: str, dst_key: str) -> None:
    """Server-side move: copy then delete."""
    copy_object(src_bucket, src_key, dst_bucket, dst_key)
    delete_object(src_bucket, src_key)


def _get_client_internal() -> Any:
    return boto3.client("s3")


def delete_prefix(bucket: str, prefix: str) -> None:
    """Recursively delete all objects under a prefix."""
    client = _get_client_internal()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            client.delete_object(Bucket=bucket, Key=obj["Key"])
            logger.info("Deleted s3://%s/%s", bucket, obj["Key"])


def copy_prefix_recursive(src_bucket: str, src_prefix: str, dst_bucket: str, dst_prefix: str) -> None:
    """Recursively copy all objects under a prefix."""
    client = _get_client_internal()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=src_bucket, Prefix=src_prefix):
        for obj in page.get("Contents", []):
            src_key = obj["Key"]
            rel = src_key[len(src_prefix) :]
            dst_key = (dst_prefix.rstrip("/") + "/" + rel).lstrip("/")
            copy_source = {"Bucket": src_bucket, "Key": src_key}
            client.copy_object(CopySource=copy_source, Bucket=dst_bucket, Key=dst_key)
            logger.info("Copied s3://%s/%s to s3://%s/%s", src_bucket, src_key, dst_bucket, dst_key)


def move_prefix(src_bucket: str, src_prefix: str, dst_bucket: str, dst_prefix: str) -> None:
    """Server-side move of a prefix (folder): copy all then delete all."""
    copy_prefix_recursive(src_bucket, src_prefix, dst_bucket, dst_prefix)
    delete_prefix(src_bucket, src_prefix)
