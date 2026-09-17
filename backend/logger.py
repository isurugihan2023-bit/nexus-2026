"""
backend/logger.py - Structured JSON Logging for Ninja Nexus Bot
Configures a rotating file logger outputting structured JSON logs for presence tracking,
API events, and WebSocket connections.
"""

import os
import json
import logging
import logging.handlers
from datetime import datetime

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage()
        }
        if hasattr(record, "event_type"):
            log_entry["event"] = record.event_type
        if hasattr(record, "payload"):
            log_entry["payload"] = record.payload
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

def setup_nexus_logger(log_dir: str = "logs", log_filename: str = "nexus_gaming.log", level: int = logging.INFO) -> logging.Logger:
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, log_filename)

    root_logger = logging.getLogger("nexus")
    root_logger.setLevel(level)

    # Avoid duplicate handlers if called multiple times
    if root_logger.hasHandlers():
        return root_logger

    # 1. Rotating JSON file handler (10MB max, keep 5 archives)
    file_handler = logging.handlers.RotatingFileHandler(
        log_path, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(JsonFormatter())
    file_handler.setLevel(level)
    root_logger.addHandler(file_handler)

    # 2. Console stream handler for standard terminal viewing
    console_handler = logging.StreamHandler()
    console_format = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s")
    console_handler.setFormatter(console_format)
    console_handler.setLevel(level)
    root_logger.addHandler(console_handler)

    root_logger.info(f"Structured JSON logging initialized. Writing logs to {log_path}")
    return root_logger
