#!/usr/bin/env python3
"""
Script to find all report.html files under cases directories,
extract values, and create form submissions.
"""

import os
import re
import json
import requests
import zipfile
import tempfile
import sys
from datetime import datetime
from pathlib import Path
from bs4 import BeautifulSoup
from typing import Dict, List, Optional, Tuple

# Configuration
BACKEND_URL = "http://localhost:8001"
FORM_ID = "ctqa_catphan_604"

# Field mappings: report.html material name -> form field ID prefix
HU_MATERIALS = {
    "Air": "hu_air",
    "PMP": "hu_pmp",
    "Bone50": "hu_bone50",
    "LDPE": "hu_ldpe",
    "Polystyrene": "hu_polystyrene",
    "Acrylic": "hu_acrylic",
    "Bone20": "hu_bone20",
    "Delrin": "hu_delrin",
    "Teflon": "hu_teflon",
}

GEO_IN_MEASUREMENTS = {
    "pt1->pt2": "geo_in_pt1_pt2",
    "pt2->pt3": "geo_in_pt2_pt3",
    "pt3->pt4": "geo_in_pt3_pt4",
    "pt4->pt1": "geo_in_pt4_pt1",
}

GEO_OUT_MEASUREMENTS = {
    "pt5->pt6": "geo_out_pt5_pt6",
    "pt6->pt5": "geo_out_pt6_pt5",
}

UNIFORMITY_POSITIONS = {
    "CTR": "uniformity_hu_ctr",
    "ANT": "uniformity_hu_ant",
    "RT": "uniformity_hu_rt",
    "PST": "uniformity_hu_pst",
    "LT": "uniformity_hu_lt",
}

# Range configurations for error fields
ERROR_RANGES = {
    # HU Consistency
    "hu_air_error": {"pass": "-40:40", "warning": "-60:60"},
    "hu_pmp_error": {"pass": "-40:40", "warning": "-60:60"},
    "hu_bone50_error": {"pass": "-40:40", "warning": "-60:60"},
    "hu_ldpe_error": {"pass": "-40:40", "warning": "-60:60"},
    "hu_polystyrene_error": {"pass": "-40:40", "warning": "-60:60"},
    "hu_acrylic_error": {"pass": "-40:40", "warning": "-60:60"},
    "hu_bone20_error": {"pass": "-40:40", "warning": "-60:60"},
    "hu_delrin_error": {"pass": "-40:40", "warning": "-60:60"},
    "hu_teflon_error": {"pass": "-40:40", "warning": "-60:60"},
    # Geometric Accuracy In-plane
    "geo_in_pt1_pt2_error": {"pass": "-1:1", "warning": "-1.5:1.5"},
    "geo_in_pt2_pt3_error": {"pass": "-1:1", "warning": "-1.5:1.5"},
    "geo_in_pt3_pt4_error": {"pass": "-1:1", "warning": "-1.5:1.5"},
    "geo_in_pt4_pt1_error": {"pass": "-1:1", "warning": "-1.5:1.5"},
    # Geometric Accuracy Out-of-plane
    "geo_out_pt5_pt6_error": {"pass": "-1.5:1.5", "warning": "-2:2"},
    "geo_out_pt6_pt5_error": {"pass": "-1.5:1.5", "warning": "-2:2"},
    # Uniformity HU
    "uniformity_hu_ctr_error": {"pass": "-20:20", "warning": "-30:30"},
    "uniformity_hu_ant_error": {"pass": "-20:20", "warning": "-30:30"},
    "uniformity_hu_rt_error": {"pass": "-20:20", "warning": "-30:30"},
    "uniformity_hu_pst_error": {"pass": "-20:20", "warning": "-30:30"},
    "uniformity_hu_lt_error": {"pass": "-20:20", "warning": "-30:30"},
    # Uniformity Integral
    "uniformity_integral_error": {"pass": "-0.2:0.2"},
    # Low Contrast STD
    "low_contrast_std_error": {"pass": "-10:10"},
    # High Contrast RMTF (15 rows for LP/CM 1-15)
    "high_contrast_rmtf_1_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_2_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_3_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_4_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_5_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_6_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_7_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_8_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_9_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_10_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_11_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_12_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_13_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_14_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf_15_error": {"pass": "-0.5:0.5"},
    "high_contrast_rmtf50_error": {"pass": "-2.0:2.0"},
}


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
    
    # Handle datetime-local format: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss"
    if 'T' in date_time_str:
        # Parse datetime-local format (e.g., "2025-12-18T07:00" or "2025-12-18T07:00:10")
        try:
            # Try parsing with seconds first
            dt = datetime.fromisoformat(date_time_str.replace('Z', '+00:00'))
            return dt.replace(tzinfo=None)  # Remove timezone for UTC storage
        except ValueError:
            # If parsing fails, try without seconds
            try:
                dt = datetime.strptime(date_time_str, '%Y-%m-%dT%H:%M')
                return dt
            except ValueError:
                pass
    
    # Handle legacy formats like "20251218 / 070010" or "20251218_070010"
    # Remove spaces and slashes
    date_time_str = re.sub(r'[\s/]+', '_', date_time_str)
    # Try to parse YYYYMMDD_HHMMSS format
    if len(date_time_str) == 15 and date_time_str[8] == '_':
        try:
            dt = datetime.strptime(date_time_str, '%Y%m%d_%H%M%S')
            return dt
        except ValueError:
            pass
    
    # Return None if parsing fails
    return None


