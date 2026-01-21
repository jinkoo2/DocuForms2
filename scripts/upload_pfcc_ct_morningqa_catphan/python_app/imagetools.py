#!/usr/bin/env python3
"""
Image processing tools for 3D medical images
"""

import os
import re
import logging
import numpy as np
import SimpleITK as sitk


def calc_image_min_max_mean_std_3d_f(img_in, mask, out_txt):
    """
    Calculate min, max, mean, and std of image within mask using SimpleITK
    
    Args:
        img_in: Path to input image
        mask: Path to mask image
        out_txt: Path to output text file
    """
    logging.info(f"Calculating image statistics: {img_in} with mask {mask}")
    
    # Read images
    image = sitk.ReadImage(img_in)
    mask_img = sitk.ReadImage(mask)
    
    # Convert to numpy arrays
    image_array = sitk.GetArrayFromImage(image)
    mask_array = sitk.GetArrayFromImage(mask_img)
    
    # Ensure same shape
    if image_array.shape != mask_array.shape:
        mask_img_resampled = sitk.Resample(mask_img, image)
        mask_array = sitk.GetArrayFromImage(mask_img_resampled)
    
    # Apply mask
    masked_values = image_array[mask_array > 0.5]
    
    if len(masked_values) == 0:
        logging.warning("No pixels in mask!")
        min_val = max_val = mean_val = std_val = 0.0
    else:
        min_val = float(np.min(masked_values))
        max_val = float(np.max(masked_values))
        mean_val = float(np.mean(masked_values))
        std_val = float(np.std(masked_values))
    
    # Write output file
    with open(out_txt, 'w') as f:
        f.write(f"min={min_val}\n")
        f.write(f"max={max_val}\n")
        f.write(f"mean={mean_val}\n")
        f.write(f"std={std_val}\n")
    
    logging.info(f"Statistics saved to {out_txt}")


def calc_bounding_box_3d(img_in, out_txt):
    """
    Calculate bounding box of image using SimpleITK
    
    Args:
        img_in: Path to input image
        out_txt: Path to output text file
    """
    logging.info(f"Calculating bounding box: {img_in}")
    
    image = sitk.ReadImage(img_in)
    image_array = sitk.GetArrayFromImage(image)
    
    # Find non-zero region
    non_zero_indices = np.nonzero(image_array)
    
    if len(non_zero_indices[0]) == 0:
        logging.warning("Image is empty!")
        bbox = [0, 0, 0, image_array.shape[2], image_array.shape[1], image_array.shape[0]]
    else:
        z_min, z_max = np.min(non_zero_indices[0]), np.max(non_zero_indices[0])
        y_min, y_max = np.min(non_zero_indices[1]), np.max(non_zero_indices[1])
        x_min, x_max = np.min(non_zero_indices[2]), np.max(non_zero_indices[2])
        
        bbox = [x_min, y_min, z_min, x_max + 1, y_max + 1, z_max + 1]
    
    # Write output (convert numpy types to native Python types)
    bbox_python = [int(x) for x in bbox]
    with open(out_txt, 'w') as f:
        f.write(f"bounding_box={bbox_python}\n")
    
    logging.info(f"Bounding box saved to {out_txt}")


def crop_3d_boundingbox_f(img_in, boundingbox_txt, img_out):
    """
    Crop image to bounding box using SimpleITK
    
    Args:
        img_in: Path to input image
        boundingbox_txt: Path to bounding box text file
        img_out: Path to output image
    """
    logging.info(f"Cropping image: {img_in} -> {img_out}")
    
    # Read bounding box
    bbox = None
    with open(boundingbox_txt, 'r') as f:
        for line in f:
            if line.startswith("bounding_box="):
                bbox_str = line.split("=", 1)[1].strip()
                # Parse [x_min, y_min, z_min, x_max, y_max, z_max]
                # Handle both formats: [1, 2, 3] and [np.int64(1), np.int64(2), ...]
                bbox_str = bbox_str.strip('[]')
                
                # Try to parse as simple numbers first
                try:
                    bbox = [float(x.strip()) for x in bbox_str.split(',') if x.strip()]
                except ValueError:
                    # If that fails, try to extract numbers from np.int64(...) format
                    numbers = re.findall(r'\d+', bbox_str)
                    if len(numbers) == 6:
                        bbox = [float(x) for x in numbers]
                    else:
                        raise Exception(f"Could not parse bounding box values from: {bbox_str}")
    
    if bbox is None or len(bbox) != 6:
        raise Exception(f"Could not parse bounding box file. Expected 6 values, got: {bbox}")
    
    x_min, y_min, z_min, x_max, y_max, z_max = [int(x) for x in bbox]
    
    # Read image
    image = sitk.ReadImage(img_in)
    
    # Get image size
    size = image.GetSize()
    
    # Clamp bounding box to image size
    x_min = max(0, min(int(x_min), size[0] - 1))
    y_min = max(0, min(int(y_min), size[1] - 1))
    z_min = max(0, min(int(z_min), size[2] - 1))
    x_max = max(x_min + 1, min(int(x_max), size[0]))
    y_max = max(y_min + 1, min(int(y_max), size[1]))
    z_max = max(z_min + 1, min(int(z_max), size[2]))
    
    # Calculate crop size
    crop_size = [x_max - x_min, y_max - y_min, z_max - z_min]
    crop_index = [x_min, y_min, z_min]
    
    # Use ExtractImageFilter for cropping (more reliable than array slicing)
    extract_filter = sitk.ExtractImageFilter()
    extract_filter.SetSize(crop_size)
    extract_filter.SetIndex(crop_index)
    cropped = extract_filter.Execute(image)
    
    # Write output
    sitk.WriteImage(cropped, img_out)
    
    logging.info(f"Cropped image saved to {img_out}")


