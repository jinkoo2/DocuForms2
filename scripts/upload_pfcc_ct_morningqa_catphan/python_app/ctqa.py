#!/usr/bin/env python3
"""
CTQA - CT Quality Assurance Processing
Python implementation of the CTQA processing pipeline
"""

import os
import sys
from pathlib import Path
from datetime import datetime
import logging

from param import Param
from dicomtools import dicom_series_to_mhd, write_mhd_compressed as write_mhd_compressed_dicom
from registration import rigid_body_registration, apply_transform, write_mhd_compressed
from imagetools import (
    calc_image_min_max_mean_std_3d_f,
    calc_bounding_box_3d,
    crop_3d_boundingbox_f,
    threshold_3d_f,
    cast_to_uchar_3d_f,
    calc_image_moments_3d_f
)


class CTQA:
    """CT Quality Assurance processing class"""
    
    def __init__(self, machine_param_file=None, service_param_file=None):
        """
        Initialize CTQA with parameter files
        
        Args:
            machine_param_file: Path to machine parameter file
            service_param_file: Deprecated, kept for backwards compatibility (ignored)
        """
        self.machine_param = Param(machine_param_file) if machine_param_file else None
        
        # Setup logging
        self.log_file = self._setup_logging()
        
    def _setup_logging(self):
        """Setup logging to file and console"""
        # Hardcoded log directory
        log_dir = "./_logs"
        
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = os.path.join(log_dir, f"log_{timestamp}.txt")
        
        # Configure logging with immediate flush
        file_handler = logging.FileHandler(log_file)
        console_handler = logging.StreamHandler(sys.stdout)
        
        # Set format
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        # Configure root logger
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.INFO)
        root_logger.addHandler(file_handler)
        root_logger.addHandler(console_handler)
        
        # Ensure output is flushed
        sys.stdout.flush()
        
        return log_file
    
    def log_line(self, msg):
        """Log a line"""
        logging.info(msg)
        sys.stdout.flush()  # Ensure immediate output
    
    def log_error(self, msg):
        """Log an error and raise exception"""
        logging.error(msg)
        raise Exception(msg)
    
    def combine(self, path1, path2):
        """Combine two paths"""
        return os.path.join(path1, path2)
    
    def run(self, case_dir):
        """
        Main processing function - processes CT DICOM files and generates report
        
        Args:
            case_dir: Directory containing CT DICOM files (CT.xxx.dcm) or CT.mhd
        """
        print("Starting CTQA.run()...", flush=True)
        self.log_line("ctqa.run()")
        self.log_line(f"case_dir={case_dir}")
        print(f"Processing case directory: {case_dir}", flush=True)
        
        if not os.path.exists(case_dir):
            self.log_error(f"Case directory not found: {case_dir}")
        
        baseline_dir = self.machine_param.get_value("baseline_dir")
        if not baseline_dir or not os.path.exists(baseline_dir):
            self.log_error(f"Baseline directory not found: {baseline_dir}")
        
        # Transfer the analysis masks to the case image
        # Do the registration
        f = self.combine(case_dir, "CT.mhd")
        fMask = ""
        m = self.combine(baseline_dir, "CT.nrrd")
        mMask = self.combine(baseline_dir, "fuz_mask.nrrd")
        
        self.log_line(f"Checking for CT.mhd at: {f}")
        self.log_line(f"File exists: {os.path.exists(f)}")
        
        if not os.path.exists(f):
            # Case CT not found, try to convert DICOM files to CT.mhd
            self.log_line(f"CT.mhd not found: {f}")
            self.log_line("Trying to convert DICOM images to CT.mhd...")
            
            # Check if DICOM files exist (prioritize CT.*.dcm, avoid duplicates)
            ct_dcm_files = list(Path(case_dir).glob("CT.*.dcm"))
            if ct_dcm_files:
                dicom_files = ct_dcm_files
                self.log_line(f"Found {len(dicom_files)} CT.*.dcm files in {case_dir}")
            else:
                dicom_files = list(Path(case_dir).glob("*.dcm"))
                self.log_line(f"Found {len(dicom_files)} .dcm files in {case_dir}")
            
            if not dicom_files:
                raise Exception(f"No DICOM files found in {case_dir}. Cannot create CT.mhd.")
            
            try:
                dicom_series_to_mhd(case_dir, case_dir)
                self.log_line("DICOM to MHD conversion completed")
            except Exception as e:
                self.log_error(f"Failed to convert DICOM to MHD: {e}")
                import traceback
                self.log_error(traceback.format_exc())
                raise
            
            # Verify CT.mhd was created
            if not os.path.exists(f):
                self.log_error(f"CT.mhd was not created after conversion!")
                self.log_error(f"Expected location: {f}")
                # List what files were created
                created_files = list(Path(case_dir).glob("CT.*"))
                self.log_error(f"Files matching CT.* in case_dir: {[str(f) for f in created_files]}")
                raise Exception(f"CT.mhd not found and could not be created from DICOM files in: {case_dir}")
            else:
                self.log_line(f"CT.mhd successfully created: {f}")
        
        # Verify CT.mhd exists and is readable before proceeding (use absolute path)
        f_abs = os.path.abspath(f)
        if not os.path.exists(f_abs):
            self.log_error(f"CT.mhd does not exist (absolute path): {f_abs}")
            # List files in case_dir for debugging
            case_files = list(Path(case_dir).glob("*"))
            self.log_error(f"Files in case_dir: {[str(f) for f in case_files[:10]]}")
            raise Exception(f"CT.mhd does not exist: {f_abs}")
        
        # Verify file is readable
        try:
            with open(f_abs, 'rb') as test_file:
                test_file.read(1)
        except Exception as e:
            self.log_error(f"CT.mhd exists but is not readable: {e}")
            raise Exception(f"CT.mhd is not readable: {f_abs}")
        
        # Check if CT.raw exists (MHD format requires both .mhd and .raw)
        raw_file = f_abs.replace('.mhd', '.raw')
        if not os.path.exists(raw_file):
            self.log_line(f"Warning: CT.raw not found at {raw_file}, but proceeding anyway")
        
        self.log_line(f"CT.mhd verified and readable: {f_abs}")
        
        reg_out = self.combine(case_dir, "1.reg")
        
        self.log_line("running registration...")
        self.log_line(f"f={f_abs}")
        self.log_line(f"fMask={fMask}")
        self.log_line(f"m={m}")
        self.log_line(f"mMask={mMask}")
        self.log_line(f"reg_out={reg_out}")
        self.log_line("Using SimpleITK rigid body registration (no parameter files needed)")
        
        # param_files parameter kept for compatibility but not used with SimpleITK rigid registration
        param_files = []  # Empty list since SimpleITK doesn't need parameter files
        rigid_body_registration(f_abs, fMask, m, mMask, reg_out, param_files)
        
        # Transfer masks
        self.log_line("transferring masks...")
        baseline_ext = "nrrd"
        # For SimpleITK, we use TransformParameters.0.txt (single transform)
        num_transforms = 1  # SimpleITK rigid registration produces a single transform
        self.transfer_masks(baseline_dir, baseline_ext, case_dir, num_transforms, "HU")
        self.transfer_masks(baseline_dir, baseline_ext, case_dir, num_transforms, "UF")
        self.transfer_masks(baseline_dir, baseline_ext, case_dir, num_transforms, "HC")
        self.transfer_masks(baseline_dir, baseline_ext, case_dir, num_transforms, "LC")
        self.transfer_masks(baseline_dir, baseline_ext, case_dir, num_transforms, "geo")
        self.transfer_masks(baseline_dir, baseline_ext, case_dir, num_transforms, "DT")
        
        # Do the analysis
        result_dir = self.combine(case_dir, "3.analysis")
        self.log_line("analyzing data...")
        # Use "mhd" for mask extension since transferred masks are now saved as MHD
        self.analyze(case_dir, "mhd", self.combine(case_dir, "2.seg"), "mhd", result_dir)
        
        # Make a report
        self.log_line("making a report...")
        self.report(case_dir, baseline_dir, result_dir)
        
        # Email the report (optional)
        self.log_line("emailing report...")
        # self.email_report(case_dir)
        
        self.log_line("exiting ctqa.run()...")
    
    def transfer_masks(self, baseline_dir, ext, case_dir, num_of_etx_input_param_files, key):
        """Transfer masks from baseline to case using registration transform
        
        Uses composite mask approach: combines all masks into one image with different
        pixel values, applies transform, then splits back into individual masks.
        """
        import numpy as np
        import SimpleITK as sitk
        
        reg_dir = self.combine(case_dir, "1.reg")
        reg_transform_param_file = self.combine(reg_dir, f"TransformParameters.{num_of_etx_input_param_files - 1}.txt")
        
        # Get fixed image path (case CT) for reference space
        fixed_image_path = self.combine(case_dir, "CT.mhd")
        
        seg_dir = self.combine(case_dir, "2.seg")
        if not os.path.exists(seg_dir):
            os.makedirs(seg_dir)
        
        num_of_masks = int(self.machine_param.get_value(f"num_of_{key}_masks"))
        
        if num_of_masks == 0:
            return
        
        # Step 1: Load all masks and create composite image
        self.log_line(f"Creating composite mask for {key} ({num_of_masks} masks)...")
        masks = []
        mask_files = []
        
        for i in range(1, num_of_masks + 1):
            mask_file = self.combine(baseline_dir, f"{key}{i}.nrrd")
            if os.path.exists(mask_file):
                mask = sitk.ReadImage(mask_file)
                masks.append(mask)
                mask_files.append(mask_file)
            else:
                self.log_error(f"Mask file not found: {mask_file}")
        
        if not masks:
            self.log_error(f"No masks found for {key}")
            return
        
        # Get reference image (first mask) for spacing/origin/size
        reference_mask = masks[0]
        ref_spacing = reference_mask.GetSpacing()
        ref_origin = reference_mask.GetOrigin()
        ref_size = reference_mask.GetSize()
        
        # Verify all masks have the same spacing, origin, and size
        for i, mask in enumerate(masks, 1):
            mask_spacing = mask.GetSpacing()
            mask_origin = mask.GetOrigin()
            mask_size = mask.GetSize()
            
            if mask_spacing != ref_spacing or mask_origin != ref_origin or mask_size != ref_size:
                self.log_error(
                    f"Mask {key}{i} has different geometry than reference mask!\n"
                    f"  Reference: spacing={ref_spacing}, origin={ref_origin}, size={ref_size}\n"
                    f"  Mask {i}: spacing={mask_spacing}, origin={mask_origin}, size={mask_size}"
                )
                raise Exception(f"Mask geometry mismatch for {key}{i}")
        
        self.log_line(f"All {len(masks)} masks have consistent geometry")
        
        # Create composite mask with different pixel values for each mask
        # Convert masks to numpy arrays
        mask_arrays = []
        for mask in masks:
            mask_array = sitk.GetArrayFromImage(mask)
            mask_arrays.append(mask_array)
        
        # Create composite: assign pixel value i+1 to mask i (1, 2, 3, ...)
        composite_array = np.zeros_like(mask_arrays[0], dtype=np.float32)
        for i, mask_array in enumerate(mask_arrays, 1):
            # Where mask is > 0.5, set composite to i
            composite_array[mask_array > 0.5] = float(i)
        
        # Convert back to SimpleITK image
        composite_image = sitk.GetImageFromArray(composite_array)
        composite_image.CopyInformation(reference_mask)
        
        # Save composite mask as MHD (keep it for inspection) with compression
        composite_file = self.combine(seg_dir, f"{key}_composite.mhd")
        write_mhd_compressed(composite_image, composite_file)
        self.log_line(f"Saved composite mask: {composite_file} (compressed)")
        
        # Step 2: Apply transform to composite mask
        self.log_line(f"Applying transform to composite mask...")
        transformed_composite_file = apply_transform(composite_file, seg_dir, reg_transform_param_file, fixed_image_path)
        
        # Step 3: Split composite back into individual masks
        self.log_line(f"Splitting composite into individual masks...")
        transformed_composite = sitk.ReadImage(transformed_composite_file)
        transformed_array = sitk.GetArrayFromImage(transformed_composite)
        
        # Save transformed composite mask as MHD (keep it for inspection) with compression
        transformed_composite_mhd = self.combine(seg_dir, f"{key}_composite_transformed.mhd")
        write_mhd_compressed(transformed_composite, transformed_composite_mhd)
        self.log_line(f"Saved transformed composite mask: {transformed_composite_mhd} (compressed)")
        
        # Read fixed image for reference
        fixed_image = sitk.ReadImage(fixed_image_path)
        fixed_spacing = fixed_image.GetSpacing()
        fixed_origin = fixed_image.GetOrigin()
        fixed_size = fixed_image.GetSize()
        
        # Verify transformed composite has same geometry as fixed image
        transformed_spacing = transformed_composite.GetSpacing()
        transformed_origin = transformed_composite.GetOrigin()
        transformed_size = transformed_composite.GetSize()
        
        if transformed_spacing != fixed_spacing or transformed_origin != fixed_origin or transformed_size != fixed_size:
            self.log_error(
                f"Transformed composite has different geometry than fixed image!\n"
                f"  Fixed image: spacing={fixed_spacing}, origin={fixed_origin}, size={fixed_size}\n"
                f"  Transformed: spacing={transformed_spacing}, origin={transformed_origin}, size={transformed_size}"
            )
            raise Exception("Transformed composite geometry mismatch")
        
        self.log_line(f"Transformed composite matches fixed image geometry")
        
        for i in range(1, num_of_masks + 1):
            pixel_value = float(i)
            
            # Threshold: [pixel_value - 0.5, pixel_value + 0.5]
            # Use a slightly wider range to account for interpolation artifacts
            threshold_low = pixel_value - 0.6
            threshold_high = pixel_value + 0.6
            
            mask_array = np.zeros_like(transformed_array, dtype=np.uint8)
            mask_array[(transformed_array >= threshold_low) & (transformed_array <= threshold_high)] = 1
            
            # Check if mask is empty (all zeros)
            num_pixels = np.sum(mask_array)
            if num_pixels == 0:
                self.log_error(
                    f"ERROR: Mask {key}{i} is empty (all zeros) after transformation!\n"
                    f"  Pixel value range in transformed composite: [{np.min(transformed_array):.3f}, {np.max(transformed_array):.3f}]\n"
                    f"  Looking for pixel_value {pixel_value} in range [{threshold_low:.3f}, {threshold_high:.3f}]\n"
                    f"  This indicates the mask was not properly transferred or the threshold range is incorrect."
                )
                raise Exception(f"Transferred mask {key}{i} is empty - all pixels are zero")
            
            # Convert to SimpleITK image
            mask_image = sitk.GetImageFromArray(mask_array)
            mask_image.CopyInformation(fixed_image)
            
            # Verify output mask geometry matches fixed image
            mask_spacing = mask_image.GetSpacing()
            mask_origin = mask_image.GetOrigin()
            mask_size = mask_image.GetSize()
            
            if mask_spacing != fixed_spacing or mask_origin != fixed_origin or mask_size != fixed_size:
                self.log_error(
                    f"Output mask {key}{i} has different geometry than fixed image!\n"
                    f"  Fixed image: spacing={fixed_spacing}, origin={fixed_origin}, size={fixed_size}\n"
                    f"  Output mask: spacing={mask_spacing}, origin={mask_origin}, size={mask_size}"
                )
                raise Exception(f"Output mask {key}{i} geometry mismatch")
            
            # Save individual mask as MHD (not NRRD) with compression
            seg_out = self.combine(seg_dir, f"{key}{i}.mhd")
            write_mhd_compressed(mask_image, seg_out)
            self.log_line(f"Saved mask: {seg_out} (compressed, pixels: {num_pixels}, spacing={mask_spacing}, origin={mask_origin}, size={mask_size})")
    
    def analyze(self, case_dir, CT_ext, mask_dir, mask_ext, out_dir):
        """Perform analysis on the CT images"""
        if not os.path.exists(out_dir):
            os.makedirs(out_dir)
        
        self.measure_mean(case_dir, CT_ext, mask_dir, mask_ext, "HU", out_dir)
        self.measure_mean(case_dir, CT_ext, mask_dir, mask_ext, "UF", out_dir)
        self.measure_std(case_dir, CT_ext, mask_dir, mask_ext, "HC", out_dir)
        self.measure_std(case_dir, CT_ext, mask_dir, mask_ext, "LC", out_dir)
        self.measure_dist(case_dir, CT_ext, mask_dir, mask_ext, "geo", 1.0, -500, 0.0, out_dir)
        self.measure_dist(case_dir, CT_ext, mask_dir, mask_ext, "DT", 0.0, 200, 1.0, out_dir)
        
        self.calc_integral_non_uniformity(out_dir)
        self.calc_relative_mtf(out_dir)
    
    def measure_mean(self, case_dir, CT_ext, mask_dir, mask_ext, key, out_dir):
        """Measure mean pixel values for masks"""
        CT = self.combine(case_dir, f"CT.{CT_ext}")
        self.log_line(f"CT={CT}")
        num_of_masks = int(self.machine_param.get_value(f"num_of_{key}_masks"))
        
        values = []
        col_names = []
        for i in range(1, num_of_masks + 1):
            mask = self.combine(mask_dir, f"{key}{i}.{mask_ext}")
            self.log_line(f"mask={mask}")
            
            # Get image stat
            mean = self.mean_pixel_value(CT, mask)
            self.log_line(f"mean pixel value = {mean}")
            values.append(str(mean))
            
            # Col name
            col_name = f"{key}{i}"
            col_names.append(col_name)
        
        outfile = self.combine(out_dir, f"{key}.csv")
        self.log_line(f"saving to {outfile}")
        with open(outfile, 'w') as f:
            f.write(",".join(col_names) + "\n")
            f.write(",".join(values) + "\n")
    
    def measure_std(self, case_dir, CT_ext, mask_dir, mask_ext, key, out_dir):
        """Measure standard deviation of pixel values for masks"""
        CT = self.combine(case_dir, f"CT.{CT_ext}")
        self.log_line(f"CT={CT}")
        num_of_masks = int(self.machine_param.get_value(f"num_of_{key}_masks"))
        
        values = []
        col_names = []
        for i in range(1, num_of_masks + 1):
            mask = self.combine(mask_dir, f"{key}{i}.{mask_ext}")
            self.log_line(f"mask={mask}")
            
            # Get image stat
            std = self.std_pixel_value(CT, mask)
            self.log_line(f"std pixel value = {std}")
            values.append(str(std))
            
            # Col name
            col_name = f"{key}{i}"
            col_names.append(col_name)
        
        outfile = self.combine(out_dir, f"{key}.csv")
        self.log_line(f"saving to {outfile}")
        with open(outfile, 'w') as f:
            f.write(",".join(col_names) + "\n")
            f.write(",".join(values) + "\n")
    
    def mean_pixel_value(self, img, mask):
        """Calculate mean pixel value within mask"""
        stat = mask + ".stat.txt"
        calc_image_min_max_mean_std_3d_f(img, mask, stat)
        
        # Get mean value from the output file
        p = Param(stat)
        mean = float(p.get_value("mean"))
        
        return mean
    
    def std_pixel_value(self, img, mask):
        """Calculate standard deviation of pixel values within mask"""
        stat = mask + ".stat.txt"
        calc_image_min_max_mean_std_3d_f(img, mask, stat)
        
        # Get std value from the output file
        p = Param(stat)
        std = float(p.get_value("std"))
        
        return std
    
    def measure_dist(self, case_dir, CT_ext, mask_dir, mask_ext, key, level0, th, level1, out_dir):
        """Measure distances between geometric features"""
        CT = self.combine(case_dir, f"CT.{CT_ext}")
        self.log_line(f"CT={CT}")
        num_of_masks = int(self.machine_param.get_value(f"num_of_{key}_masks"))
        
        points = []
        for i in range(1, num_of_masks + 1):
            mask_name = f"{key}{i}"
            mask = self.combine(mask_dir, f"{mask_name}.{mask_ext}")
            self.log_line(f"mask={mask}")
            
            # Get image stat
            com = self.center_of_mass(CT, mask, mask_name, level0, th, level1, out_dir)
            self.log_line(f"com = {com}")
            points.append(f"{mask_name},{com}")
        
        outfile = self.combine(out_dir, f"{key}.csv")
        self.log_line(f"saving to {outfile}")
        with open(outfile, 'w') as f:
            f.write(",x[mm],y[mm],z[mm]\n")
            f.write("\n".join(points) + "\n")
        
        # Calculate distances
        dist_list = self.calculate_distances(points)
        labels = []
        values = []
        for label_value in dist_list:
            parts = label_value.split(',')
            labels.append(parts[0])
            values.append(parts[1])
        
        outfile2 = self.combine(out_dir, f"{key}.dist.csv")
        self.log_line(f"saving to {outfile2}")
        with open(outfile2, 'w') as f:
            f.write(",".join(labels) + "\n")
            f.write(",".join(values) + "\n")
    
    def center_of_mass(self, img, mask, key, level0, th, level1, out_dir):
        """Calculate center of mass for a masked region"""
        # Get ROI from the mask
        roi_txt = mask + ".roi.txt"
        calc_bounding_box_3d(mask, roi_txt)
        
        # Crop around the hole
        crop_img = self.combine(out_dir, f"{key}.crop.mha")
        crop_3d_boundingbox_f(img, roi_txt, crop_img)
        
        # Threshold & invert the image (the hole is air [-1000])
        th_img = crop_img + ".th.mha"
        threshold_3d_f(crop_img, level0, th, level1, th_img)
        
        # Measure the moment
        moment_file = th_img + ".mnt.txt"
        calc_image_moments_3d_f(th_img, moment_file)
        
        p = Param(moment_file)
        com_string = p.get_value("Center of gravity").replace("[", "").replace("]", "").strip()
        
        return com_string
    
    def calculate_distances(self, points):
        """Calculate distances between consecutive points"""
        dist_list = []
        
        for i in range(len(points) - 1):
            pt1 = points[i]
            pt2 = points[i + 1]
            dist = self.calculate_distance(pt1, pt2)
            dist_list.append(dist)
        
        # Last point to the first point
        dist_last_to_first = self.calculate_distance(points[-1], points[0])
        dist_list.append(dist_last_to_first)
        
        return dist_list
    
    def calculate_distance(self, pt1_str, pt2_str):
        """Calculate distance between two points"""
        parts1 = pt1_str.split(',')
        label1 = parts1[0]
        x1 = float(parts1[1])
        y1 = float(parts1[2])
        z1 = float(parts1[3])
        
        parts2 = pt2_str.split(',')
        label2 = parts2[0]
        x2 = float(parts2[1])
        y2 = float(parts2[2])
        z2 = float(parts2[3])
        
        label_d = f"{label1}->{label2}"
        dx = x1 - x2
        dy = y1 - y2
        dz = z1 - z2
        
        dist = (dx * dx + dy * dy + dz * dz) ** 0.5
        return f"{label_d},{dist}"
    
    def calc_integral_non_uniformity(self, result_dir):
        """Calculate integral non-uniformity"""
        hu_file = self.combine(result_dir, "UF.csv")
        
        with open(hu_file, 'r') as f:
            lines = f.readlines()
            values_str = lines[1].strip().split(',')
            values = [float(v) for v in values_str]
        
        max_val = max(values)
        min_val = min(values)
        inu = (max_val - min_val) / (max_val + min_val)
        
        result_file = self.combine(result_dir, "UF.uniformity.csv")
        with open(result_file, 'w') as f:
            f.write("Uniformity\n")
            f.write(f"{inu}\n")
    
    def calc_relative_mtf(self, result_dir):
        """Calculate relative MTF"""
        file = self.combine(result_dir, "HC.csv")
        
        with open(file, 'r') as f:
            lines = f.readlines()
            label_line = lines[0].strip()
            values_str = lines[1].strip().split(',')
            v1 = [float(v) for v in values_str]
        
        # Normalize
        v2 = [v / v1[0] for v in v1]
        
        # Find the first crossing to the 50%
        index_after_50percent = -1
        for i in range(len(v2)):
            if v2[i] < 0.5:
                index_after_50percent = i
                break
        
        if index_after_50percent == -1:
            self.log_error("calc_relative_mtf() - Failed finding 50% crossing!")
        
        y1 = v2[index_after_50percent - 1]
        y2 = v2[index_after_50percent]
        x1 = index_after_50percent - 1
        x2 = index_after_50percent
        a = (y2 - y1) / (x2 - x1) if (x2 - x1) != 0 else 0
        b = y1 - a * x1
        x = (0.5 - b) / a if a != 0 else 0
        
        # Save RMTF
        result_file = self.combine(result_dir, "HC.RMTF.csv")
        with open(result_file, 'w') as f:
            f.write(label_line + "\n")
            f.write(",".join([str(v) for v in v2]) + "\n")
        
        # Save LP/cm for 0.5 RMTF
        result_file = self.combine(result_dir, "HC.RMTF.calc.csv")
        with open(result_file, 'w') as f:
            f.write("RMTF=0.5\n")
            f.write(f"{x}\n")
    
    def gen_html_table_rows_from_csv(self, case_result_dir, baseline_dir, num_of_masks, tol, filename, num_format="0.0"):
        """Generate HTML table rows from CSV comparison"""
        id2label_file = self.combine(baseline_dir, "id2label.txt")
        id2label = Param(id2label_file)
        
        # Read values from baseline
        file0 = self.combine(baseline_dir, filename)
        with open(file0, 'r') as f:
            lines0 = f.readlines()
            labels0 = lines0[0].strip().split(',')
            values0 = lines0[1].strip().split(',')
        
        # Read values from this case
        file1 = self.combine(case_result_dir, filename)
        with open(file1, 'r') as f:
            lines1 = f.readlines()
            labels1 = lines1[0].strip().split(',')
            values1 = lines1[1].strip().split(',')
        
        # Add rows
        rows = []
        for i in range(num_of_masks):
            mask_id = labels0[i].strip()
            label = id2label.get_value(mask_id).strip()
            if label == "":
                label = mask_id
            value0 = float(values0[i])
            value1 = float(values1[i])
            diff = value1 - value0
            err = abs(diff)
            pass_fail = "Pass" if err < tol else "Fail"
            
            # Format numbers
            if num_format == "0.0":
                value1_str = f"{value1:.1f}"
                value0_str = f"{value0:.1f}"
                diff_str = f"{diff:.1f}"
            elif num_format == "0.00":
                value1_str = f"{value1:.2f}"
                value0_str = f"{value0:.2f}"
                diff_str = f"{diff:.2f}"
            else:
                value1_str = str(value1)
                value0_str = str(value0)
                diff_str = str(diff)
            
            if pass_fail == "Pass":
                pass_cell = '<td class="pass">Pass<span class="glyphicon glyphicon-ok" aria-hidden="true"></span></td>'
            else:
                pass_cell = '<td class="fail">Fail<span class="glyphicon glyphicon-remove" aria-hidden="true"></span></td>'
            
            row = f"""<tr>
    <td>{label}</td>
    <td>{value1_str}</td>
    <td>{value0_str}</td>
    <td>{diff_str}</td>
    {pass_cell}
</tr>"""
            rows.append(row)
        
        return "\n".join(rows)
    
    def gen_html_table_rows_from_csv_key(self, case_result_dir, baseline_dir, key, filename, num_format="0.0"):
        """Generate HTML table rows from CSV using key for configuration"""
        num_of_masks = int(self.machine_param.get_value(f"num_of_{key}_masks"))
        tol = float(self.machine_param.get_value(f"{key}_tol"))
        return self.gen_html_table_rows_from_csv(case_result_dir, baseline_dir, num_of_masks, tol, filename, num_format)
    
    def collect_csv_results(self, case_result_dir, baseline_dir, num_of_masks, tol, filename):
        """Collect analysis results from CSV for JSON output"""
        id2label_file = self.combine(baseline_dir, "id2label.txt")
        id2label = Param(id2label_file)
        
        results = []
        
        # Read baseline values
        file0 = self.combine(baseline_dir, filename)
        if not os.path.exists(file0):
            return results
        with open(file0, 'r') as f:
            lines0 = f.readlines()
            labels0 = lines0[0].strip().split(',')
            values0 = lines0[1].strip().split(',')
        
        # Read case values
        file1 = self.combine(case_result_dir, filename)
        if not os.path.exists(file1):
            return results
        with open(file1, 'r') as f:
            lines1 = f.readlines()
            labels1 = lines1[0].strip().split(',')
            values1 = lines1[1].strip().split(',')
        
        for i in range(min(num_of_masks, len(values0), len(values1))):
            mask_id = labels0[i].strip()
            label = id2label.get_value(mask_id).strip()
            if label == "":
                label = mask_id
            value = float(values1[i])
            reference = float(values0[i])
            diff = value - reference
            passed = abs(diff) < tol
            
            results.append({
                "id": mask_id,
                "label": label,
                "value": round(value, 4),
                "reference": round(reference, 4),
                "difference": round(diff, 4),
                "tolerance": tol,
                "passed": passed
            })
        
        return results
    
    def collect_analysis_results(self, case_result_dir, baseline_dir, study_date, study_time, operator):
        """Collect all analysis results into a JSON-serializable dictionary"""
        results = {
            "metadata": {
                "study_date": study_date,
                "study_time": study_time,
                "operator": operator,
                "machine": self.machine_param.get_value("machine_name") or "Unknown"
            },
            "hu_consistency": {
                "tolerance": float(self.machine_param.get_value("HU_tol")),
                "results": self.collect_csv_results(
                    case_result_dir, baseline_dir,
                    int(self.machine_param.get_value("num_of_HU_masks")),
                    float(self.machine_param.get_value("HU_tol")),
                    "HU.csv"
                )
            },
            "geometric_accuracy_inplane": {
                "tolerance": float(self.machine_param.get_value("geo_tol")),
                "results": self.collect_csv_results(
                    case_result_dir, baseline_dir,
                    int(self.machine_param.get_value("num_of_geo_masks")),
                    float(self.machine_param.get_value("geo_tol")),
                    "geo.dist.csv"
                )
            },
            "geometric_accuracy_outofplane": {
                "tolerance": float(self.machine_param.get_value("DT_tol")),
                "results": self.collect_csv_results(
                    case_result_dir, baseline_dir,
                    int(self.machine_param.get_value("num_of_DT_masks")),
                    float(self.machine_param.get_value("DT_tol")),
                    "DT.dist.csv"
                )
            },
            "uniformity_hu": {
                "tolerance": float(self.machine_param.get_value("UF_tol")),
                "results": self.collect_csv_results(
                    case_result_dir, baseline_dir,
                    int(self.machine_param.get_value("num_of_UF_masks")),
                    float(self.machine_param.get_value("UF_tol")),
                    "UF.csv"
                )
            },
            "uniformity_integral": {
                "tolerance": float(self.machine_param.get_value("UF.uniformity_tol")),
                "results": self.collect_csv_results(
                    case_result_dir, baseline_dir,
                    1,
                    float(self.machine_param.get_value("UF.uniformity_tol")),
                    "UF.uniformity.csv"
                )
            },
            "low_contrast": {
                "tolerance": float(self.machine_param.get_value("LC_tol")),
                "results": self.collect_csv_results(
                    case_result_dir, baseline_dir,
                    int(self.machine_param.get_value("num_of_LC_masks")),
                    float(self.machine_param.get_value("LC_tol")),
                    "LC.csv"
                )
            },
            "high_contrast_rmtf": {
                "tolerance": float(self.machine_param.get_value("HC_RMTF_tol")),
                "results": self.collect_csv_results(
                    case_result_dir, baseline_dir,
                    int(self.machine_param.get_value("num_of_HC_masks")),
                    float(self.machine_param.get_value("HC_RMTF_tol")),
                    "HC.RMTF.csv"
                )
            },
            "high_contrast_rmtf50": {
                "tolerance": float(self.machine_param.get_value("HC_RMTF50_tol")),
                "results": self.collect_csv_results(
                    case_result_dir, baseline_dir,
                    1,
                    float(self.machine_param.get_value("HC_RMTF50_tol")),
                    "HC.RMTF.calc.csv"
                )
            }
        }
        
        # Calculate overall pass/fail
        all_passed = True
        for section_key, section_data in results.items():
            if section_key == "metadata":
                continue
            for item in section_data.get("results", []):
                if not item.get("passed", True):
                    all_passed = False
                    break
            if not all_passed:
                break
        
        results["overall_passed"] = all_passed
        
        return results
    
    def report(self, case_dir, baseline_dir, out_dir):
        """Generate HTML report"""
        case_result_dir = self.combine(case_dir, "3.analysis")
        
        info_file = self.combine(case_dir, "info.txt")
        
        PatientName = ""
        user = ""
        StudyDate = ""
        StudyTime = ""
        SeriesNumber = ""
        
        if os.path.exists(info_file):
            info = Param(info_file)
            PatientName = info.get_value("PatientName")
            if "^" in PatientName:
                user = PatientName.split('^')[0]  # Patient last name is the user initial
            else:
                user = PatientName
            StudyDate = info.get_value("StudyDate")
            StudyTime = info.get_value("StudyTime")
            SeriesNumber = info.get_value("SeriesNumber")
        else:
            PatientName = ""
            user = "NA"
            now = datetime.now()
            StudyDate = now.strftime("%Y%m%d")
            StudyTime = now.strftime("%H%M%S")
            SeriesNumber = ""
        
        # Read template
        html_template_file = self.machine_param.get_value("html_report_template")
        if not os.path.exists(html_template_file):
            self.log_error(f"report template not found: {html_template_file}")
            return
        
        with open(html_template_file, 'r') as f:
            html = f.read()
        
        html = html.replace("{{{date}}}", StudyDate) \
                   .replace("{{{time}}}", StudyTime) \
                   .replace("{{{user}}}", user)
        
        UF_uniformity_tol = float(self.machine_param.get_value("UF.uniformity_tol"))
        HC_RMTF_tol = float(self.machine_param.get_value("HC_RMTF_tol"))
        HC_RMTF50_tol = float(self.machine_param.get_value("HC_RMTF50_tol"))
        
        html = html.replace("{{{HU_tol}}}", self.machine_param.get_value("HU_tol")) \
                   .replace("{{{geo_tol}}}", self.machine_param.get_value("geo_tol")) \
                   .replace("{{{DT_tol}}}", self.machine_param.get_value("DT_tol")) \
                   .replace("{{{UF_tol}}}", self.machine_param.get_value("UF_tol")) \
                   .replace("{{{LC_tol}}}", self.machine_param.get_value("LC_tol")) \
                   .replace("{{{UF.uniformity_tol}}}", self.machine_param.get_value("UF.uniformity_tol")) \
                   .replace("{{{HC_RMTF_tol}}}", self.machine_param.get_value("HC_RMTF_tol")) \
                   .replace("{{{HC_RMTF50_tol}}}", self.machine_param.get_value("HC_RMTF50_tol"))
        
        html = html.replace("{{{HU}}}", self.gen_html_table_rows_from_csv_key(case_result_dir, baseline_dir, "HU", "HU.csv")) \
                   .replace("{{{DT}}}", self.gen_html_table_rows_from_csv_key(case_result_dir, baseline_dir, "DT", "DT.dist.csv")) \
                   .replace("{{{geo}}}", self.gen_html_table_rows_from_csv_key(case_result_dir, baseline_dir, "geo", "geo.dist.csv")) \
                   .replace("{{{UF}}}", self.gen_html_table_rows_from_csv_key(case_result_dir, baseline_dir, "UF", "UF.csv")) \
                   .replace("{{{UF.uniformity}}}", self.gen_html_table_rows_from_csv(case_result_dir, baseline_dir, 1, UF_uniformity_tol, "UF.uniformity.csv", "0.00")) \
                   .replace("{{{LC}}}", self.gen_html_table_rows_from_csv_key(case_result_dir, baseline_dir, "LC", "LC.csv")) \
                   .replace("{{{HC.RMTF}}}", self.gen_html_table_rows_from_csv(case_result_dir, baseline_dir, 15, HC_RMTF_tol, "HC.RMTF.csv", "0.00")) \
                   .replace("{{{HC.RMTF.50}}}", self.gen_html_table_rows_from_csv(case_result_dir, baseline_dir, 1, HC_RMTF50_tol, "HC.RMTF.calc.csv", "0.0"))
        
        # Replace words
        self.log_line("replacing words for report...")
        replace_words = self.machine_param.get_value("replace_words_for_report")
        if replace_words.strip() != "":
            for word in replace_words.split(','):
                word_new = self.machine_param.get_value(word.strip())
                self.log_line(f"{word}->{word_new}...")
                html = html.replace(word.strip(), word_new)
        
        # Save the report
        html_file = self.combine(case_result_dir, "report.html")
        with open(html_file, 'w') as f:
            f.write(html)
        
        self.log_line(f"Report saved to: {html_file}")
        
        # Save analysis results to JSON
        result_json = self.collect_analysis_results(case_result_dir, baseline_dir, StudyDate, StudyTime, user)
        json_file = self.combine(case_result_dir, "analysis_results.json")
        import json
        with open(json_file, 'w') as f:
            json.dump(result_json, f, indent=2)
        
        self.log_line(f"Analysis results JSON saved to: {json_file}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="CTQA - CT Quality Assurance Processing")
    parser.add_argument("case_dir", help="Directory containing CT DICOM files or CT.mhd")
    parser.add_argument("--machine-param", help="Path to machine parameter file", required=True)
    parser.add_argument("--service-param", help="Path to service parameter file", required=True)
    
    args = parser.parse_args()
    
    ctqa = CTQA(machine_param_file=args.machine_param, service_param_file=args.service_param)
    ctqa.run(args.case_dir)