def extract_table_data(soup: BeautifulSoup, section_name: str) -> List[Dict[str, str]]:
    """Extract data from a table section."""
    rows = []
    # Find the section div
    sections = soup.find_all('div', class_='section')
    for section in sections:
        section_head = section.find('div', class_='section_head')
        if not section_head or section_name.lower() not in section_head.get_text().lower():
            continue
        
        table = section.find('table')
        if not table:
            continue
        
        # Find header row to determine column indices
        header_row = table.find('tr')
        if not header_row:
            continue
        
        headers = [th.get_text().strip().lower() for th in header_row.find_all(['th', 'td'])]
        
        # Determine column indices
        name_idx = 0  # First column is usually the name
        value_idx = None
        ref_idx = None
        diff_idx = None
        
        for i, header in enumerate(headers):
            if 'hu' in header or 'distance' in header or 'value' in header:
                value_idx = i
            elif 'ref' in header:
                ref_idx = i
            elif 'diff' in header or 'error' in header:
                diff_idx = i
        
        # If indices not found, assume standard order: name, value, ref, diff
        if value_idx is None:
            value_idx = 1
        if ref_idx is None:
            ref_idx = 2
        if diff_idx is None:
            diff_idx = 3
        
        # Extract data rows
        data_rows = table.find_all('tr')[1:]  # Skip header
        for row in data_rows:
            cells = row.find_all(['td', 'th'])
            if len(cells) < max(value_idx, ref_idx, diff_idx) + 1:
                continue
            
            name = cells[name_idx].get_text().strip()
            value = cells[value_idx].get_text().strip() if value_idx < len(cells) else ""
            ref = cells[ref_idx].get_text().strip() if ref_idx < len(cells) else ""
            diff = cells[diff_idx].get_text().strip() if diff_idx < len(cells) else ""
            
            rows.append({
                "name": name,
                "value": value,
                "ref": ref,
                "diff": diff
            })
    
    return rows


