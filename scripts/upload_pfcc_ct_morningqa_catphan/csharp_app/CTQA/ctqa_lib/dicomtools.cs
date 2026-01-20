using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ctqa_lib
{
    public static class dicomtools
    {
        public static void sort_files_by_patient_study_series(string dir_in, string dir_out, string delete_source_files)
        {
            string dicomtools_dir = global_variables.service_param.get_value("dicomtools_dir");

            string cmd = string.Format("{0}\\sort_files_by_patient_study_series.exe \"{1}\" \"{2}\" {3}", dicomtools_dir, dir_in, dir_out, delete_source_files);
            global_variables.run_cmd(cmd);

            //if (!System.IO.File.Exists(out_txt))
            //{
            //    global_variables.log_error("calc_image_min_max_mean_std_2d_f() failed. output file not found.");
            //}
        }

        public static void dicom_series_to_mhd(string dir_in, string dir_out)
        {
            string dicomtools_dir = global_variables.service_param.get_value("dicomtools_dir");

            string cmd = string.Format("{0}\\dicom_series_to_mhd.exe \"{1}\" \"{2}\"", dicomtools_dir, dir_in, dir_out);
            global_variables.run_cmd(cmd);

            //if (!System.IO.File.Exists(out_txt))
            //{
            //    global_variables.log_error("calc_image_min_max_mean_std_2d_f() failed. output file not found.");
            //}
        }
        

    }
}
