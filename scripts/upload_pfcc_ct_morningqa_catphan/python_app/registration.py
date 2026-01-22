#!/usr/bin/env python3
"""
Image registration using SimpleITK rigid body registration
"""

import os
import csv
import logging
import numpy as np
import SimpleITK as sitk
from param import Param


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


def rigid_body_registration(fixed_image, fixed_mask, moving_image, moving_mask, out_dir, param_files=None, param=None):
    """
    Perform rigid body registration using SimpleITK
    
    Registers the moving image (baseline CT) to the fixed image (case CT) using
    a rigid body transform (translation + rotation).
    
    Args:
        fixed_image: Path to fixed image (case CT)
        moving_image: Path to moving image (baseline CT)
        fixed_mask: Path to fixed mask (optional, empty string if not used)
        moving_mask: Path to moving mask (optional, empty string if not used)
        out_dir: Output directory for registration results
        param_files: List of parameter file paths (kept for compatibility, not used)
        param: Param object or path to param.txt file (optional, for reading registration parameters)
        
    Returns:
        Path to transform file (saved as TransformParameters.0.txt for compatibility)
    """
    logging.info(f"Running SimpleITK rigid body registration...")
    logging.info(f"Fixed: {fixed_image}")
    logging.info(f"Moving: {moving_image}")
    logging.info(f"Output: {out_dir}")
    
    os.makedirs(out_dir, exist_ok=True)
    
    # Read images
    fixed = sitk.ReadImage(fixed_image)
    moving = sitk.ReadImage(moving_image)
    
    # Convert images to float type if needed (SimpleITK registration requires float)
    fixed_pixel_type = fixed.GetPixelID()
    moving_pixel_type = moving.GetPixelID()
    
    # Check if conversion is needed (registration works best with float32)
    if fixed_pixel_type != sitk.sitkFloat32:
        logging.info(f"Converting fixed image from {sitk.GetPixelIDValueAsString(fixed_pixel_type)} to Float32")
        fixed = sitk.Cast(fixed, sitk.sitkFloat32)
    
    if moving_pixel_type != sitk.sitkFloat32:
        logging.info(f"Converting moving image from {sitk.GetPixelIDValueAsString(moving_pixel_type)} to Float32")
        moving = sitk.Cast(moving, sitk.sitkFloat32)
    
    # Read masks if provided
    fixed_mask_img = None
    moving_mask_img = None
    if fixed_mask and fixed_mask.strip() and os.path.exists(fixed_mask):
        fixed_mask_img = sitk.ReadImage(fixed_mask)
        # Ensure mask is same size/spacing as fixed image
        if fixed_mask_img.GetSpacing() != fixed.GetSpacing() or \
           fixed_mask_img.GetOrigin() != fixed.GetOrigin() or \
           fixed_mask_img.GetSize() != fixed.GetSize():
            fixed_mask_img = sitk.Resample(fixed_mask_img, fixed, sitk.Transform(), 
                                          sitk.sitkNearestNeighbor, 0.0, fixed_mask_img.GetPixelID())
        logging.info(f"Using fixed mask: {fixed_mask}")
    if moving_mask and moving_mask.strip() and os.path.exists(moving_mask):
        moving_mask_img = sitk.ReadImage(moving_mask)
        # Ensure mask is same size/spacing as moving image
        if moving_mask_img.GetSpacing() != moving.GetSpacing() or \
           moving_mask_img.GetOrigin() != moving.GetOrigin() or \
           moving_mask_img.GetSize() != moving.GetSize():
            moving_mask_img = sitk.Resample(moving_mask_img, moving, sitk.Transform(),
                                          sitk.sitkNearestNeighbor, 0.0, moving_mask_img.GetPixelID())
        logging.info(f"Using moving mask: {moving_mask}")
    
    # Initialize registration
    registration_method = sitk.ImageRegistrationMethod()
    
    # Set similarity metric (Mutual Information works well for CT images)
    registration_method.SetMetricAsMattesMutualInformation(numberOfHistogramBins=50)
    
    # Set interpolator
    registration_method.SetInterpolator(sitk.sitkLinear)
    
    # Read registration parameters from param file if provided
    if param is None:
        # Use default values
        learningRate = 1.0
        numberOfIterations = 200
        convergenceMinimumValue = 1e-6
        convergenceWindowSize = 10
    else:
        # Load param if it's a file path
        if isinstance(param, str):
            param_obj = Param(param)
        else:
            param_obj = param
        
        # Read parameters with defaults (get_value returns empty string if not found)
        learningRate_str = param_obj.get_value("registration_learningRate")
        learningRate = float(learningRate_str) if learningRate_str else 1.0
        
        numberOfIterations_str = param_obj.get_value("registration_numberOfIterations")
        numberOfIterations = int(numberOfIterations_str) if numberOfIterations_str else 200
        
        convergenceMinimumValue_str = param_obj.get_value("registration_convergenceMinimumValue")
        convergenceMinimumValue = float(convergenceMinimumValue_str) if convergenceMinimumValue_str else 1e-6
        
        convergenceWindowSize_str = param_obj.get_value("registration_convergenceWindowSize")
        convergenceWindowSize = int(convergenceWindowSize_str) if convergenceWindowSize_str else 10
        
        logging.info(f"Registration parameters from param file: learningRate={learningRate}, "
                    f"numberOfIterations={numberOfIterations}, convergenceMinimumValue={convergenceMinimumValue}, "
                    f"convergenceWindowSize={convergenceWindowSize}")
    
    # Set optimizer (gradient descent)
    registration_method.SetOptimizerAsGradientDescent(
        learningRate=learningRate,
        numberOfIterations=numberOfIterations,
        convergenceMinimumValue=convergenceMinimumValue,
        convergenceWindowSize=convergenceWindowSize
    )
    registration_method.SetOptimizerScalesFromPhysicalShift()
    
    # Set initial transform (rigid body - translation + rotation)
    initial_transform = sitk.CenteredTransformInitializer(
        fixed,
        moving,
        sitk.Euler3DTransform(),
        sitk.CenteredTransformInitializerFilter.GEOMETRY
    )
    registration_method.SetInitialTransform(initial_transform, inPlace=False)
    
    # Set masks if provided (SimpleITK supports masks!)
    # Note: Masks are already resampled above if needed
    if fixed_mask_img is not None:
        registration_method.SetMetricFixedMask(fixed_mask_img)
        logging.info("Fixed mask applied to registration")
    
    if moving_mask_img is not None:
        registration_method.SetMetricMovingMask(moving_mask_img)
        logging.info("Moving mask applied to registration")
    
    # Setup optimization tracking
    optimization_csv = os.path.join(out_dir, "optimization.csv")
    iteration_data = []
    iteration_count = [0]  # Use list to allow modification in nested function
    
    def iteration_callback():
        """Callback function called at each optimization iteration"""
        iteration_count[0] += 1
        current_iteration = iteration_count[0]
        metric_value = registration_method.GetMetricValue()
        
        # Store iteration data
        iteration_data.append({
            'iteration': current_iteration,
            'cost_function': metric_value
        })
        
        # Print progress
        print(f"  Iteration {current_iteration:3d}: Cost function = {metric_value:.6f}", flush=True)
        logging.info(f"Iteration {current_iteration}: Cost function = {metric_value:.6f}")
    
    # Add command observer to track iterations
    registration_method.AddCommand(sitk.sitkIterationEvent, iteration_callback)
    
    # Set multi-resolution approach for faster registration
    # Start at 1/4 resolution, then 1/2, then full resolution
    registration_method.SetShrinkFactorsPerLevel(shrinkFactors=[4, 2, 1])
    registration_method.SetSmoothingSigmasPerLevel(smoothingSigmas=[2, 1, 0])
    registration_method.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()
    logging.info("Multi-resolution registration enabled: [4x, 2x, 1x] shrink factors")
    
    # Execute registration
    logging.info("Starting registration optimization...")
    print("Starting registration optimization...", flush=True)
    final_transform = registration_method.Execute(fixed, moving)
    
    # Save optimization data to CSV
    if iteration_data:
        with open(optimization_csv, 'w', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=['iteration', 'cost_function'])
            writer.writeheader()
            writer.writerows(iteration_data)
        logging.info(f"Optimization data saved to: {optimization_csv}")
        print(f"Optimization data saved to: {optimization_csv}", flush=True)
    
    # Get final metric value
    final_metric_value = registration_method.GetMetricValue()
    logging.info(f"Registration completed. Final metric value: {final_metric_value:.6f}")
    
    # Apply transform to moving image to create result
    resampler = sitk.ResampleImageFilter()
    resampler.SetReferenceImage(fixed)
    resampler.SetInterpolator(sitk.sitkLinear)
    resampler.SetDefaultPixelValue(0)
    resampler.SetTransform(final_transform)
    
    result = resampler.Execute(moving)
    
    # Write result image (float) with compression
    result_file = os.path.join(out_dir, "result.mhd")
    write_mhd_compressed(result, result_file)
    logging.info(f"Registered image saved: {result_file} (compressed)")
    
    # Save resampled image as int pixel type for review
    # Determine appropriate integer type based on image value range
    result_array = sitk.GetArrayFromImage(result)
    min_val = float(np.min(result_array))
    max_val = float(np.max(result_array))
    
    # Choose appropriate integer type
    if min_val >= -32768 and max_val <= 32767:
        pixel_type = sitk.sitkInt16
    elif min_val >= 0 and max_val <= 65535:
        pixel_type = sitk.sitkUInt16
    else:
        pixel_type = sitk.sitkInt32
    
    # Cast to integer type
    result_int = sitk.Cast(result, pixel_type)
    
    # Write resampled image
    resampled_file = os.path.join(out_dir, "resampled.mha")
    sitk.WriteImage(result_int, resampled_file)
    logging.info(f"Resampled image (int) saved: {resampled_file}")
    
    # Save transform for later use (compatible with apply_transform function)
    transform_params_file = os.path.join(out_dir, "TransformParameters.0.txt")
    
    # Save transform as SimpleITK transform file
    sitk.WriteTransform(final_transform, transform_params_file.replace('.txt', '.tfm'))
    
    # Also save in a text format for compatibility
    # Extract transform parameters
    # Handle CompositeTransform (SimpleITK may wrap the transform)
    actual_transform = final_transform
    if hasattr(final_transform, 'GetNumberOfTransforms') and final_transform.GetNumberOfTransforms() > 0:
        # Extract the first transform from CompositeTransform
        actual_transform = final_transform.GetNthTransform(0)
        logging.info(f"Extracted transform from CompositeTransform: {type(actual_transform).__name__}")
    
    transform_params = actual_transform.GetParameters()
    
    # Get center if available (not all transforms have GetCenter)
    transform_center = None
    if hasattr(actual_transform, 'GetCenter'):
        transform_center = actual_transform.GetCenter()
    elif hasattr(actual_transform, 'GetFixedParameters'):
        # Some transforms store center in fixed parameters
        fixed_params = actual_transform.GetFixedParameters()
        if len(fixed_params) >= 3:
            transform_center = tuple(fixed_params[:3])
    
    # Write a simple text file with transform info
    with open(transform_params_file, 'w') as f:
        f.write(f"# SimpleITK Rigid Body Transform\n")
        f.write(f"# Transform type: {type(actual_transform).__name__}\n")
        f.write(f"# Parameters (rotation_x, rotation_y, rotation_z, translation_x, translation_y, translation_z):\n")
        f.write(f"Parameters = {transform_params}\n")
        if transform_center is not None:
            f.write(f"# Center:\n")
            f.write(f"Center = {transform_center}\n")
        f.write(f"# Fixed image path: {fixed_image}\n")
        f.write(f"# Moving image path: {moving_image}\n")
        f.write(f"# Final metric value: {final_metric_value:.6f}\n")
    
    logging.info(f"Transform parameters saved: {transform_params_file}")
    return transform_params_file


