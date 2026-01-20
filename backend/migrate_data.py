#!/usr/bin/env python3
"""
Migration script to backup and restore DocuForms2 data (MongoDB + binary files).

Usage:
    # Backup to a folder
    python migrate_data.py backup --output-dir /path/to/backup
    
    # Restore from a folder
    python migrate_data.py restore --input-dir /path/to/backup
    
    # Override MongoDB connection (optional)
    python migrate_data.py backup --output-dir /path/to/backup --mongo-uri "mongodb://..." --db-name "mydb"
"""
import subprocess
import argparse
import shutil
from pathlib import Path
import sys
import os
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def get_mongo_config(mongo_uri=None, db_name=None):
    """Get MongoDB configuration from args or environment."""
    if not mongo_uri:
        mongo_uri = os.getenv("MONGO_URI")
    if not db_name:
        db_name = os.getenv("DB_NAME")
    
    if not mongo_uri or not db_name:
        raise ValueError(
            "MongoDB configuration not found. "
            "Set MONGO_URI and DB_NAME in .env file or use --mongo-uri and --db-name arguments."
        )
    
    return mongo_uri, db_name


def get_uploads_dir(uploads_dir=None):
    """Get uploads directory path."""
    if not uploads_dir:
        uploads_dir = Path("_uploads")
    else:
        uploads_dir = Path(uploads_dir)
    
    return uploads_dir.resolve()


def run_command(cmd, description):
    """Run a shell command and handle errors."""
    print(f"\n{description}...")
    print(f"Running: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"ERROR: {description} failed!")
        print(f"Command: {' '.join(cmd)}")
        print(f"Exit code: {e.returncode}")
        if e.stdout:
            print(f"STDOUT: {e.stdout}")
        if e.stderr:
            print(f"STDERR: {e.stderr}")
        return False
    except FileNotFoundError:
        print(f"ERROR: Command not found. Make sure 'mongodump' and 'mongorestore' are installed.")
        print("Install MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools")
        return False


def backup_mongodb(mongo_uri, db_name, output_dir):
    """Backup MongoDB database to a directory."""
    dump_dir = Path(output_dir) / "mongodb_dump"
    dump_dir.mkdir(parents=True, exist_ok=True)
    
    cmd = [
        "mongodump",
        f"--uri={mongo_uri}",
        f"--db={db_name}",
        f"--out={dump_dir}"
    ]
    
    success = run_command(cmd, f"Backing up MongoDB database '{db_name}'")
    if success:
        print(f"✓ MongoDB backup saved to: {dump_dir / db_name}")
    return success


def restore_mongodb(mongo_uri, db_name, input_dir, drop_existing=False):
    """Restore MongoDB database from a directory."""
    dump_dir = Path(input_dir) / "mongodb_dump" / db_name
    
    if not dump_dir.exists():
        # Try to find the database dump directory
        mongodb_dump_dir = Path(input_dir) / "mongodb_dump"
        if mongodb_dump_dir.exists():
            # Find the first subdirectory (should be the database name)
            subdirs = [d for d in mongodb_dump_dir.iterdir() if d.is_dir()]
            if subdirs:
                dump_dir = subdirs[0]
                print(f"Found database dump at: {dump_dir}")
            else:
                print(f"ERROR: No database dump found in {mongodb_dump_dir}")
                return False
        else:
            print(f"ERROR: MongoDB dump directory not found: {dump_dir}")
            return False
    
    cmd = [
        "mongorestore",
        f"--uri={mongo_uri}",
        f"--db={db_name}",
    ]
    
    if drop_existing:
        cmd.append("--drop")
    
    cmd.append(str(dump_dir))
    
    success = run_command(cmd, f"Restoring MongoDB database '{db_name}'")
    if success:
        print(f"✓ MongoDB restored from: {dump_dir}")
    return success


def backup_files(uploads_dir, output_dir):
    """Backup binary files directory."""
    source_dir = get_uploads_dir(uploads_dir)
    dest_dir = Path(output_dir) / "uploads"
    
    if not source_dir.exists():
        print(f"WARNING: Uploads directory not found: {source_dir}")
        print("Creating empty uploads directory in backup...")
        dest_dir.mkdir(parents=True, exist_ok=True)
        return True
    
    print(f"\nBacking up files from {source_dir} to {dest_dir}...")
    
    try:
        # Remove destination if it exists
        if dest_dir.exists():
            shutil.rmtree(dest_dir)
        
        # Copy directory tree
        shutil.copytree(source_dir, dest_dir)
        
        # Count files
        file_count = sum(1 for _ in dest_dir.rglob("*") if _.is_file())
        total_size = sum(f.stat().st_size for f in dest_dir.rglob("*") if f.is_file())
        
        print(f"✓ Files backed up: {file_count} files ({total_size / (1024*1024):.2f} MB)")
        print(f"  Destination: {dest_dir}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to backup files: {e}")
        return False


def restore_files(input_dir, uploads_dir):
    """Restore binary files directory."""
    source_dir = Path(input_dir) / "uploads"
    dest_dir = get_uploads_dir(uploads_dir)
    
    if not source_dir.exists():
        print(f"WARNING: Uploads backup directory not found: {source_dir}")
        print("Skipping file restoration...")
        return True
    
    print(f"\nRestoring files from {source_dir} to {dest_dir}...")
    
    try:
        # Create destination directory if it doesn't exist
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        # If destination has files, ask for confirmation (or use --force flag)
        if any(dest_dir.iterdir()):
            print(f"WARNING: Destination directory {dest_dir} already contains files.")
            print("Existing files will be preserved. New files will be added.")
        
        # Copy files (merge, don't replace)
        for item in source_dir.rglob("*"):
            if item.is_file():
                rel_path = item.relative_to(source_dir)
                dest_file = dest_dir / rel_path
                dest_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, dest_file)
        
        # Count files
        file_count = sum(1 for _ in dest_dir.rglob("*") if _.is_file())
        total_size = sum(f.stat().st_size for f in dest_dir.rglob("*") if f.is_file())
        
        print(f"✓ Files restored: {file_count} files ({total_size / (1024*1024):.2f} MB)")
        print(f"  Destination: {dest_dir}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to restore files: {e}")
        return False


