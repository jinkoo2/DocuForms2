# CTQA Test Script Usage

## Overview

The `test_ctqa.py` script tests the Python CTQA implementation against the C# version by:
1. Converting Windows-style network paths in parameter files to local absolute paths
2. Running the CTQA processing pipeline
3. Comparing the generated report.html with the original C# version

## Prerequisites

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Ensure the test data exists:
   - `_data/GECTSH/machine_param.txt`
   - `_data/GECTSH/service_param.txt`
   - `_data/GECTSH/cases/20260108_071844/` (with CT DICOM files or CT.mhd)
   - `_data/GECTSH/baseline/` (with baseline CT and masks)
   - `_data/GECTSH/report_templates/full/report.html` (HTML template)

## Running the Test

From the `python_app` directory:

```bash
python3 test_ctqa.py
```

Or from the project root:

```bash
cd scripts/upload_pfcc_ct_morningqa_catphan/python_app
python3 test_ctqa.py
```

## What the Test Does

1. **Path Conversion**: Converts Windows network paths (`\\uhmc-fs-share\...`) in parameter files to local absolute paths
2. **Temporary Copy**: Creates a temporary copy of the case directory under `_data/GECTSH/_test_output/` (original case directory is not modified)
3. **Processing**: Runs the full CTQA pipeline on the temporary copy:
   - DICOM to MHD conversion (if needed)
   - Image registration
   - Mask transfer
   - Quality analysis
   - Report generation
4. **Comparison**: Compares the new report with the original C# version (from the original case directory)
5. **Cleanup**: Removes temporary parameter files (but leaves the temporary case directory for inspection)

## Output

The script will:
- Print progress messages during processing
- Show comparison results between old and new reports
- Generate a new `report.html` in `_data/GECTSH/_test_output/20260108_071844/3.analysis/`
- **Original case directory is not modified** - all processing happens in the temporary directory

## Troubleshooting

### Import Errors
If you get import errors, make sure you're running from the correct directory and that all dependencies are installed:
```bash
pip install SimpleITK pydicom numpy
```

### Path Errors
If paths are not found, check that:
- The `_data/GECTSH/` directory structure exists
- All required files are present
- Paths in parameter files are correctly converted

### Processing Errors
If processing fails:
- Check that CT.mhd exists or DICOM files are readable
- Verify baseline directory contains required files (CT.nrrd, masks, etc.)
- Ensure Elastix parameter files exist in `_data/GECTSH/etx_params/`

### Report Comparison
If reports differ:
- Check the difference output in the console
- Verify that all analysis steps completed successfully
- Compare intermediate CSV files in `_data/GECTSH/_test_output/20260108_071844/3.analysis/` directory

### Cleanup
The temporary test output directory (`_data/GECTSH/_test_output/`) is left intact after the test for inspection. To clean it up manually:
```bash
rm -rf _data/GECTSH/_test_output/
```