def parse_report_html(report_path: Path) -> Dict:
    """Parse a report.html file and extract all values."""
    with open(report_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Extract performed_at and performed_by
    performed_at = None
    performed_by = ""
    
    # Find Date/Time input
    date_time_inputs = soup.find_all('input', {'class': 'form-control'})
    for inp in date_time_inputs:
        prev_text = inp.find_previous('span', class_='input-group-addon')
        if prev_text:
            prev_text_lower = prev_text.get_text().lower()
            if 'date' in prev_text_lower or 'time' in prev_text_lower or 'performed' in prev_text_lower:
                performed_at = parse_date_time(inp.get('value', ''))
            elif 'operator' in prev_text_lower or 'performed' in prev_text_lower:
                performed_by = inp.get('value', '').strip()
    
    # If not found in inputs, try to extract from path
    if not performed_at:
        # Extract from path like .../cases/20251218_070010/3.analysis/report.html
        path_parts = report_path.parts
        for i, part in enumerate(path_parts):
            if part == 'cases' and i + 1 < len(path_parts):
                date_time_str = path_parts[i + 1]
                performed_at = parse_date_time(date_time_str)
                break
    
    values = {}
    
    # Only add performed_at if we have a valid datetime
    if performed_at:
        values["performed_at"] = performed_at.isoformat()  # Convert to ISO format string for JSON serialization
    
    if performed_by:
        values["performed_by"] = performed_by
    
    # Extract HU Consistency
    hu_rows = extract_table_data(soup, "HU Consistancy")
    for row in hu_rows:
        material_name = row["name"]
        if material_name in HU_MATERIALS:
            field_prefix = HU_MATERIALS[material_name]
            value = parse_float(row["value"])
            baseline = parse_float(row["ref"])
            error = parse_float(row["diff"])
            
            if value is not None:
                values[f"{field_prefix}"] = str(value)
            if baseline is not None:
                values[f"{field_prefix}_baseline"] = str(baseline)
            if error is not None:
                values[f"{field_prefix}_error"] = f"{error:.2f}"
            elif value is not None and baseline is not None:
                # Calculate error if not present
                error = value - baseline
                values[f"{field_prefix}_error"] = f"{error:.2f}"
    
    # Extract Geometric Accuracy (in-plane)
    geo_in_rows = extract_table_data(soup, "Geometric Accuracy (in-plane)")
    for row in geo_in_rows:
        meas_name = row["name"]
        if meas_name in GEO_IN_MEASUREMENTS:
            field_prefix = GEO_IN_MEASUREMENTS[meas_name]
            value = parse_float(row["value"])
            baseline = parse_float(row["ref"])
            error = parse_float(row["diff"])
            
            if value is not None:
                values[f"{field_prefix}"] = str(value)
            if baseline is not None:
                values[f"{field_prefix}_baseline"] = str(baseline)
            if error is not None:
                values[f"{field_prefix}_error"] = f"{error:.2f}"
            elif value is not None and baseline is not None:
                error = value - baseline
                values[f"{field_prefix}_error"] = f"{error:.2f}"
    
    # Extract Geometric Accuracy (out-of-plane)
    geo_out_rows = extract_table_data(soup, "Geometric Accuracy (out-of-plane)")
    for row in geo_out_rows:
        meas_name = row["name"]
        if meas_name in GEO_OUT_MEASUREMENTS:
            field_prefix = GEO_OUT_MEASUREMENTS[meas_name]
            value = parse_float(row["value"])
            baseline = parse_float(row["ref"])
            error = parse_float(row["diff"])
            
            if value is not None:
                values[f"{field_prefix}"] = str(value)
            if baseline is not None:
                values[f"{field_prefix}_baseline"] = str(baseline)
            if error is not None:
                values[f"{field_prefix}_error"] = f"{error:.2f}"
            elif value is not None and baseline is not None:
                error = value - baseline
                values[f"{field_prefix}_error"] = f"{error:.2f}"
    
    # Extract Uniformity (HU)
    uniformity_rows = extract_table_data(soup, "Uniformity (HU)")
    for row in uniformity_rows:
        pos_name = row["name"]
        if pos_name in UNIFORMITY_POSITIONS:
            field_prefix = UNIFORMITY_POSITIONS[pos_name]
            value = parse_float(row["value"])
            baseline = parse_float(row["ref"])
            error = parse_float(row["diff"])
            
            if value is not None:
                values[f"{field_prefix}"] = str(value)
            if baseline is not None:
                values[f"{field_prefix}_baseline"] = str(baseline)
            if error is not None:
                values[f"{field_prefix}_error"] = f"{error:.2f}"
            elif value is not None and baseline is not None:
                error = value - baseline
                values[f"{field_prefix}_error"] = f"{error:.2f}"
    
    # Extract Uniformity (Integral) - has a table
    uniformity_integral_rows = extract_table_data(soup, "Uniformity (Integral)")
    for row in uniformity_integral_rows:
        name = row["name"].lower()
        if 'uniformity' in name or name == '':
            value = parse_float(row["value"])
            baseline = parse_float(row["ref"])
            error = parse_float(row["diff"])
            
            if value is not None:
                values["uniformity_integral"] = str(value)
            if baseline is not None:
                values["uniformity_integral_baseline"] = str(baseline)
            if error is not None:
                values["uniformity_integral_error"] = f"{error:.2f}"
            elif value is not None and baseline is not None:
                error = value - baseline
                values["uniformity_integral_error"] = f"{error:.2f}"
    
    # Extract Low Contrast (STD) - has a table
    low_contrast_rows = extract_table_data(soup, "Low Contrast")
    for row in low_contrast_rows:
        name = row["name"].lower()
        if 'lc' in name or 'std' in name or name == '':
            value = parse_float(row["value"])
            baseline = parse_float(row["ref"])
            error = parse_float(row["diff"])
            
            if value is not None:
                values["low_contrast_std"] = str(value)
            if baseline is not None:
                values["low_contrast_std_baseline"] = str(baseline)
            if error is not None:
                values["low_contrast_std_error"] = f"{error:.2f}"
            elif value is not None and baseline is not None:
                error = value - baseline
                values["low_contrast_std_error"] = f"{error:.2f}"
    
    # Extract High Contrast (RMTF) - has a table with 15 rows (LP/CM 1-15)
    high_contrast_rows = extract_table_data(soup, "High Contrast (RMTF)")
    
    # Process all 15 rows, mapping LP/CM value to field ID
    for row in high_contrast_rows:
        lp_cm_str = row["name"].strip()
        try:
            lp_cm = int(lp_cm_str)
            if 1 <= lp_cm <= 15:
                field_prefix = f"high_contrast_rmtf_{lp_cm}"
                value = parse_float(row["value"])
                baseline = parse_float(row["ref"])
                error = parse_float(row["diff"])
                
                if value is not None:
                    values[field_prefix] = str(value)
                
                if baseline is not None:
                    values[f"{field_prefix}_baseline"] = str(baseline)
                
                # Calculate error if not present
                if error is None and value is not None and baseline is not None:
                    error = value - baseline
                
                if error is not None:
                    values[f"{field_prefix}_error"] = f"{error:.2f}"
        except ValueError:
            # Skip rows that don't have valid LP/CM numbers
            continue
    
    # Extract High Contrast (RMTF=50%) - separate section
    high_contrast_50_rows = extract_table_data(soup, "High Contrast (RMTF=50%)")
    if high_contrast_50_rows:
        # The RMTF=50% section has LP/CM value in the "value" column
        row = high_contrast_50_rows[0]
        rmtf50_value = parse_float(row.get("value") or row.get("name"))
        rmtf50_baseline = parse_float(row.get("ref"))
        rmtf50_error = parse_float(row.get("diff"))
        
        if rmtf50_value is not None:
            values["high_contrast_rmtf50"] = str(rmtf50_value)
        
        if rmtf50_baseline is not None:
            values["high_contrast_rmtf50_baseline"] = str(rmtf50_baseline)
        
        if rmtf50_error is None and rmtf50_value is not None and rmtf50_baseline is not None:
            rmtf50_error = rmtf50_value - rmtf50_baseline
        
        if rmtf50_error is not None:
            values["high_contrast_rmtf50_error"] = f"{rmtf50_error:.2f}"
    
    return values


def calculate_result(error_value: float, error_field_id: str) -> str:
    """Calculate PASS/WARNING/FAIL based on error value and ranges."""
    if error_field_id not in ERROR_RANGES:
        return ""
    
    ranges = ERROR_RANGES[error_field_id]
    pass_range = ranges.get("pass", "").split(":")
    warning_range = ranges.get("warning", "").split(":")
    
    if len(pass_range) == 2:
        try:
            pass_min = float(pass_range[0])
            pass_max = float(pass_range[1])
            if pass_min <= error_value <= pass_max:
                return "PASS"
        except (ValueError, IndexError):
            pass
    
    if len(warning_range) == 2:
        try:
            warn_min = float(warning_range[0])
            warn_max = float(warning_range[1])
            if warn_min <= error_value <= warn_max:
                return "WARNING"
        except (ValueError, IndexError):
            pass
    
    return "FAIL"


def build_metadata(values: Dict) -> Dict:
    """Build metadata dictionary with scripts and ranges."""
    metadata = {}
    
    # Add metadata for each field
    for field_id, field_value in values.items():
        if field_id.endswith("_baseline"):
            # Baseline fields have autofill script
            base_field = field_id.replace("_baseline", "")
            metadata[field_id] = {
                "script": f"autofill_baseline('{base_field}', '{field_id}')"
            }
        elif field_id.endswith("_error"):
            # Error fields have ranges and calc script
            base_field = field_id.replace("_error", "")
            error_value = parse_float(field_value)
            result = ""
            if error_value is not None:
                result = calculate_result(error_value, field_id)
            
            error_metadata = {
                "script": f"calc_physical_error({{inputId: '{base_field}', baselineField: '{base_field}', baselineInputId: '{base_field}_baseline', outputId: '{field_id}', resultId: '{base_field}_result'}});"
            }
            
            if field_id in ERROR_RANGES:
                ranges = ERROR_RANGES[field_id]
                error_metadata["passRange"] = ranges.get("pass", "")
                error_metadata["warningRange"] = ranges.get("warning", "")
            
            if result:
                error_metadata["result"] = result
            
            metadata[field_id] = error_metadata
        else:
            # Regular fields
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
    """Find all report.html files under cases directories."""
    report_files = []
    for root, dirs, files in os.walk(base_dir):
        if 'cases' in root:
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
                "originalName": filename  # Use the filename we specified
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
        "submissionHtml": "",  # Will be generated by backend or can be left empty
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


def main():
    """Main function to process all report files."""
    import argparse
    
    global FORM_ID, BACKEND_URL
    
    parser = argparse.ArgumentParser(description='Import report.html files as form submissions')
    parser.add_argument('base_dir', type=str, help='Base directory to search for cases/report.html files')
    parser.add_argument('--form-id', type=str, default=FORM_ID, help=f'Form ID to submit to (default: {FORM_ID})')
    parser.add_argument('--backend-url', type=str, default=BACKEND_URL, help=f'Backend URL (default: {BACKEND_URL})')
    parser.add_argument('--dry-run', action='store_true', help='Parse files but do not submit')
    parser.add_argument('--first-n-cases-to-upload', type=int, default=None, help='Only process the first N cases (default: process all)')
    
    args = parser.parse_args()
    
    FORM_ID = args.form_id
    BACKEND_URL = args.backend_url
    
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
    
    # Limit to first N cases if specified
    if args.first_n_cases_to_upload is not None:
        if args.first_n_cases_to_upload > 0:
            report_files = report_files[:args.first_n_cases_to_upload]
            print(f"Processing first {len(report_files)} case(s) (out of {total_files} total)")
        else:
            print("Error: --first-n-cases-to-upload must be a positive integer")
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
            
            # Find case directory (parent of 3.analysis directory)
            case_dir = report_file.parent.parent  # report.html is in cases/XXX/3.analysis/
            
            # Create zip file of all .dcm files
            if not args.dry_run:
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
            values = parse_report_html(report_file)
            
            # Build metadata
            metadata = build_metadata(values)
            
            # Calculate overall result
            result = calculate_overall_result(metadata)
            
            # Print summary
            performed_at_str = values.get('performed_at', 'N/A')
            print(f"  Performed At: {performed_at_str}")
            print(f"  Performed By: {values.get('performed_by', 'N/A')}")
            print(f"  Fields extracted: {len([k for k in values.keys() if not k.endswith('_baseline') and not k.endswith('_error')])}")
            print(f"  Overall Result: {result}")
            
            if args.dry_run:
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
    if args.dry_run:
        print("(DRY RUN - no submissions were made)")


if __name__ == "__main__":
    main()
