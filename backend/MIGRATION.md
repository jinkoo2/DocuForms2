# Data Migration Guide

This guide explains how to backup and restore DocuForms2 data (MongoDB + binary files) using the `migrate_data.py` script.

## Prerequisites

1. **MongoDB Database Tools** must be installed:
   - `mongodump` - for backing up MongoDB
   - `mongorestore` - for restoring MongoDB
   - Download from: https://www.mongodb.com/try/download/database-tools

2. **Python dependencies** (already in `requirements.txt`):
   - `python-dotenv` - for reading `.env` file

3. **Backend `.env` file** should contain:
   ```bash
   MONGO_URI="mongodb://root:example@localhost:27017/?authSource=admin"
   DB_NAME="docuforms2"
   ```

## Usage

### Backup Data

Backup MongoDB database and binary files to a directory:

```bash
cd backend
python migrate_data.py backup --output-dir /path/to/backup_folder
```

**Example:**
```bash
python migrate_data.py backup --output-dir ./backup_20240115
```

**With custom MongoDB connection:**
```bash
python migrate_data.py backup --output-dir ./backup \
  --mongo-uri "mongodb://user:pass@host:27017/?authSource=admin" \
  --db-name "docuforms2"
```

**What gets backed up:**
- MongoDB database dump → `backup_folder/mongodb_dump/{db_name}/`
- Binary files from `_uploads/` → `backup_folder/uploads/`
- Backup metadata → `backup_folder/backup_info.txt`

### Restore Data

Restore MongoDB database and binary files from a backup directory:

```bash
cd backend
python migrate_data.py restore --input-dir /path/to/backup_folder
```

**Example:**
```bash
python migrate_data.py restore --input-dir ./backup_20240115
```

**With custom MongoDB connection:**
```bash
python migrate_data.py restore --input-dir ./backup \
  --mongo-uri "mongodb://user:pass@host:27017/?authSource=admin" \
  --db-name "docuforms2"
```

**Drop existing database before restore:**
```bash
python migrate_data.py restore --input-dir ./backup --drop-existing
```

⚠️ **WARNING**: `--drop-existing` will delete the existing database before restoring. Use with caution!

## Migration Workflow

### Step 1: Backup on Source Server

```bash
cd /path/to/DocuForms2/backend
python migrate_data.py backup --output-dir ./migration_backup
```

This creates a folder `migration_backup/` containing:
```
migration_backup/
├── mongodb_dump/
│   └── docuforms2/
│       ├── forms.bson
│       ├── forms.metadata.json
│       ├── submissions.bson
│       └── submissions.metadata.json
├── uploads/
│   └── (all binary files from _uploads/)
└── backup_info.txt
```

### Step 2: Transfer Backup Folder

Manually transfer the `migration_backup/` folder to the destination server using:
- `scp -r migration_backup user@dest-server:/path/to/`
- `rsync -avz migration_backup/ user@dest-server:/path/to/migration_backup/`
- USB drive, network share, etc.

### Step 3: Restore on Destination Server

```bash
cd /path/to/DocuForms2/backend
python migrate_data.py restore --input-dir ./migration_backup
```

## Command-Line Options

### Backup Options

- `--output-dir` (required): Directory where backup will be saved
- `--mongo-uri`: MongoDB connection URI (overrides `.env` file)
- `--db-name`: Database name (overrides `.env` file)
- `--uploads-dir`: Path to `_uploads` directory (default: `./_uploads`)

### Restore Options

- `--input-dir` (required): Directory containing the backup
- `--mongo-uri`: MongoDB connection URI (overrides `.env` file)
- `--db-name`: Database name (overrides `.env` file)
- `--uploads-dir`: Path to `_uploads` directory (default: `./_uploads`)
- `--drop-existing`: Drop existing database before restore (WARNING: data loss)

## Troubleshooting

### Error: "Command not found: mongodump"

**Solution**: Install MongoDB Database Tools:
- Linux: `sudo apt-get install mongodb-database-tools` (or download from MongoDB website)
- macOS: `brew install mongodb-database-tools`
- Windows: Download and install from MongoDB website

### Error: "MongoDB configuration not found"

**Solution**: Either:
1. Create/update `backend/.env` file with `MONGO_URI` and `DB_NAME`
2. Or use `--mongo-uri` and `--db-name` command-line arguments

### Error: "Connection refused" during restore

**Solution**: 
- Ensure MongoDB is running on the destination server
- Check that `MONGO_URI` points to the correct server
- Verify network connectivity and firewall rules

### Files not restored correctly

**Solution**:
- Ensure destination `_uploads` directory has write permissions
- Check that source backup contains `uploads/` directory
- Verify disk space on destination server

## Verification

After restore, verify the migration:

1. **Check MongoDB document counts:**
   ```bash
   mongosh "mongodb://..." --eval "db.forms.countDocuments()"
   mongosh "mongodb://..." --eval "db.submissions.countDocuments()"
   ```

2. **Check file count:**
   ```bash
   find backend/_uploads -type f | wc -l
   ```

3. **Test file URLs:**
   - Access a few submission attachments via the web interface
   - Verify files download correctly

## Notes

- The backup preserves MongoDB indexes automatically
- Binary files are copied as-is (preserves permissions and timestamps)
- The script creates a `backup_info.txt` file with metadata about the backup
- During restore, existing files in `_uploads` are preserved (merged, not replaced)
- Use `--drop-existing` only if you want to completely replace the database
