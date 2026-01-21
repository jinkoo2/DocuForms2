#!/usr/bin/env python3
"""
Parameter file reader - reads key=value configuration files
"""

import os


class Param:
    """Simple parameter file reader"""
    
    def __init__(self, param_file):
        """
        Initialize parameter reader
        
        Args:
            param_file: Path to parameter file (key=value format)
        """
        self._file = param_file
        self._params = {}
        
        if param_file and os.path.exists(param_file):
            self._load_params()
    
    def _load_params(self):
        """Load parameters from file"""
        with open(self._file, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                if '=' in line:
                    parts = line.split('=', 1)
                    if len(parts) == 2:
                        key = parts[0].strip().lower()
                        value = parts[1].strip()
                        self._params[key] = value
    
    def get_value(self, key):
        """
        Get parameter value
        
        Args:
            key: Parameter key (case-insensitive)
            
        Returns:
            Parameter value or empty string if not found
        """
        return self._params.get(key.lower(), "")
    
    def get_value_as_array(self, key):
        """
        Get parameter value as array (comma-separated)
        
        Args:
            key: Parameter key (case-insensitive)
            
        Returns:
            List of values
        """
        value = self.get_value(key)
        if not value:
            return []
        return [v.strip() for v in value.split(',') if v.strip()]