def threshold_3d_f(img_in, level0, th, level1, img_out):
    """
    Threshold image: values < th become level0, values >= th become level1
    
    Args:
        img_in: Path to input image
        level0: Value for pixels below threshold
        th: Threshold value
        level1: Value for pixels at or above threshold
        img_out: Path to output image
    """
    logging.info(f"Thresholding image: {img_in} -> {img_out}")
    
    image = sitk.ReadImage(img_in)
    image_array = sitk.GetArrayFromImage(image)
    
    # Apply threshold
    thresholded = np.where(image_array < th, level0, level1)
    
    # Create output image
    output = sitk.GetImageFromArray(thresholded)
    output.CopyInformation(image)
    
    # Write output
    sitk.WriteImage(output, img_out)
    
    logging.info(f"Thresholded image saved to {img_out}")


def cast_to_uchar_3d_f(img_in, img_out):
    """
    Cast image to unsigned char (0-255) using SimpleITK
    
    Rounds each pixel value to the nearest integer and clips to [0, 255] range.
    Does not normalize pixel values.
    
    Args:
        img_in: Path to input image
        img_out: Path to output image
    """
    logging.info(f"Casting to uchar: {img_in} -> {img_out}")
    
    image = sitk.ReadImage(img_in)
    image_array = sitk.GetArrayFromImage(image)
    
    # Round to nearest integer and clip to [0, 255] range
    rounded = np.round(image_array)
    uchar_array = np.clip(rounded, 0, 255).astype(np.uint8)
    
    # Create output image
    output = sitk.GetImageFromArray(uchar_array)
    output.CopyInformation(image)
    
    # Write output
    sitk.WriteImage(output, img_out)
    
    logging.info(f"Uchar image saved to {img_out}")


def calc_image_moments_3d_f(img_in, out_txt):
    """
    Calculate image moments (including center of gravity) using SimpleITK
    
    Args:
        img_in: Path to input image
        out_txt: Path to output text file
    """
    logging.info(f"Calculating image moments: {img_in}")
    
    image = sitk.ReadImage(img_in)
    image_array = sitk.GetArrayFromImage(image)
    
    # Get image spacing and origin
    spacing = image.GetSpacing()
    origin = image.GetOrigin()
    
    # Calculate moments
    # For 3D: indices are (z, y, x)
    total_mass = np.sum(image_array)
    
    if total_mass == 0:
        logging.warning("Image has zero mass!")
        cog = [0.0, 0.0, 0.0]
    else:
        # Calculate center of gravity in pixel coordinates
        z_coords, y_coords, x_coords = np.meshgrid(
            np.arange(image_array.shape[0]),
            np.arange(image_array.shape[1]),
            np.arange(image_array.shape[2]),
            indexing='ij'
        )
        
        cog_z = np.sum(z_coords * image_array) / total_mass
        cog_y = np.sum(y_coords * image_array) / total_mass
        cog_x = np.sum(x_coords * image_array) / total_mass
        
        # Convert to physical coordinates
        cog = [
            origin[0] + cog_x * spacing[0],
            origin[1] + cog_y * spacing[1],
            origin[2] + cog_z * spacing[2]
        ]
    
    # Write output
    with open(out_txt, 'w') as f:
        f.write(f"Center of gravity=[{cog[0]}, {cog[1]}, {cog[2]}]\n")
        f.write(f"Total mass={total_mass}\n")
    
    logging.info(f"Moments saved to {out_txt}")
