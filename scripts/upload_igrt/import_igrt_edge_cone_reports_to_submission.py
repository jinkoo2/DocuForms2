#!/usr/bin/env python3
"""
Script to find all report.html files under Edge_Cone/Data directories,
extract values, and create form submissions.
"""

import os
import re
import json
import requests
import zipfile
import tempfile
import sys
import base64
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup
from typing import Dict, List, Optional, Tuple

# Configuration
BACKEND_URL = "http://localhost:8001"
FORM_ID = "sb_edge_cone_wl"


def round_gantry(g: int) -> int:
    """Round gantry angle to nearest of [0, 90, 180, 270], treating 360 as 0."""
    if g > 345:
        g = 0
    targets = [0, 90, 180, 270]
    return min(targets, key=lambda x: min(abs(g - x), abs(g - x + 360), abs(g - x - 360)))


def round_table(t: int) -> int:
    """Round table angle to nearest of [0, 50, 90, 270, 310, 350, 360]."""
    if t > 345:
        t = 0
    targets = [0, 50, 90, 270, 310, 350, 360]
    return min(targets, key=lambda x: min(abs(t - x), abs(t - x + 360), abs(t - x - 360)))


def parse_float(value: str) -> Optional[float]:
    """Parse a string to float, handling empty strings and None."""
    if not value or value.strip() == "":
        return None
    try:
        return float(value.strip())
    except (ValueError, AttributeError):
        return None


def parse_date_time(date_time_str: str) -> Optional[datetime]:
    """Convert date/time string to datetime object."""
    date_time_str = date_time_str.strip()
    
    if not date_time_str:
        return None
    
    # Handle format like "17/05/17 17:40:07" (DD/MM/YY HH:MM:SS)
    try:
        dt = datetime.strptime(date_time_str, '%d/%m/%y %H:%M:%S')
        return dt
    except ValueError:
        pass
    
    # Try without seconds
    try:
        dt = datetime.strptime(date_time_str, '%d/%m/%y %H:%M')
        return dt
    except ValueError:
        pass
    
    # Handle ISO format
    if 'T' in date_time_str:
        try:
            dt = datetime.fromisoformat(date_time_str.replace('Z', '+00:00'))
            return dt.replace(tzinfo=None)
        except ValueError:
            pass
    
    return None


def parse_measurement(text: str) -> Optional[Tuple[float, float, float]]:
    """Parse measurement text like 'BB from FC = (-0.4,-0.3, d=0.5)' into (x_offset, y_offset, d)."""
    # Match pattern: (x,y, d=value) or (x, y, d=value)
    match = re.search(r'\(([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*d=([\d.]+)\)', text)
    if match:
        try:
            x_offset = float(match.group(1))
            y_offset = float(match.group(2))
            d = float(match.group(3))
            return (x_offset, y_offset, d)
        except ValueError:
            pass
    return None


def parse_angle_combination(text: str) -> Optional[Tuple[int, int, str]]:
    """Parse angle combination like 'G=180, T=88, C=0 [MV]' into (gantry, table, energy)."""
    # Match pattern: G=number, T=number, C=number [MV or kV]
    match = re.search(r'G=(\d+)\s*,\s*T=(\d+)\s*,\s*C=\d+\s*\[(MV|kV)\]', text, re.IGNORECASE)
    if match:
        try:
            g = int(match.group(1))
            t = int(match.group(2))
            e = match.group(3).upper()
            return (g, t, e)
        except (ValueError, IndexError):
            pass
    return None


