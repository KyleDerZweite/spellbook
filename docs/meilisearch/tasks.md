# MeiliSearch Tasks (Async Operations)

Reference: https://www.meilisearch.com/docs/reference/api/tasks

All write operations in MeiliSearch are **asynchronous**. When you add documents, update settings, or create an index, MeiliSearch enqueues a task and returns immediately with a task summary. You must poll the task endpoint to know when the operation completes.

---

## Why Async Matters for Spellbook

The Python worker must wait for tasks to complete before:
- Marking ingestion as done
- Starting the next batch (to avoid overwhelming the queue)
- Confirming that settings are applied before adding documents
- Verifying both `cards_distinct` and `cards_all` are in sync (atomic sync guarantee)

---

## Task Summary (Returned by Write Operations)

When you perform a write operation, you receive a task summary immediately:

```json
{
  "taskUid": 42,
  "indexUid": "cards_distinct",
  "status": "enqueued",
  "type": "documentAdditionOrUpdate",
  "enqueuedAt": "2024-01-01T00:00:00Z"
}
```

The `taskUid` is used to poll for completion.

---

## Task Statuses

| Status | Description |
|--------|-------------|
| `enqueued` | Waiting in the queue, not yet started |
| `processing` | Currently being executed |
| `succeeded` | Completed successfully, changes applied |
| `failed` | Encountered an error, no changes made to the database |
| `canceled` | Terminated by a cancel request before or during processing |

Terminal states: `succeeded`, `failed`, `canceled` — no further changes will occur.

---

## Get a Single Task

```
GET /tasks/{task_uid}
```

```bash
curl 'http://localhost:7700/tasks/42' \
  -H 'Authorization: Bearer MASTER_KEY'
```

**Response (succeeded):**
```json
{
  "uid": 42,
  "batchUid": 10,
  "indexUid": "cards_distinct",
  "status": "succeeded",
  "type": "documentAdditionOrUpdate",
  "canceledBy": null,
  "details": {
    "receivedDocuments": 10000,
    "indexedDocuments": 10000
  },
  "error": null,
  "duration": "PT5.234S",
  "enqueuedAt": "2024-01-01T00:00:00Z",
  "startedAt": "2024-01-01T00:00:01Z",
  "finishedAt": "2024-01-01T00:00:06Z"
}
```

**Response (failed):**
```json
{
  "uid": 43,
  "indexUid": "cards_distinct",
  "status": "failed",
  "type": "documentAdditionOrUpdate",
  "details": {
    "receivedDocuments": 100,
    "indexedDocuments": 0
  },
  "error": {
    "message": "Document doesn't have a `scryfall_id` attribute: ...",
    "code": "missing_document_id",
    "type": "invalid_request",
    "link": "https://docs.meilisearch.com/errors#missing_document_id"
  },
  "duration": "PT0.012S",
  "enqueuedAt": "2024-01-01T00:00:00Z",
  "startedAt": "2024-01-01T00:00:00Z",
  "finishedAt": "2024-01-01T00:00:00Z"
}
```

---

## Full Task Object Schema

| Field | Type | Description |
|-------|------|-------------|
| `uid` | integer | Sequential task identifier |
| `batchUid` | integer \| null | Associated processing batch |
| `indexUid` | string \| null | Target index (`null` for global tasks like index swaps) |
| `status` | enum | `enqueued`, `processing`, `succeeded`, `failed`, `canceled` |
| `type` | enum | Operation type (see below) |
| `canceledBy` | integer \| null | UID of the task that canceled this one |
| `details` | object \| null | Type-specific progress info (e.g., `receivedDocuments`, `indexedDocuments`) |
| `error` | object \| null | Error details if status is `failed` |
| `duration` | string \| null | ISO-8601 duration (e.g., `"PT5.234S"`), null if not finished |
| `enqueuedAt` | string | RFC 3339 timestamp |
| `startedAt` | string \| null | RFC 3339 timestamp, null if not started |
| `finishedAt` | string \| null | RFC 3339 timestamp, null if not finished |
| `customMetadata` | string \| null | User-provided metadata (set at task creation) |

---

## Task Types

| Type | Triggered By |
|------|-------------|
| `documentAdditionOrUpdate` | POST or PUT to `/documents` |
| `documentEdition` | PATCH to `/documents` (edit by function) |
| `documentDeletion` | DELETE to `/documents` or `/documents/{id}` |
| `settingsUpdate` | PATCH or PUT to `/settings/*` |
| `indexCreation` | POST to `/indexes` |
| `indexUpdate` | PATCH to `/indexes/{uid}` |
| `indexDeletion` | DELETE to `/indexes/{uid}` |
| `indexSwap` | POST to `/swap-indexes` |
| `taskCancelation` | POST to `/tasks/cancel` |
| `taskDeletion` | DELETE to `/tasks` |
| `dumpCreation` | POST to `/dumps` |
| `snapshotCreation` | POST to `/snapshots` |