def create_backup_info(output_dir, mongo_uri, db_name, uploads_dir):
    """Create a backup info file with metadata."""
    info_file = Path(output_dir) / "backup_info.txt"
    with open(info_file, "w") as f:
        f.write(f"DocuForms2 Backup Information\n")
        f.write(f"{'='*50}\n\n")
        f.write(f"Backup Date: {datetime.now().isoformat()}\n")
        f.write(f"Database Name: {db_name}\n")
        f.write(f"MongoDB URI: {mongo_uri}\n")
        f.write(f"Uploads Directory: {uploads_dir}\n")
        f.write(f"\nContents:\n")
        f.write(f"  - mongodb_dump/: MongoDB database dump\n")
        f.write(f"  - uploads/: Binary files from _uploads directory\n")
        f.write(f"  - backup_info.txt: This file\n")
    print(f"✓ Backup info saved to: {info_file}")


def backup_command(args):
    """Handle backup command."""
    output_dir = Path(args.output_dir).resolve()
    
    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"BACKUP: DocuForms2 Data")
    print(f"{'='*60}")
    print(f"Output directory: {output_dir}")
    
    # Get configuration
    try:
        mongo_uri, db_name = get_mongo_config(args.mongo_uri, args.db_name)
        uploads_dir = get_uploads_dir(args.uploads_dir)
    except ValueError as e:
        print(f"ERROR: {e}")
        return 1
    
    print(f"MongoDB URI: {mongo_uri}")
    print(f"Database: {db_name}")
    print(f"Uploads: {uploads_dir}")
    
    # Backup MongoDB
    if not backup_mongodb(mongo_uri, db_name, output_dir):
        print("\n✗ Backup failed at MongoDB step")
        return 1
    
    # Backup files
    if not backup_files(uploads_dir, output_dir):
        print("\n✗ Backup failed at files step")
        return 1
    
    # Create backup info
    create_backup_info(output_dir, mongo_uri, db_name, str(uploads_dir))
    
    print(f"\n{'='*60}")
    print(f"✓ BACKUP COMPLETE")
    print(f"{'='*60}")
    print(f"Backup location: {output_dir}")
    print(f"\nTo restore, run:")
    print(f"  python migrate_data.py restore --input-dir {output_dir}")
    
    return 0