def parse_report_html(report_path: Path) -> Tuple[Dict, bool]:
    """Parse a report.html file and extract all values.
    
    Returns:
        Tuple of (values dict, has_pass bool) where has_pass indicates if report says 'pass' for any item.
    """
    with open(report_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Check if report has "Pass" - check overall Result field and panel labels
    has_pass = False
    
    # Check overall Result field
    result_span = soup.find('span', string=re.compile('Result', re.I))
    if result_span:
        result_input = result_span.find_next('input')
        if result_input:
            result_value = result_input.get('value', '').strip().lower()
            if result_value == 'pass':
                has_pass = True
    
    # Extract performed_at and performed_by
    performed_at = None
    performed_by = ""
    
    # Find Date/Time input
    date_time_span = soup.find('span', string=re.compile('Date/Time', re.I))
    if date_time_span:
        date_time_input = date_time_span.find_next('input')
        if date_time_input:
            date_time_value = date_time_input.get('value', '')
            performed_at = parse_date_time(date_time_value)
    
    # Find Operator input
    operator_span = soup.find('span', string=re.compile('Operator', re.I))
    if operator_span:
        operator_input = operator_span.find_next('input')
        if operator_input:
            performed_by = operator_input.get('value', '').strip()
    
    # If not found in inputs, try to extract from path
    if not performed_at:
        # Extract from path like .../Edge_Cone/Data/17-05-17_17-40-07/report.html
        path_parts = report_path.parts
        for part in path_parts:
            # Try to parse format like "17-05-17_17-40-07"
            match = re.match(r'(\d{2})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})', part)
            if match:
                try:
                    # Convert YY-MM-DD to datetime
                    year = 2000 + int(match.group(3))
                    month = int(match.group(2))
                    day = int(match.group(1))
                    hour = int(match.group(4))
                    minute = int(match.group(5))
                    second = int(match.group(6))
                    performed_at = datetime(year, month, day, hour, minute, second)
                    break
                except (ValueError, IndexError):
                    pass
    
    values = {}
    
    # Only add performed_at if we have a valid datetime
    if performed_at:
        values["performed_at"] = performed_at.isoformat()
    
    if performed_by:
        values["performed_by"] = performed_by
    
    # Extract angle panels (check both panel-primary and panel-danger classes)
    panels = soup.find_all('div', class_=re.compile('panel panel-'))
    
    for panel in panels:
        # Extract angle combination from panel heading
        heading = panel.find('h4', class_='panel-title')
        if not heading:
            continue
        
        heading_text = heading.get_text(strip=True)
        
        # Check if this panel has "Pass" label
        pass_label = heading.find('span', class_=re.compile('label'))
        if pass_label:
            label_text = pass_label.get_text(strip=True).lower()
            if label_text == 'pass':
                has_pass = True
        
        angle_combo = parse_angle_combination(heading_text)
        if not angle_combo:
            continue
        
        g_raw, t_raw, energy = angle_combo
        g = round_gantry(g_raw)
        t = round_table(t_raw)
        
        # Build field prefix: g{g}_t{t}_{energy.lower()}
        field_prefix = f"g{g}_t{t}_{energy.lower()}"
        
        # Extract measurements from panel body
        panel_body = panel.find('div', class_='panel-body')
        if not panel_body:
            continue
        
        # Extract image from panel body
        img_tag = panel_body.find('img')
        if img_tag:
            img_src = img_tag.get('src', '')
            if img_src:
                # Resolve image path relative to report.html
                # Image src is like ".\RI.1.2.246.352.62.1.4781156647320308083.8567851581009826964.dcm_out\result.png"
                # Remove leading ".\" and normalize path
                img_path_str = img_src.lstrip('.\\').replace('\\', '/')
                img_path = report_path.parent / img_path_str
                
                # Try to read and convert image to base64
                if img_path.exists() and img_path.is_file():
                    try:
                        with open(img_path, 'rb') as img_file:
                            img_data = img_file.read()
                            img_base64 = base64.b64encode(img_data).decode('utf-8')
                            # Determine image MIME type from extension
                            img_ext = img_path.suffix.lower()
                            mime_type = 'image/png' if img_ext == '.png' else 'image/jpeg' if img_ext in ['.jpg', '.jpeg'] else 'image/png'
                            # Store as data URL
                            img_data_url = f"data:{mime_type};base64,{img_base64}"
                            # Store with key matching the img id in the form (img_g{g}_t{t}_{energy.lower()})
                            img_key = f"img_{field_prefix}"
                            values[img_key] = img_data_url
                    except Exception as e:
                        print(f"  Warning: Could not read image {img_path}: {e}")
        
        # Find all measurement spans
        spans = panel_body.find_all('span')
        for span in spans:
            text = span.get_text(strip=True)
            
            # Parse measurement
            measurement = parse_measurement(text)
            if not measurement:
                continue
            
            x_offset, y_offset, d = measurement
            
            # Determine measurement type from text
            if 'BB from FC' in text:
                # Only for MV
                if energy == 'MV':
                    values[f"{field_prefix}_bb_fc_x"] = str(x_offset)
                    values[f"{field_prefix}_bb_fc_y"] = str(y_offset)
                    values[f"{field_prefix}_bb_fc_d"] = str(d)
            elif 'BB from IC' in text:
                # For both MV and kV
                values[f"{field_prefix}_bb_ic_x"] = str(x_offset)
                values[f"{field_prefix}_bb_ic_y"] = str(y_offset)
                values[f"{field_prefix}_bb_ic_d"] = str(d)
            elif 'FC from IC' in text:
                # Only for MV
                if energy == 'MV':
                    values[f"{field_prefix}_fc_ic_x"] = str(x_offset)
                    values[f"{field_prefix}_fc_ic_y"] = str(y_offset)
                    values[f"{field_prefix}_fc_ic_d"] = str(d)
    
    return values, has_pass


def build_metadata(values: Dict, has_pass: bool = False) -> Dict:
    """Build metadata dictionary with scripts and ranges.
    
    Args:
        values: Dictionary of field values
        has_pass: If True, set result to "PASS" for all _d fields
    """
    metadata = {}
    
    # Add metadata for each field
    for field_id, field_value in values.items():
        if field_id.endswith("_d"):
            # d fields have data-pass-range="0:1.0"
            result_value = "PASS" if has_pass else ""
            metadata[field_id] = {
                "passRange": "0:1.0",
                "result": result_value
            }
        else:
            # Regular fields (x_offset, y_offset, performed_at, performed_by)
            metadata[field_id] = {"result": ""}
    
    return metadata


def calculate_overall_result(metadata: Dict) -> str:
    """Calculate overall form result based on field results."""
    results = []
    for field_meta in metadata.values():
        result = field_meta.get("result", "")
        if result:
            results.append(result.upper())
    
    if not results:
        return ""
    
    # FAIL if any field is FAIL
    if any(r == "FAIL" for r in results):
        return "FAIL"
    # WARNING if any field is WARNING
    elif any(r == "WARNING" for r in results):
        return "WARNING"
    # PASS if all fields are PASS
    elif all(r == "PASS" for r in results):
        return "PASS"
    
    return ""


def find_report_files(base_dir: Path) -> List[Path]:
    """Find all report.html files under Edge_Cone/Data directories."""
    report_files = []
    for root, dirs, files in os.walk(base_dir):
        if 'Edge_Cone' in root and 'Data' in root:
            for file in files:
                if file == 'report.html':
                    report_path = Path(root) / file
                    report_files.append(report_path)
    return report_files


def get_form_html() -> str:
    """Fetch the form HTML from the API."""
    try:
        response = requests.get(f"{BACKEND_URL}/api/forms/{FORM_ID}")
        if response.status_code == 200:
            form_data = response.json()
            return form_data.get("html", "")
    except Exception as e:
        print(f"Warning: Could not fetch form HTML: {e}")
    return ""


def find_dcm_files(case_dir: Path) -> List[Path]:
    """Find all .dcm files in a case directory (recursively)."""
    dcm_files = []
    for file_path in case_dir.rglob("*.dcm"):
        if file_path.is_file():
            dcm_files.append(file_path)
    return sorted(dcm_files)


def create_dcm_zip(case_dir: Path, output_zip_path: Path) -> bool:
    """Create a zip file containing all .dcm files from the case directory."""
    dcm_files = find_dcm_files(case_dir)
    
    if not dcm_files:
        print(f"  No .dcm files found in {case_dir}")
        return False
    
    total_files = len(dcm_files)
    print(f"  Found {total_files} .dcm file(s)")
    print(f"  Creating zip file...", end='', flush=True)
    
    try:
        total_size = 0
        processed_size = 0
        
        # Calculate total size first
        for dcm_file in dcm_files:
            total_size += dcm_file.stat().st_size
        
        with zipfile.ZipFile(output_zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for idx, dcm_file in enumerate(dcm_files, 1):
                # Add file to zip with relative path from case_dir
                arcname = dcm_file.relative_to(case_dir)
                zipf.write(dcm_file, arcname)
                
                # Update progress
                processed_size += dcm_file.stat().st_size
                percent = (processed_size / total_size * 100) if total_size > 0 else 0
                file_progress = (idx / total_files * 100)
                
                # Print progress (overwrite same line)
                print(f"\r  Zipping: {idx}/{total_files} files ({file_progress:.1f}%), {processed_size / (1024*1024):.1f}/{total_size / (1024*1024):.1f} MB ({percent:.1f}%)", end='', flush=True)
        
        zip_size = output_zip_path.stat().st_size
        print(f"\r  ✓ Created zip file: {output_zip_path.name} ({zip_size / (1024*1024):.2f} MB)")
        return True
    except Exception as e:
        print(f"\r  ✗ Error creating zip file: {e}")
        return False


def upload_file_to_backend(file_path: Path, backend_url: str, original_name: Optional[str] = None) -> Optional[Dict[str, str]]:
    """Upload a file to the backend and return attachment info."""
    try:
        filename = original_name if original_name else file_path.name
        file_size = file_path.stat().st_size
        
        print(f"  Uploading {filename} ({file_size / (1024*1024):.2f} MB)...", end='', flush=True)
        
        # Custom file-like object to track upload progress
        class ProgressFile:
            def __init__(self, file_obj, total_size):
                self.file_obj = file_obj
                self.total_size = total_size
                self.uploaded = 0
                
            def read(self, size=-1):
                chunk = self.file_obj.read(size)
                if chunk:
                    self.uploaded += len(chunk)
                    percent = (self.uploaded / self.total_size * 100) if self.total_size > 0 else 0
                    print(f"\r  Uploading: {self.uploaded / (1024*1024):.1f}/{self.total_size / (1024*1024):.1f} MB ({percent:.1f}%)", end='', flush=True)
                return chunk
                
            def __getattr__(self, name):
                return getattr(self.file_obj, name)
        
        with open(file_path, 'rb') as f:
            progress_file = ProgressFile(f, file_size)
            files = {'file': (filename, progress_file, 'application/zip')}
            response = requests.post(
                f"{backend_url}/api/upload",
                files=files,
                timeout=300  # 5 minute timeout for large files
            )
        
        print()  # New line after progress
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Upload complete")
            return {
                "url": data.get("url", ""),
                "originalName": filename
            }
        else:
            print(f"  ✗ Failed to upload file: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"\n  ✗ Error uploading file: {e}")
        return None


def submit_form(values: Dict, metadata: Dict, result: str, form_html: str, attachments: Optional[List[Dict[str, str]]] = None) -> bool:
    """Submit a form submission to the API."""
    submission = {
        "values": values,
        "metadata": metadata,
        "result": result,
        "comments": "",
        "submissionHtml": "",
        "attachments": attachments if attachments else None
    }
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/forms/{FORM_ID}/submit",
            json=submission,
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 200:
            performed_at_str = values.get('performed_at', 'unknown')
            print(f"✓ Submitted: {performed_at_str}")
            return True
        else:
            performed_at_str = values.get('performed_at', 'unknown')
            print(f"✗ Failed to submit {performed_at_str}: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        performed_at_str = values.get('performed_at', 'unknown')
        print(f"✗ Error submitting {performed_at_str}: {e}")
        return False


def load_config_from_json(config_path: Path) -> Dict:
    """Load configuration from input.edge_cone.json file."""
    if not config_path.exists():
        return {}
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        return config
    except Exception as e:
        print(f"Warning: Could not load config from {config_path}: {e}")
        return {}


def main():
    """Main function to process all report files."""
    import argparse
    
    global FORM_ID, BACKEND_URL
    
    # Try to load config from input.edge_cone.json (in the same directory as the script)
    script_dir = Path(__file__).parent
    config_path = script_dir / 'input.edge_cone.json'
    config = load_config_from_json(config_path)
    
    parser = argparse.ArgumentParser(description='Import Edge Cone report.html files as form submissions')
    parser.add_argument('base_dir', type=str, nargs='?', default=config.get('base_dir'), help='Base directory to search for Edge_Cone/Data/report.html files (can also be set in input.edge_cone.json)')
    parser.add_argument('--form-id', type=str, default=config.get('form_id', FORM_ID), help=f'Form ID to submit to (default: from input.edge_cone.json or {FORM_ID})')
    parser.add_argument('--backend-url', type=str, default=config.get('backend_url', BACKEND_URL), help=f'Backend URL (default: from input.edge_cone.json or {BACKEND_URL})')
    parser.add_argument('--dry-run', action='store_true', help='Parse files but do not submit (can also be set in input.edge_cone.json)')
    parser.add_argument('--first-n-cases-to-upload', type=int, default=config.get('first_n_cases_to_upload'), help='Only process the first N cases (default: from input.edge_cone.json or process all)')
    
    args = parser.parse_args()
    
    # Command-line arguments override JSON config
    FORM_ID = args.form_id
    BACKEND_URL = args.backend_url
    
    # Handle dry_run: command-line flag overrides JSON config
    dry_run = args.dry_run if args.dry_run else config.get('dry_run', False)
    
    # Validate base_dir
    if not args.base_dir:
        print("Error: base_dir is required. Provide it as a command-line argument or in input.edge_cone.json")
        parser.print_help()
        return
    
    base_dir = Path(args.base_dir)
    if not base_dir.exists():
        print(f"Error: Directory {base_dir} does not exist")
        return
    
    # Find all report.html files
    report_files = find_report_files(base_dir)
    total_files = len(report_files)
    print(f"Found {total_files} report.html file(s)")
    
    if total_files == 0:
        print("No report.html files found. Exiting.")
        return
    
    # Limit to first N cases if specified (command-line overrides JSON)
    first_n_cases = args.first_n_cases_to_upload if args.first_n_cases_to_upload is not None else config.get('first_n_cases_to_upload')
    if first_n_cases is not None:
        if first_n_cases > 0:
            report_files = report_files[:first_n_cases]
            print(f"Processing first {len(report_files)} case(s) (out of {total_files} total)")
        else:
            print("Error: first_n_cases_to_upload must be a positive integer")
            return
    else:
        print(f"Processing all {len(report_files)} case(s)")
    
    # Get form HTML once
    form_html = get_form_html()
    
    success_count = 0
    error_count = 0
    
    for report_file in report_files:
        attachments = None
        temp_zip_path = None
        
        try:
            print(f"\nProcessing: {report_file}")
            
            # Find case directory (parent of report.html)
            case_dir = report_file.parent
            
            # Create zip file of all .dcm files
            if not dry_run:
                # Create zip file with name input_dcm.zip in temp directory
                temp_zip_path = Path(tempfile.gettempdir()) / f"input_dcm_{case_dir.name}.zip"
                
                if create_dcm_zip(case_dir, temp_zip_path):
                    # Upload zip file to backend with original name input_dcm.zip
                    attachment_info = upload_file_to_backend(temp_zip_path, BACKEND_URL, original_name='input_dcm.zip')
                    if attachment_info:
                        attachments = [attachment_info]
                        print(f"  ✓ Uploaded attachment: {attachment_info['originalName']}")
                    else:
                        print(f"  ⚠ Failed to upload attachment, continuing without it")
                else:
                    print(f"  ⚠ No .dcm files found or failed to create zip, continuing without attachment")
            
            # Parse report.html
            values, has_pass = parse_report_html(report_file)
            
            # Build metadata
            metadata = build_metadata(values, has_pass=has_pass)
            
            # Calculate overall result
            result = calculate_overall_result(metadata)
            
            # Print summary
            performed_at_str = values.get('performed_at', 'N/A')
            print(f"  Performed At: {performed_at_str}")
            print(f"  Performed By: {values.get('performed_by', 'N/A')}")
            print(f"  Fields extracted: {len([k for k in values.keys() if not k in ['performed_at', 'performed_by']])}")
            print(f"  Overall Result: {result}")
            
            if dry_run:
                print("  [DRY RUN] Would submit:")
                print(f"    Values: {json.dumps(values, indent=2)}")
                print(f"    Result: {result}")
                if attachments:
                    print(f"    Attachments: {attachments}")
            else:
                # Submit to API
                if submit_form(values, metadata, result, form_html, attachments):
                    success_count += 1
                else:
                    error_count += 1
        
        except Exception as e:
            print(f"✗ Error processing {report_file}: {e}")
            import traceback
            traceback.print_exc()
            error_count += 1
        
        finally:
            # Clean up temporary zip file
            if temp_zip_path and temp_zip_path.exists():
                try:
                    temp_zip_path.unlink()
                except Exception as e:
                    print(f"  Warning: Could not delete temporary zip file: {e}")
    
    print(f"\n{'='*60}")
    print(f"Summary: {success_count} succeeded, {error_count} failed")
    if dry_run:
        print("(DRY RUN - no submissions were made)")


if __name__ == "__main__":
    main()
