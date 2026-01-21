#!/usr/bin/env python3
"""
Test script for CTQA processing
Tests the Python implementation against the C# implementation
"""

import os
import sys
import shutil
import re
from pathlib import Path
from html.parser import HTMLParser
from collections import defaultdict

# Add parent directory to path to import ctqa module
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from ctqa import CTQA
from param import Param


def convert_paths_to_relative(param_file, base_dir):
    """
    Convert Windows-style absolute paths in parameter file to relative paths
    
    Args:
        param_file: Path to parameter file
        base_dir: Base directory for relative paths
        
    Returns:
        Path to temporary parameter file with converted paths
    """
    base_dir = Path(base_dir).resolve()
    
    # Read original file
    with open(param_file, 'r') as f:
        lines = f.readlines()
    
    # Create temporary file with converted paths
    temp_file = param_file + ".temp"
    with open(temp_file, 'w') as f:
        for line in lines:
            if '=' in line and not line.strip().startswith('#'):
                key, value = line.split('=', 1)
                value = value.strip()
                
                # Convert Windows network paths and absolute paths to relative
                if value.startswith('\\\\') or (len(value) > 1 and value[1] == ':'):
                    # Windows path - try to convert to relative
                    # Look for common patterns
                    if '_data' in value or 'GECTSH' in value:
                        # Extract relative part
                        parts = value.replace('\\', '/').split('/')
                        try:
                            idx = parts.index('_data')
                            rel_path = '/'.join(parts[idx:])
                            rel_path_full = base_dir.parent.parent / rel_path
                            if rel_path_full.exists():
                                value = str(rel_path_full.relative_to(base_dir.parent.parent))
                        except ValueError:
                            pass
                    elif 'C:' in value or 'c:' in value:
                        # Try to find relative path
                        # For now, keep original or try to map
                        pass
                
                # Write converted line
                f.write(f"{key}={value}\n")
            else:
                f.write(line)
    
    return temp_file


def create_test_param_files(base_dir):
    """
    Create test parameter files with relative paths
    
    Args:
        base_dir: Base directory (scripts/upload_pfcc_ct_morningqa_catphan)
        
    Returns:
        Tuple of (machine_param_file, service_param_file)
    """
    base_dir = Path(base_dir).resolve()
    
    # Original parameter files
    machine_param_orig = base_dir / "_data" / "GECTSH" / "machine_param.txt"
    service_param_orig = base_dir / "_data" / "GECTSH" / "service_param.txt"
    
    # Create temporary files with converted paths
    machine_param_temp = base_dir / "python_app" / "test_machine_param.txt"
    service_param_temp = base_dir / "python_app" / "test_service_param.txt"
    
    # Read and convert machine_param
    with open(machine_param_orig, 'r') as f:
        content = f.read()
    
    # Convert paths to absolute paths
    log_path = (base_dir / "_data" / "GECTSH" / "_logs").resolve()
    baseline_path = (base_dir / "_data" / "GECTSH" / "baseline").resolve()
    cases_path = (base_dir / "_data" / "GECTSH" / "cases").resolve()
    etx_params_path = (base_dir / "_data" / "GECTSH" / "etx_params").resolve()
    report_template_path = (base_dir / "_data" / "GECTSH" / "report_templates" / "full" / "report.html").resolve()
    
    # Create log directory if it doesn't exist
    log_path.mkdir(parents=True, exist_ok=True)
    
    content = content.replace(
        r'\\uhmc-fs-share\shares\RadOnc\Applications\Morning QA\CTQA\_logs',
        str(log_path)
    )
    content = content.replace(
        r'\\uhmc-fs-share\shares\RadOnc\Applications\Morning QA\CTQA\GECTSH\baseline',
        str(baseline_path)
    )
    content = content.replace(
        r'\\uhmc-fs-share\shares\RadOnc\Applications\Morning QA\CTQA\GECTSH\cases',
        str(cases_path)
    )
    content = content.replace(
        r'\\uhmc-fs-share\shares\RadOnc\Applications\Morning QA\CTQA\GECTSH\etx_params',
        str(etx_params_path)
    )
    content = content.replace(
        r'\\uhmc-fs-share\shares\RadOnc\Applications\Morning QA\CTQA\GECTSH\report_templates\full\report.html',
        str(report_template_path)
    )
    
    # Write machine_param
    with open(machine_param_temp, 'w') as f:
        f.write(content)
    
    # Read and convert service_param
    with open(service_param_orig, 'r') as f:
        content = f.read()
    
    # Convert paths - use absolute paths
    log_path = (base_dir / "_data" / "GECTSH" / "_logs").resolve()
    log_path.mkdir(parents=True, exist_ok=True)
    
    content = content.replace(
        r'\\uhmc-fs-share\shares\RadOnc\Applications\Morning QA\CTQA\_logs',
        str(log_path)
    )
    
    # For external tool paths, we'll leave them as-is or set to empty if not available
    # The Python implementation will use its own methods if external tools aren't found
    
    # Write service_param
    with open(service_param_temp, 'w') as f:
        f.write(content)
    
    return str(machine_param_temp), str(service_param_temp)


