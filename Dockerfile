# syntax=docker/dockerfile:1.12
# ======================================================================================================================
# Build Image:
# ------------
#
#   docker build -f ./Dockerfile -t s3-commander .
#
# Run Image:
# ----------
#
#   docker run -e AWS_ACCESS_KEY_ID=xxx -e AWS_SECRET_ACCESS_KEY=xxx -p 127.0.0.1:8000:8000/tcp --rm s3-commander
#
# ======================================================================================================================
ARG PYTHON_VERSION=3.14.3

FROM python:${PYTHON_VERSION}-bookworm AS poetry

ARG POETRY_EXTRA_OPTIONS=""
ARG POETRY_VERSION=2.3.2
ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONHASHSEED=random \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=60 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=1 \
    POETRY_CACHE_DIR="/opt/poetry/.cache"
SHELL ["/bin/bash", "-Eeux", "-o", "pipefail", "-c"]

RUN pip install --no-input "poetry==$POETRY_VERSION"
RUN poetry config virtualenvs.in-project true

WORKDIR /usr/src/app/
COPY pyproject.toml poetry.lock .
RUN --mount=type=cache,target=${POETRY_CACHE_DIR} \
    poetry install -vv ${POETRY_EXTRA_OPTIONS} --no-root --no-interaction --no-ansi --without dev

# ======================================================================================================================
FROM python:${PYTHON_VERSION}-slim-bookworm

ARG OCI_LABEL_TITLE="s3-commander"
ARG OCI_LABEL_SOURCE=""
ARG OCI_LABEL_VENDOR="Quantlane"

LABEL org.opencontainers.image.title="${OCI_LABEL_TITLE}" \
      org.opencontainers.image.source="${OCI_LABEL_SOURCE}" \
      org.opencontainers.image.vendor="${OCI_LABEL_VENDOR}"

ENV PYTHONUTF8=1 \
    PYTHONFAULTHANDLER=1
SHELL ["/bin/bash", "-Eeux", "-o", "pipefail", "-c"]

RUN groupadd --system --gid 1000 "app" && \
    useradd --shell /sbin/nologin \
      --home "/home/app" \
      --comment "Runtime user for this app" \
      --create-home \
      --system \
      --uid 1000 \
      --gid "app" "app"
USER "app"

WORKDIR /app
ENV PATH="/usr/src/app/.venv/bin:$PATH"
COPY --chown="app":"app" --from=poetry /usr/src/app/.venv/ /usr/src/app/.venv/
COPY --chown="app":"app" . .

EXPOSE 8000/tcp

ENTRYPOINT ["uvicorn", "s3_browser.main:app", "--host", "0.0.0.0", "--port", "8000"]
