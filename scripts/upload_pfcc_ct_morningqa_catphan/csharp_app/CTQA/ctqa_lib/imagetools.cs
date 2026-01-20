using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ctqa_lib
{
    public static class imagetools
    {
        public static void calc_image_min_max_mean_std_3d_f(string img_in, string mask, string out_txt)
        {
            string image_tools_dir = global_variables.service_param.get_value("imagetools_3d_dir");

            string cmd = string.Format("{0}\\calc_image_min_max_mean_std_3d_f.exe \"{1}\" \"{2}\" \"{3}\"", image_tools_dir, img_in, mask, out_txt);
            global_variables.run_cmd(cmd);

            if (!System.IO.File.Exists(out_txt))
            {
                global_variables.log_error("calc_image_min_max_mean_std_2d_f() failed. output file not found.");
            }
        }

        public static void calc_bounding_box_3d(string img_in, string out_txt)
        {
            string image_tools_dir = global_variables.service_param.get_value("imagetools_3d_dir");

            string cmd = string.Format("{0}\\calc_bounding_box_3d.exe \"{1}\" \"{2}\"", image_tools_dir, img_in, out_txt);
            global_variables.run_cmd(cmd);

            if (!System.IO.File.Exists(out_txt))
            {
                global_variables.log_error("calc_bounding_box_3d() failed. output file not found.");
            }
        }

        public static void crop_3d_boundingbox_f(string img_in, string boundingbox_txt, string img_out)
        {
            string image_tools_dir = global_variables.service_param.get_value("imagetools_3d_dir");

            string cmd = string.Format("{0}\\crop_3d_boundingbox_f.exe \"{1}\" \"{2}\" \"{3}\"", image_tools_dir, img_in, boundingbox_txt, img_out);
            global_variables.run_cmd(cmd);

            if (!System.IO.File.Exists(img_out))
            {
                global_variables.log_error("crop_3d_boundingbox_f() failed. output file not found.");
            }
        }

        public static void mult_const_3d_f(string img_in, double factor, string img_out)
        {
            string image_tools_dir = global_variables.service_param.get_value("imagetools_3d_dir");

            string cmd = string.Format("{0}\\mult_const_3d_f.exe \"{1}\" {2} \"{3}\"", image_tools_dir, img_in, factor, img_out);
            global_variables.run_cmd(cmd);

            if (!System.IO.File.Exists(img_out))
            {
                global_variables.log_error("mult_const_3d_f() failed. output file not found.");
            }
        }

        public static void calc_image_moments_3d_f(string img_in, string out_txt)
        {
            string image_tools_dir = global_variables.service_param.get_value("imagetools_3d_dir");

            string cmd = string.Format("{0}\\calc_image_moments_3d_f.exe \"{1}\" \"{2}\"", image_tools_dir, img_in, out_txt);
            global_variables.run_cmd(cmd);

            if (!System.IO.File.Exists(out_txt))
            {
                global_variables.log_error("calc_image_moments_3d_f() failed. output file not found.");
            }
        }

        public static void threshold_3d_f(string img_in, double level0, double th, double level1, string img_out)
        {
            string image_tools_dir = global_variables.service_param.get_value("imagetools_3d_dir");

            string cmd = string.Format("{0}\\threshold_3d_f.exe \"{1}\" {2} {3} {4} \"{5}\"", image_tools_dir, img_in, level0, th, level1, img_out);
            global_variables.run_cmd(cmd);

            if (!System.IO.File.Exists(img_out))
            {
                global_variables.log_error("threshold_3d_f() failed. output file not found.");
            }
        }

        public static void cast_to_uchar_3d_f(string img_in, string img_out)
        {
            string image_tools_dir = global_variables.service_param.get_value("imagetools_3d_dir");

            string cmd = string.Format("{0}\\cast_to_uchar_3d_f.exe \"{1}\" \"{2}\"", image_tools_dir, img_in, img_out);
            global_variables.run_cmd(cmd);

            if (!System.IO.File.Exists(img_out))
            {
                global_variables.log_error("cast_to_uchar_3d_f() failed. output file not found.");
            }
        }


        









    }
}
