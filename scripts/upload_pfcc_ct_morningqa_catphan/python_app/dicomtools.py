#!/usr/bin/env python3
"""
DICOM tools - handles DICOM to MHD conversion
"""

import os
import logging
from pathlib import Path
import numpy as np
import SimpleITK as sitk


def write_mhd_compressed(image, output_file):
    """
    Write image as MHD file with compression enabled
    
    Args:
        image: SimpleITK image to write
        output_file: Output file path (.mhd)
    """
    writer = sitk.ImageFileWriter()
    writer.SetFileName(output_file)
    writer.SetUseCompression(True)
    writer.Execute(image)


def dicom_series_to_mhd(dir_in, dir_out):
    """
    Convert DICOM series to MHD format using pydicom and SimpleITK
    
    Loads DICOM files, sorts by z-position, applies HU scaling, and creates MHD file.
    
    Args:
        dir_in: Input directory containing DICOM files
        dir_out: Output directory for CT.mhd
    """
    import pydicom
    
    logging.info(f"Converting DICOM series to MHD: {dir_in} -> {dir_out}")
    
    try:
        # Load DICOM series (robust sorting)
        slices = []
        dir_in_path = Path(dir_in)
        
        for f in os.listdir(dir_in):
            file_path = os.path.join(dir_in, f)
            if os.path.isfile(file_path):
                try:
                    ds = pydicom.dcmread(file_path)
                    if hasattr(ds, "ImagePositionPatient"):
                        slices.append(ds)
                except Exception as e:
                    logging.debug(f"Skipping file {f}: {e}")
                    continue
        
        if not slices:
            raise Exception(f"No valid DICOM slices found in {dir_in}")
        
        logging.info(f"Found {len(slices)} DICOM slices")
        
        # Sort by z position
        slices.sort(key=lambda s: float(s.ImagePositionPatient[2]))
        logging.info(f"Sorted {len(slices)} slices by z-position")
        
        # Build HU volume
        volume = np.stack([s.pixel_array for s in slices]).astype(np.int16)
        
        # Apply rescale slope and intercept for HU values
        slope = slices[0].RescaleSlope if hasattr(slices[0], 'RescaleSlope') else 1.0
        intercept = slices[0].RescaleIntercept if hasattr(slices[0], 'RescaleIntercept') else 0.0
        volume = volume * slope + intercept
        volume = volume.astype(np.int16)
        
        logging.info(f"Volume shape: {volume.shape} (Z, Y, X)")
        logging.info(f"HU scaling: slope={slope}, intercept={intercept}")
        
        # Extract spacing, origin, direction
        # Spacing
        if len(slices) > 1:
            dz = abs(
                float(slices[1].ImagePositionPatient[2]) -
                float(slices[0].ImagePositionPatient[2])
            )
        else:
            # Single slice, use default spacing
            dz = 1.0
            logging.warning("Only one slice found, using default z-spacing=1.0")
        
        if hasattr(slices[0], 'PixelSpacing') and slices[0].PixelSpacing:
            dy, dx = map(float, slices[0].PixelSpacing)
        else:
            # Default pixel spacing if not available
            dx = dy = 1.0
            logging.warning("PixelSpacing not found, using default spacing=1.0")
        
        spacing = (dx, dy, dz)  # ITK expects (x,y,z)
        logging.info(f"Spacing: {spacing} (x, y, z)")
        
        # Origin
        origin = list(map(float, slices[0].ImagePositionPatient))
        logging.info(f"Origin: {origin}")
        
        # Direction (from ImageOrientationPatient)
        if hasattr(slices[0], 'ImageOrientationPatient') and slices[0].ImageOrientationPatient:
            iop = slices[0].ImageOrientationPatient
            row = np.array(iop[:3])
            col = np.array(iop[3:])
            slice_dir = np.cross(row, col)
            direction = np.vstack([row, col, slice_dir]).flatten()
        else:
            # Default identity direction if not available
            direction = np.array([1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0])
            logging.warning("ImageOrientationPatient not found, using identity direction")
        
        logging.info(f"Direction cosines: {direction}")
        
        # Create SimpleITK image (IMPORTANT: SimpleITK expects (x, y, z) ordering)
        # volume is (z, y, x), sitk.GetImageFromArray handles this correctly
        volume_itk = sitk.GetImageFromArray(volume)
        volume_itk.SetSpacing(spacing)
        volume_itk.SetOrigin(origin)
        volume_itk.SetDirection(tuple(direction))
        
        logging.info(f"Created SimpleITK image: size={volume_itk.GetSize()}, spacing={volume_itk.GetSpacing()}, origin={volume_itk.GetOrigin()}")
        
    except Exception as e:
        raise Exception(f"Failed to read DICOM series: {e}")
    
    # Write as MHD with compression
    output_file = os.path.join(dir_out, "CT.mhd")
    logging.info(f"Writing CT.mhd to: {output_file} (with compression)")
    
    try:
        # Use ImageFileWriter with compression enabled
        writer = sitk.ImageFileWriter()
        writer.SetFileName(output_file)
        writer.SetUseCompression(True)
        writer.Execute(volume_itk)
        logging.info(f"Successfully converted DICOM to {output_file} (compressed)")
        
        # Verify file was created
        if not os.path.exists(output_file):
            raise Exception(f"CT.mhd was not created at {output_file}")
        
    except Exception as e:
        raise Exception(f"Failed to write CT.mhd: {e}")


def sort_files_by_patient_study_series(dir_in, dir_out, delete_source_files):
    """
    Sort DICOM files by patient, study, and series using pydicom
    
    Args:
        dir_in: Input directory
        dir_out: Output directory
        delete_source_files: Whether to delete source files
    """
    import pydicom
    import shutil
    
    logging.info(f"Sorting DICOM files: {dir_in} -> {dir_out}")
    
    os.makedirs(dir_out, exist_ok=True)
    
    for dicom_file in Path(dir_in).glob("*.dcm"):
        try:
            ds = pydicom.dcmread(str(dicom_file))
            patient_id = getattr(ds, 'PatientID', 'Unknown')
            study_uid = getattr(ds, 'StudyInstanceUID', 'Unknown')
            series_uid = getattr(ds, 'SeriesInstanceUID', 'Unknown')
            
            target_dir = os.path.join(dir_out, patient_id, study_uid, series_uid)
            os.makedirs(target_dir, exist_ok=True)
            
            target_file = os.path.join(target_dir, dicom_file.name)
            shutil.copy2(dicom_file, target_file)
            
            if delete_source_files:
                dicom_file.unlink()
        except Exception as e:
            logging.warning(f"Failed to process {dicom_file}: {e}")