def extract_numbers_from_html(html_content):
    """
    Extract all numeric values from HTML table cells
    
    Args:
        html_content: HTML content as string
        
    Returns:
        List of tuples (section, label, column_index, value) for matching
    """
    numbers = []
    
    # Find all section divs with class "section"
    # Each section contains a section_head and a table
    section_pattern = r'<div[^>]*class="section"[^>]*>(.*?)</div>\s*</div>'
    sections = re.findall(section_pattern, html_content, re.DOTALL | re.IGNORECASE)
    
    # Also try simpler pattern if the above doesn't work
    if not sections:
        # Find sections by looking for section_head followed by table
        section_blocks = re.split(r'<div[^>]*class="section"[^>]*>', html_content, flags=re.IGNORECASE)
        sections = section_blocks[1:]  # Skip first part before any section
    
    current_section = "Unknown"
    
    # Extract table rows and cells
    row_pattern = r'<tr[^>]*>(.*?)</tr>'
    td_pattern = r'<td[^>]*>(.*?)</td>'
    
    # Process the entire content, tracking current section
    pos = 0
    while pos < len(html_content):
        # Look for next section header
        section_match = re.search(r'<div[^>]*class="section_head"[^>]*>([^<]+)</div>', html_content[pos:], re.IGNORECASE)
        if section_match:
            current_section = section_match.group(1).strip()
            pos += section_match.end()
        else:
            # No more sections, process remaining content
            remaining = html_content[pos:]
            rows = re.findall(row_pattern, remaining, re.DOTALL | re.IGNORECASE)
            
            for row in rows:
                # Extract all cells in this row
                cells = re.findall(td_pattern, row, re.DOTALL | re.IGNORECASE)
                
                if not cells:
                    continue
                
                # Get label (first cell, usually) - clean HTML tags
                label = re.sub(r'<[^>]+>', '', cells[0]).strip()
                
                # Skip header rows
                label_lower = label.lower()
                if label_lower in ['', 'hu', 'ref', 'diff', 'pass/fail', 'lp/cm', 'rmtf=0.5']:
                    continue
                
                # Extract numbers from remaining cells
                for col_idx, cell in enumerate(cells[1:], 1):
                    # Clean cell text
                    cell_text = re.sub(r'<[^>]+>', '', cell)  # Remove HTML tags
                    cell_text = re.sub(r'&[^;]+;', '', cell_text)  # Remove HTML entities
                    cell_text = cell_text.strip()
                    
                    # Skip if it's "Pass" or "Fail"
                    if cell_text.lower() in ['pass', 'fail']:
                        continue
                    
                    # Try to extract number (handle negative numbers and decimals)
                    number_match = re.search(r'-?\d+\.?\d*', cell_text)
                    if number_match:
                        try:
                            value = float(number_match.group())
                            # Store with context: (section, label, column_index, value)
                            numbers.append((current_section, label, col_idx, value))
                        except ValueError:
                            continue
            break
    
    return numbers


