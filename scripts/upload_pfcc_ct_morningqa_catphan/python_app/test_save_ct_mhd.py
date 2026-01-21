#!/usr/bin/env python3
"""
Test script to build CT.mhd from DICOM files and validate against original CT.mhd
"""

import os
import sys
from pathlib import Path
import shutil

# Add parent directory to path to import dicomtools module
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from dicomtools import dicom_series_to_mhd
import SimpleITK as sitk


def main():
    """Main test function"""
    # Get base directory
    base_dir = Path(__file__).parent.parent.resolve()
    
    print("=" * 70)
    print("CT.mhd Creation and Validation Test")
    print("=" * 70)
    print(f"Base directory: {base_dir}")
    print()
    
    # Original case directory
    original_case_dir = base_dir / "_data" / "GECTSH" / "cases" / "20260108_071844"
    print(f"Original case directory: {original_case_dir}")
    
    if not original_case_dir.exists():
        print(f"ERROR: Case directory does not exist: {original_case_dir}")
        return 1
    
    # Original CT.mhd for validation
    original_ct_mhd = original_case_dir / "CT.mhd"
    
    if not original_ct_mhd.exists():
        print(f"ERROR: Original CT.mhd not found at: {original_ct_mhd}")
        return 1
    
    print(f"Original CT.mhd found: {original_ct_mhd}")
    
    # Check if DICOM files exist
    dicom_files = list(original_case_dir.glob("CT.*.dcm")) + list(original_case_dir.glob("*.dcm"))
    dicom_files = sorted(list(set(dicom_files)))
    
    if not dicom_files:
        print("ERROR: No DICOM files found in source folder")
        print(f"  Searched in: {original_case_dir}")
        return 1
    
    print(f"Found {len(dicom_files)} DICOM file(s) in source folder")
    print()
    
    # Create output directory
    output_base = base_dir / "_data" / "GECTSH" / "_test_output3"
    output_base.mkdir(parents=True, exist_ok=True)
    
    print(f"Output directory: {output_base}")
    print()
    
    # Build CT.mhd from DICOM files
    print("Building CT.mhd from DICOM files...")
    print(f"  Input:  {original_case_dir}")
    print(f"  Output: {output_base}")
    print()
    
    try:
        # Use dicom_series_to_mhd to create CT.mhd from DICOM files
        dicom_series_to_mhd(
            str(original_case_dir),
            str(output_base)
        )
        
        # Verify CT.mhd was created
        created_ct_mhd = output_base / "CT.mhd"
        if not created_ct_mhd.exists():
            print(f"  ✗ ERROR: CT.mhd was not created at {created_ct_mhd}")
            return 1
        
        print(f"  ✓ CT.mhd created successfully: {created_ct_mhd}")
        print()
        
        # Validate against reference CT.mhd
        print("Validating created CT.mhd against reference...")
        print(f"  Reference: {original_ct_mhd}")
        print(f"  Created:   {created_ct_mhd}")
        print()
        
        try:
            reference_image = sitk.ReadImage(str(original_ct_mhd))
            created_image = sitk.ReadImage(str(created_ct_mhd))
                
            # Compare origin, spacing, size, and direction cosines
            ref_origin = reference_image.GetOrigin()
            ref_spacing = reference_image.GetSpacing()
            ref_size = reference_image.GetSize()
            ref_direction = reference_image.GetDirection()
            
            created_origin = created_image.GetOrigin()
            created_spacing = created_image.GetSpacing()
            created_size = created_image.GetSize()
            created_direction = created_image.GetDirection()
            
            errors = []
            
            # Compare origin (allow small floating point differences)
            if not all(abs(ref_origin[i] - created_origin[i]) < 1e-6 for i in range(3)):
                errors.append(f"Origin mismatch: reference={ref_origin}, created={created_origin}")
            
            # Compare spacing (allow small floating point differences)
            if not all(abs(ref_spacing[i] - created_spacing[i]) < 1e-6 for i in range(3)):
                errors.append(f"Spacing mismatch: reference={ref_spacing}, created={created_spacing}")
            
            # Compare size (must be exact)
            if ref_size != created_size:
                errors.append(f"Size mismatch: reference={ref_size}, created={created_size}")
            
            # Compare direction cosines (TransformMatrix) - allow small floating point differences
            if len(ref_direction) != len(created_direction):
                errors.append(f"Direction cosines length mismatch: reference={len(ref_direction)}, created={len(created_direction)}")
            else:
                if not all(abs(ref_direction[i] - created_direction[i]) < 1e-6 for i in range(len(ref_direction))):
                    errors.append(f"Direction cosines mismatch: reference={ref_direction}, created={created_direction}")
            
            # Compare pixel values
            import numpy as np
            ref_array = sitk.GetArrayFromImage(reference_image)
            created_array = sitk.GetArrayFromImage(created_image)
            
            if ref_array.shape != created_array.shape:
                errors.append(f"Pixel array shape mismatch: reference={ref_array.shape}, created={created_array.shape}")
            else:
                # Check if pixel values are identical
                if not np.array_equal(ref_array, created_array):
                    # Find differences
                    diff_mask = ref_array != created_array
                    num_different = np.sum(diff_mask)
                    total_pixels = ref_array.size
                    percent_different = (num_different / total_pixels) * 100.0
                    
                    if num_different > 0:
                        # Get statistics on differences
                        diff_values = ref_array[diff_mask] - created_array[diff_mask]
                        max_diff = np.max(np.abs(diff_values))
                        mean_diff = np.mean(np.abs(diff_values))
                        
                        errors.append(
                            f"Pixel values mismatch: {num_different}/{total_pixels} pixels differ "
                            f"({percent_different:.2f}%), max_diff={max_diff}, mean_diff={mean_diff:.2f}"
                        )
                        
                        # Show some example differences
                        diff_indices = np.where(diff_mask)
                        num_examples = min(10, num_different)
                        example_indices = np.random.choice(len(diff_indices[0]), num_examples, replace=False)
                        examples = []
                        for idx in example_indices:
                            z, y, x = diff_indices[0][idx], diff_indices[1][idx], diff_indices[2][idx]
                            ref_val = ref_array[z, y, x]
                            created_val = created_array[z, y, x]
                            examples.append(f"  [{z},{y},{x}]: ref={ref_val}, created={created_val}, diff={ref_val-created_val}")
                        
                        if examples:
                            errors.append("Example differences:")
                            errors.extend(examples)
            
            if errors:
                print("=" * 70)
                print("Validation Results")
                print("=" * 70)
                print("✗ Validation FAILED:")
                for error in errors:
                    print(f"  {error}")
                print()
                return 1
            else:
                print("=" * 70)
                print("Validation Results")
                print("=" * 70)
                print("✓ All validations passed!")
                print("  - Origin matches")
                print("  - Spacing matches")
                print("  - Size matches")
                print("  - Direction cosines match")
                print("  - Pixel values match")
                print()
                print("Test completed successfully!")
                return 0
                
        except Exception as e:
            print(f"  ✗ ERROR: Failed to validate CT.mhd: {e}")
            import traceback
            traceback.print_exc()
            return 1
        
    except Exception as e:
        print(f"  ✗ ERROR: Failed to create/validate CT.mhd: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
