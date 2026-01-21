#!/usr/bin/env python3
"""
Script to run RQ worker for processing CTQA analysis jobs
"""

import os
from dotenv import load_dotenv
from rq import Worker, Queue, Connection
import redis

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6380/0")

if __name__ == "__main__":
    redis_conn = redis.from_url(REDIS_URL)
    queue = Queue("ctqa_analysis", connection=redis_conn)
    
    with Connection(redis_conn):
        worker = Worker([queue])
        worker.work()