def apply_transform(input_image, out_dir, transform_param, fixed_image_path=None):
    """
    Apply transformation to an image using SimpleITK
    
    Transforms an image (typically a mask) using a previously computed registration transform.
    The output is resampled to match the fixed image space.
    
    Args:
        input_image: Path to input image to transform (mask from baseline)
        out_dir: Output directory
        transform_param: Path to transform parameters file (from registration)
        fixed_image_path: Optional path to fixed image (case CT) for reference space
        
    Returns:
        Path to transformed image
    """
    logging.info(f"Applying transformation using SimpleITK...")
    logging.info(f"Input: {input_image}")
    logging.info(f"Transform: {transform_param}")
    logging.info(f"Output: {out_dir}")
    
    os.makedirs(out_dir, exist_ok=True)
    
    # Read input image (mask to transform)
    image = sitk.ReadImage(input_image)
    
    # Try to read transform from .tfm file first (SimpleITK native format)
    transform_file = transform_param.replace('.txt', '.tfm')
    transform = None
    
    if os.path.exists(transform_file):
        try:
            transform = sitk.ReadTransform(transform_file)
            logging.info(f"Loaded transform from: {transform_file}")
            
            # Handle CompositeTransform - extract the actual transform
            if hasattr(transform, 'GetNumberOfTransforms') and transform.GetNumberOfTransforms() > 0:
                transform = transform.GetNthTransform(0)
                logging.info(f"Extracted transform from CompositeTransform: {type(transform).__name__}")
        except Exception as e:
            logging.warning(f"Could not read .tfm file: {e}")
    
    # If .tfm not available, try to read from TransformParameters file
    if transform is None:
        # The transform should be in the same directory as TransformParameters
        transform_dir = os.path.dirname(transform_param)
        transform_file = os.path.join(transform_dir, "TransformParameters.0.tfm")
        
        if os.path.exists(transform_file):
            try:
                transform = sitk.ReadTransform(transform_file)
                logging.info(f"Loaded transform from: {transform_file}")
                
                # Handle CompositeTransform - extract the actual transform
                if hasattr(transform, 'GetNumberOfTransforms') and transform.GetNumberOfTransforms() > 0:
                    transform = transform.GetNthTransform(0)
                    logging.info(f"Extracted transform from CompositeTransform: {type(transform).__name__}")
            except Exception as e:
                logging.warning(f"Could not read transform file: {e}")
    
    if transform is None:
        raise Exception(f"Could not load transform from {transform_param} or {transform_file}")
    
    # Get reference image (fixed image) - this is the case CT image
    # We need to resample masks to match the fixed image space
    if fixed_image_path is None:
        # Try to find fixed image from registration directory structure
        transform_dir = os.path.dirname(transform_param)
        # Registration output is in case_dir/1.reg, fixed image is in case_dir/CT.mhd
        fixed_image_path = os.path.join(transform_dir, "..", "CT.mhd")
        fixed_image_path = os.path.normpath(fixed_image_path)
    
    if os.path.exists(fixed_image_path):
        fixed_image = sitk.ReadImage(fixed_image_path)
        logging.info(f"Using fixed image as reference: {fixed_image_path}")
    else:
        raise Exception(f"Fixed image not found: {fixed_image_path}. Cannot resample mask without reference image.")
    
    # Create resampler
    resampler = sitk.ResampleImageFilter()
    resampler.SetReferenceImage(fixed_image)
    # Use nearest neighbor interpolation for binary masks to preserve values
    resampler.SetInterpolator(sitk.sitkNearestNeighbor)
    resampler.SetDefaultPixelValue(0)
    resampler.SetTransform(transform)
    
    # Execute transformation
    result = resampler.Execute(image)
    
    # Write result
    result_file = os.path.join(out_dir, "result.mha")
    sitk.WriteImage(result, result_file)
    
    logging.info(f"Transformation completed. Result: {result_file}")
    return result_file



