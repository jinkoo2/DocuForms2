#!/usr/bin/env python3
"""
Script to run RQ worker for processing CTQA analysis jobs
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from rq import Worker, Queue, Connection
import redis

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6381/0")
PARAM_FILE = os.getenv("PARAM_FILE", "./_data/devices/pfcc_gect_catphan604/param.txt")


def check_config_files():
    """Check if config files exist and print their contents"""
    print("=" * 60)
    print("CTQA Worker Configuration Check")
    print("=" * 60)
    
    config_files = [
        ("Param", PARAM_FILE),
    ]
    
    all_ok = True
    for name, filepath in config_files:
        path = Path(filepath)
        print(f"\n{name}: {filepath}")
        print("-" * 40)
        
        if path.exists():
            print(f"✓ File exists ({path.stat().st_size} bytes)")
            print("\nContents:")
            print("-" * 40)
            try:
                with open(path, 'r') as f:
                    content = f.read()
                    # Print first 50 lines or 2000 chars, whichever is less
                    lines = content.split('\n')[:50]
                    preview = '\n'.join(lines)
                    if len(preview) > 2000:
                        preview = preview[:2000] + "\n... (truncated)"
                    print(preview)
            except Exception as e:
                print(f"✗ Error reading file: {e}")
                all_ok = False
        else:
            print(f"✗ FILE NOT FOUND!")
            print(f"  Expected at: {path.absolute()}")
            all_ok = False
    
    print("\n" + "=" * 60)
    if all_ok:
        print("✓ All config files OK")
    else:
        print("✗ Some config files are missing!")
        print("  Please copy them to the config/ directory")
    print("=" * 60 + "\n")
    
    return all_ok


if __name__ == "__main__":
    # Check config files before starting
    config_ok = check_config_files()
    
    if not config_ok:
        print("WARNING: Starting worker despite missing config files.")
        print("Jobs will fail until config files are provided.\n")
    
    print(f"Connecting to Redis: {REDIS_URL}")
    redis_conn = redis.from_url(REDIS_URL)
    queue = Queue("ctqa_analysis", connection=redis_conn)
    
    print(f"Starting worker for queue: ctqa_analysis")
    with Connection(redis_conn):
        worker = Worker([queue])
        worker.work()
