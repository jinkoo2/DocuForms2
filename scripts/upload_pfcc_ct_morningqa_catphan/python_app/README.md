# CTQA Python Implementation

Python clone of the C# CTQA (CT Quality Assurance) processing application.

## Overview

This Python implementation processes CT DICOM files (CT.xxx.dcm) and generates quality assurance reports (report.html). It replicates the functionality of the C# application located in `../csharp_app/CTQA/ctqa_lib/ctqa.cs`.

## Features

- **DICOM Processing**: Converts DICOM series to MHD format
- **Image Registration**: Uses SimpleITK rigid body registration (Mattes Mutual Information)
- **Mask Transfer**: Transfers analysis masks from baseline to case images
- **Quality Analysis**: Measures HU, UF, HC, LC, geometric, and distance metrics
- **Report Generation**: Creates HTML reports comparing case results to baseline

## Installation

Install required dependencies:

```bash
pip install -r requirements.txt
```

Required packages:
- SimpleITK (for medical image processing and rigid body registration)
- pydicom (for DICOM file handling)
- numpy (for numerical computations)

## Usage

### Basic Usage

```bash
python ctqa.py <case_dir> --machine-param <machine_param_file> --service-param <service_param_file>
```

### Example

```bash
python ctqa.py /path/to/ct/case --machine-param machine_params.txt --service-param service_params.txt
```

### Parameters

- `case_dir`: Directory containing CT DICOM files (CT.xxx.dcm) or CT.mhd file
- `--machine-param`: Path to machine parameter configuration file
- `--service-param`: Path to service parameter configuration file

## Parameter Files

The application uses two types of parameter files (key=value format):

### Machine Parameters (`machine_param`)
Contains machine-specific settings:
- `baseline_dir`: Directory containing baseline CT and masks
- `elastix_param_dir`: Directory containing Elastix parameter files (not used in Python implementation, kept for compatibility)
- `num_of_HU_masks`, `num_of_UF_masks`, etc.: Number of masks for each measurement type
- `HU_tol`, `UF_tol`, etc.: Tolerance values for pass/fail criteria
- `html_report_template`: Path to HTML report template

### Service Parameters (`service_param`)
Contains service/tool paths (optional, for external tools):
- `elastix_dir`: Path to Elastix installation (not used in Python implementation, kept for compatibility)
- `imagetools_3d_dir`: Path to image tools directory (optional fallback, Python implementation preferred)
- `dicomtools_dir`: Path to DICOM tools directory (optional fallback, SimpleITK preferred)
- `log_path`: Directory for log files

## Processing Pipeline

The `run()` function performs the following steps:

1. **DICOM Conversion**: Converts CT.xxx.dcm files to CT.mhd if needed
2. **Registration**: Registers case CT to baseline CT using SimpleITK rigid body registration
3. **Mask Transfer**: Transfers analysis masks (HU, UF, HC, LC, geo, DT) from baseline to case
4. **Analysis**: Performs quality measurements:
   - HU (Hounsfield Units) - mean values
   - UF (Uniformity) - mean values and uniformity calculation
   - HC (High Contrast) - standard deviation and RMTF
   - LC (Low Contrast) - standard deviation
   - geo (Geometric) - distance measurements
   - DT (Distance) - distance measurements
5. **Report Generation**: Creates HTML report comparing results to baseline

## Output Structure

```
case_dir/
├── CT.mhd                    # Converted CT image
├── 1.reg/                    # Registration results
│   └── TransformParameters.*.txt
├── 2.seg/                    # Transferred masks
│   ├── HU1.nrrd
│   ├── HU2.nrrd
│   └── ...
└── 3.analysis/               # Analysis results
    ├── HU.csv
    ├── UF.csv
    ├── HC.csv
    ├── LC.csv
    ├── geo.csv
    ├── DT.csv
    ├── UF.uniformity.csv
    ├── HC.RMTF.csv
    ├── HC.RMTF.calc.csv
    └── report.html           # Final HTML report
```

## Implementation Notes

- **Primary Method**: Uses Python libraries (SimpleITK, pydicom, numpy) for image processing
- **Fallback Method**: Can use external executables (if paths provided in service_param) for compatibility
- **Image Formats**: Supports MHD, NRRD, and DICOM formats
- **Registration**: Uses SimpleITK's rigid body registration (Euler3DTransform) with the following configuration:
  - **Similarity Metric**: Mattes Mutual Information with 50 histogram bins
  - **Transform Type**: Rigid body (translation + rotation, 6 degrees of freedom)
  - **Optimizer**: Gradient descent with 200 iterations
  - **Interpolator**: Linear interpolation
  - **Mask Support**: Uses fixed and moving masks if provided (otherwise uses entire images)
  - **Image Type**: Automatically converts images to Float32 for registration compatibility

## Differences from C# Version

- Uses Python libraries instead of external executables (when possible)
- More flexible error handling
- Better cross-platform compatibility
- Email functionality not implemented (can be added if needed)

## Troubleshooting

1. **DICOM conversion fails**: Ensure DICOM files are valid and readable. Check that SimpleITK can read the files.

2. **Registration fails**: Verify that:
   - Baseline CT.nrrd and fuz_mask.nrrd exist
   - Images have compatible dimensions
   - Images can be converted to Float32 (automatic conversion is performed)

3. **Mask transfer fails**: Ensure baseline masks exist (HU1.nrrd, UF1.nrrd, etc.)

4. **Report generation fails**: Check that:
   - HTML template file exists
   - Baseline CSV files exist for comparison
   - id2label.txt exists in baseline directory

## License

Same as parent project.