def restore_command(args):
    """Handle restore command."""
    input_dir = Path(args.input_dir).resolve()
    
    if not input_dir.exists():
        print(f"ERROR: Backup directory not found: {input_dir}")
        return 1
    
    print(f"\n{'='*60}")
    print(f"RESTORE: DocuForms2 Data")
    print(f"{'='*60}")
    print(f"Input directory: {input_dir}")
    
    # Get configuration
    try:
        mongo_uri, db_name = get_mongo_config(args.mongo_uri, args.db_name)
        uploads_dir = get_uploads_dir(args.uploads_dir)
    except ValueError as e:
        print(f"ERROR: {e}")
        return 1
    
    print(f"MongoDB URI: {mongo_uri}")
    print(f"Database: {db_name}")
    print(f"Uploads: {uploads_dir}")
    
    if args.drop_existing:
        print("\nWARNING: --drop-existing is set. Existing database will be dropped!")
        response = input("Continue? (yes/no): ")
        if response.lower() != "yes":
            print("Restore cancelled.")
            return 1
    
    # Restore MongoDB
    if not restore_mongodb(mongo_uri, db_name, input_dir, args.drop_existing):
        print("\n✗ Restore failed at MongoDB step")
        return 1
    
    # Restore files
    if not restore_files(input_dir, uploads_dir):
        print("\n✗ Restore failed at files step")
        return 1
    
    print(f"\n{'='*60}")
    print(f"✓ RESTORE COMPLETE")
    print(f"{'='*60}")
    
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Backup and restore DocuForms2 data (MongoDB + binary files)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Backup to a folder
  python migrate_data.py backup --output-dir ./backup_20240101
  
  # Restore from a folder
  python migrate_data.py restore --input-dir ./backup_20240101
  
  # Override MongoDB connection
  python migrate_data.py backup --output-dir ./backup \\
    --mongo-uri "mongodb://user:pass@host:27017/?authSource=admin" \\
    --db-name "docuforms2"
  
  # Restore with drop existing database
  python migrate_data.py restore --input-dir ./backup --drop-existing
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")
    
    # Backup command
    backup_parser = subparsers.add_parser("backup", help="Backup MongoDB and files to a directory")
    backup_parser.add_argument("--output-dir", required=True, help="Output directory for backup")
    backup_parser.add_argument("--mongo-uri", help="MongoDB URI (overrides .env)")
    backup_parser.add_argument("--db-name", help="Database name (overrides .env)")
    backup_parser.add_argument("--uploads-dir", help="Uploads directory path (default: ./_uploads)")
    
    # Restore command
    restore_parser = subparsers.add_parser("restore", help="Restore MongoDB and files from a directory")
    restore_parser.add_argument("--input-dir", required=True, help="Input directory containing backup")
    restore_parser.add_argument("--mongo-uri", help="MongoDB URI (overrides .env)")
    restore_parser.add_argument("--db-name", help="Database name (overrides .env)")
    restore_parser.add_argument("--uploads-dir", help="Uploads directory path (default: ./_uploads)")
    restore_parser.add_argument("--drop-existing", action="store_true", 
                                help="Drop existing database before restore (WARNING: data loss)")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    if args.command == "backup":
        return backup_command(args)
    elif args.command == "restore":
        return restore_command(args)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