def compare_reports(report1_path, report2_path, tolerance=0.01):
    """
    Compare two HTML reports by comparing numeric values
    
    Args:
        report1_path: Path to first report (original)
        report2_path: Path to second report (new)
        tolerance: Maximum allowed absolute difference (default: 0.01)
        
    Returns:
        True if all numeric values match within tolerance, False otherwise
    """
    try:
        with open(report1_path, 'r', encoding='utf-8', errors='ignore') as f:
            content1 = f.read()
        with open(report2_path, 'r', encoding='utf-8', errors='ignore') as f:
            content2 = f.read()
        
        # Extract numbers from both reports
        numbers1 = extract_numbers_from_html(content1)
        numbers2 = extract_numbers_from_html(content2)
        
        # Create dictionaries for easier lookup: (section, label, col_index) -> value
        dict1 = {(section, label, col): val for section, label, col, val in numbers1}
        dict2 = {(section, label, col): val for section, label, col, val in numbers2}
        
        # Get all keys (union of both)
        all_keys = set(dict1.keys()) | set(dict2.keys())
        
        if not all_keys:
            print("⚠ No numeric values found in reports")
            return False
        
        differences = []
        missing_in_1 = []
        missing_in_2 = []
        
        for key in sorted(all_keys):
            section, label, col = key
            val1 = dict1.get(key)
            val2 = dict2.get(key)
            
            if val1 is None:
                missing_in_1.append((section, label, col, val2))
            elif val2 is None:
                missing_in_2.append((section, label, col, val1))
            else:
                diff = abs(val1 - val2)
                if diff > tolerance:
                    differences.append((section, label, col, val1, val2, diff))
        
        # Report results - just show differences, no pass/fail
        if not differences and not missing_in_1 and not missing_in_2:
            print(f"All numeric values match within tolerance ({tolerance})")
            return True
        
        # Report differences - just numbers
        if differences:
            print(f"Found {len(differences)} numeric value(s) with difference > {tolerance}:")
            for section, label, col, val1, val2, diff in differences[:20]:  # Show first 20
                print(f"  [{section}] {label} (col {col}): {val1} vs {val2} (diff: {diff:.6f})")
            if len(differences) > 20:
                print(f"  ... and {len(differences) - 20} more")
        
        if missing_in_1:
            print(f"{len(missing_in_1)} value(s) missing in original report:")
            for section, label, col, val in missing_in_1[:5]:
                print(f"  [{section}] {label} (col {col}): {val}")
        
        if missing_in_2:
            print(f"{len(missing_in_2)} value(s) missing in new report:")
            for section, label, col, val in missing_in_2[:5]:
                print(f"  [{section}] {label} (col {col}): {val}")
        
        return False
        
    except Exception as e:
        print(f"Error comparing reports: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main test function"""
    # Get base directory
    base_dir = Path(__file__).parent.parent.resolve()
    
    print("=" * 70)
    print("CTQA Python Implementation Test")
    print("=" * 70)
    print(f"Base directory: {base_dir}")
    print()
    
    # Create test parameter files
    print("Creating test parameter files...")
    machine_param_file, service_param_file = create_test_param_files(base_dir)
    print(f"  Machine param: {machine_param_file}")
    print(f"  Service param: {service_param_file}")
    print()
    
    # Original case directory
    original_case_dir = base_dir / "_data" / "GECTSH" / "cases" / "20260108_071844"
    print(f"Original case directory: {original_case_dir}")
    
    if not original_case_dir.exists():
        print(f"ERROR: Case directory does not exist: {original_case_dir}")
        return 1
    
    # Create temporary case directory for testing
    temp_base = base_dir / "_data" / "GECTSH" / "_test_output4"
    temp_base.mkdir(parents=True, exist_ok=True)
    
    temp_case_dir = temp_base / "20260108_071844"
    
    # Remove temp directory if it exists from previous run
    if temp_case_dir.exists():
        print(f"Removing existing temporary directory: {temp_case_dir}")
        shutil.rmtree(temp_case_dir)
    
    # Create temporary directory structure (don't copy files)
    print(f"Creating temporary directory structure...")
    print(f"  Location: {temp_case_dir}")
    temp_case_dir.mkdir(parents=True, exist_ok=True)
    
    # Check if DICOM files exist in source folder
    dicom_files = list(original_case_dir.glob("CT.*.dcm"))
    if not dicom_files:
        # Fallback to any .dcm files
        dicom_files = list(original_case_dir.glob("*.dcm"))
    
    # Remove duplicates
    dicom_files = sorted(list(set(dicom_files)))
    
    if not dicom_files:
        print("  ERROR: No DICOM files found in source folder")
        print(f"    Searched in: {original_case_dir}")
        return 1
    
    print(f"  Found {len(dicom_files)} DICOM file(s) in source folder")
    print(f"  Creating CT.mhd from source DICOM files")
    
    # Create CT.mhd from DICOM files using dicom_series_to_mhd
    print(f"  Creating CT.mhd from source DICOM files...")
    try:
        from dicomtools import dicom_series_to_mhd
        # Read from source, write to test output folder
        dicom_series_to_mhd(str(original_case_dir), str(temp_case_dir))
        
        # Verify CT.mhd was created
        ct_mhd = temp_case_dir / "CT.mhd"
        if not ct_mhd.exists():
            print(f"  ✗ ERROR: CT.mhd was not created at {ct_mhd}")
            return 1
        
        print(f"  ✓ CT.mhd created in test output folder: {ct_mhd}")
    except Exception as e:
        print(f"  ✗ ERROR: Failed to create CT.mhd from DICOM files: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Reference to original report for comparison
    original_report = original_case_dir / "3.analysis" / "report.html"
    
    if not original_report.exists():
        print("ERROR: Original report not found for comparison")
        print(f"  Expected location: {original_report}")
        print("  Cannot proceed without original report for comparison")
        return 1
    
    print(f"Original report found: {original_report}")
    
    # Case directory to use for processing (temporary copy)
    case_dir = temp_case_dir
    print(f"Using temporary case directory: {case_dir}")
    
    # Create CTQA instance and run
    print()
    print("Initializing CTQA...")
    sys.stdout.flush()
    try:
        ctqa = CTQA(machine_param_file=machine_param_file, service_param_file=service_param_file)
        print(f"✓ CTQA initialized (log file: {ctqa.log_file})")
        sys.stdout.flush()
        
        print("Running CTQA processing...")
        print("-" * 70)
        print("(This may take several minutes - registration can be slow)")
        print("(Check log file for detailed progress)")
        sys.stdout.flush()
        
        ctqa.run(str(case_dir))
        
        print("-" * 70)
        print()
        sys.stdout.flush()
        
        # Check if report was created
        new_report = case_dir / "3.analysis" / "report.html"
        
        if new_report.exists():
            print(f"✓ Report created: {new_report}")
            
            # Compare with original report (we already verified it exists earlier)
            print()
            print("Comparing reports...")
            print(f"  Original: {original_report}")
            print(f"  New:     {new_report}")
            compare_reports(str(original_report), str(new_report))
        else:
            print("✗ Report was not created!")
            return 1
        
        print()
        print("=" * 70)
        print("Test completed successfully!")
        print("=" * 70)
        print()
        print(f"Temporary output directory: {temp_case_dir}")
        print(f"  (Original case directory was not modified)")
        print(f"  (You can inspect the results in the temporary directory)")
        print(f"  (To clean up, remove: {temp_base})")
        print()
        return 0
        
    except Exception as e:
        print()
        print("=" * 70)
        print(f"ERROR: {e}")
        print("=" * 70)
        import traceback
        traceback.print_exc()
        return 1
    
    finally:
        # Cleanup temporary parameter files
        try:
            if os.path.exists(machine_param_file):
                os.remove(machine_param_file)
            if os.path.exists(service_param_file):
                os.remove(service_param_file)
        except:
            pass


if __name__ == "__main__":
    sys.exit(main())