---

## List Tasks

```
GET /tasks
```

Returns all tasks, newest first (descending by `uid`).

```bash
curl 'http://localhost:7700/tasks' \
  -H 'Authorization: Bearer MASTER_KEY'
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Max tasks to return (default: 20) |
| `from` | integer | Starting task UID for pagination |
| `reverse` | boolean | Reverse sort order (oldest first) |
| `indexUids` | string[] | Filter by index UIDs |
| `statuses` | string[] | Filter by status |
| `types` | string[] | Filter by task type |
| `uids` | integer[] | Filter by specific task UIDs |
| `afterEnqueuedAt` | RFC 3339 string | Tasks enqueued after this time |
| `beforeEnqueuedAt` | RFC 3339 string | Tasks enqueued before this time |
| `afterFinishedAt` | RFC 3339 string | Tasks finished after this time |
| `beforeFinishedAt` | RFC 3339 string | Tasks finished before this time |

**Response:**
```json
{
  "results": [ /* array of task objects */ ],
  "total": 150,
  "limit": 20,
  "from": 149,
  "next": 129
}
```

---

## Cancel Tasks

```
POST /tasks/cancel
```

Cancel enqueued or processing tasks matching the filter. Must specify at least one filter parameter.

```bash
# Cancel all enqueued tasks for cards_distinct
curl -X POST 'http://localhost:7700/tasks/cancel?indexUids=cards_distinct&statuses=enqueued' \
  -H 'Authorization: Bearer MASTER_KEY'
```

Returns a task of type `taskCancelation`.

---

## Delete Tasks

```
DELETE /tasks
```

Delete finished tasks from history to reclaim space. Must specify at least one filter parameter.

```bash
# Delete all succeeded tasks older than a date
curl -X DELETE 'http://localhost:7700/tasks?statuses=succeeded&beforeFinishedAt=2024-01-01T00:00:00Z' \
  -H 'Authorization: Bearer MASTER_KEY'
```

---

## Polling for Completion (Python)

### Using the SDK's Built-in Wait

```python
import meilisearch

client = meilisearch.Client('http://localhost:7700', 'MASTER_KEY')

# The SDK provides wait_for_task
task = client.index('cards_distinct').add_documents(documents)
result = client.wait_for_task(
    task.task_uid,
    timeout_in_ms=300_000,   # 5 minute timeout
    interval_in_ms=500        # Poll every 500ms
)

if result.status == 'succeeded':
    print(f"Indexed {result.details.get('indexedDocuments')} documents")
elif result.status == 'failed':
    print(f"Failed: {result.error}")
```

### Manual Polling

```python
import time

def wait_for_task(client, task_uid: int, timeout_s: int = 300) -> dict:
    """Poll until task is done. Raises on timeout or failure."""
    start = time.time()
    while True:
        task = client.get_task(task_uid)

        if task.status == 'succeeded':
            return task
        elif task.status in ('failed', 'canceled'):
            raise RuntimeError(f"Task {task_uid} {task.status}: {task.error}")
        elif time.time() - start > timeout_s:
            raise TimeoutError(f"Task {task_uid} timed out after {timeout_s}s")

        time.sleep(0.5)
```

### Waiting for Multiple Tasks (Atomic Sync)

```python
def wait_for_tasks(client, task_uids: list[int], timeout_s: int = 600):
    """Wait for multiple tasks to complete. Raises if any fail."""
    failed = []
    for uid in task_uids:
        try:
            wait_for_task(client, uid, timeout_s)
        except RuntimeError as e:
            failed.append(str(e))

    if failed:
        raise RuntimeError(f"Some tasks failed:\n" + "\n".join(failed))

    print(f"All {len(task_uids)} tasks completed successfully")


# Atomic sync: both indexes updated together
distinct_task = client.index('cards_distinct').add_documents(batch)
all_task = client.index('cards_all').add_documents(batch)

wait_for_tasks(client, [distinct_task.task_uid, all_task.task_uid])
```

---

## Health Check Before Starting

The worker must verify MeiliSearch is ready before enqueuing tasks:

```python
import time
import requests

def wait_for_meilisearch(url: str, max_retries: int = 20, backoff_s: float = 2.0):
    """Poll health endpoint until MeiliSearch is ready."""
    for attempt in range(max_retries):
        try:
            response = requests.get(f"{url}/health", timeout=5)
            if response.status_code == 200 and response.json().get('status') == 'available':
                print(f"MeiliSearch ready after {attempt + 1} attempts")
                return
        except (requests.ConnectionError, requests.Timeout):
            pass

        wait = min(backoff_s * (2 ** attempt), 30)  # Exponential backoff, max 30s
        print(f"MeiliSearch not ready, retrying in {wait:.0f}s...")
        time.sleep(wait)

    raise RuntimeError("MeiliSearch did not become ready in time")

wait_for_meilisearch(MEILISEARCH_URL)
```
