"""
Celery Configuration for Spellbook v2.0

Background task processing for scan jobs.
"""

from celery import Celery
from app.config import settings

celery_app = Celery(
    "spellbook",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.scan_tasks"]
)

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task execution
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    
    # Result settings
    result_expires=86400,  # 24 hours
    
    # Retry settings
    task_default_retry_delay=60,
    task_max_retries=3,
    
    # Queue configuration
    task_queues={
        "default": {
            "exchange": "default",
            "routing_key": "default",
        },
        "scans": {
            "exchange": "scans",
            "routing_key": "scans",
        },
        "priority": {
            "exchange": "priority",
            "routing_key": "priority",
        },
    },
    
    # Default queue
    task_default_queue="default",
    
    # Task routes
    task_routes={
        "app.tasks.scan_tasks.process_scan": {"queue": "scans"},
        "app.tasks.scan_tasks.process_batch": {"queue": "scans"},
        "app.tasks.scan_tasks.cleanup_old_scans": {"queue": "default"},
    },
    
    # Beat scheduler (for periodic tasks)
    beat_schedule={
        "cleanup-old-scans": {
            "task": "app.tasks.scan_tasks.cleanup_old_scans",
            "schedule": 86400,  # Run daily
        },
    },
)
