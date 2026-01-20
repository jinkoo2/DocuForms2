using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ctqa_lib
{
    class etx
    {
        public static string elastix(string f, string fMask, string m, string mMask, string out_dir, string[] param_files)
        {
            string elastix_dir = global_variables.service_param.get_value("elastix_dir");

            if (param_files.Length == 0)
                throw new Exception("At least one param file is required");

            if(!System.IO.Directory.Exists(out_dir))
            {
                System.IO.Directory.CreateDirectory(out_dir);
            }

            string fMask_arg = "";
            if(fMask.Trim()!="")
            {
                fMask_arg = string.Format("-fMask \"{0}\"", fMask);
            }

            string mMask_arg = "";
            if (mMask.Trim() != "")
            {
                mMask_arg = string.Format("-mMask \"{0}\"", mMask);
            }
            
            string param_args = "";
            foreach (string param_file in param_files)
                param_args += string.Format(" -p \"{0}\"", param_file);

            string cmd = string.Format("{0}\\elastix.exe -f \"{1}\" {2} -m \"{3}\" {4} -out \"{5}\" {6}", elastix_dir, f, fMask_arg, m, mMask_arg, out_dir, param_args);
            global_variables.run_cmd(cmd);

            // look at the log file and see if there were any error
            string log_file = System.IO.Path.Combine(out_dir, "elastix.log");
            if (!System.IO.File.Exists(log_file))
                global_variables.log_error("Something went wrong... cannot find the elaxtix log file..." + log_file);
            //string log = System.IO.File.ReadAllText(log_file);
            //if(log.ToLower().Contains("error"))
            //{
            //    global_variables.log_error("Something went wrong... it seems like there was some error... check the log_file!" + log_file);
            //}

            string out_tf = global_variables.combine(out_dir, string.Format("TransformParameters.{0}.txt", param_files.Length-1));
            if(!System.IO.File.Exists(out_tf))
            {
                global_variables.log_error("Output transformation file not found! - " + out_tf);
            }

            return out_tf;
        }

        public static string  transformix(string m, string out_dir, string tranform_param)
        {
            string elastix_dir = global_variables.service_param.get_value("elastix_dir");

            if (!System.IO.Directory.Exists(out_dir))
                System.IO.Directory.CreateDirectory(out_dir);

            string cmd = string.Format("{0}\\transformix.exe -in \"{1}\" -out \"{2}\" -tp \"{3}\"", elastix_dir, m, out_dir, tranform_param);
            global_variables.run_cmd(cmd);

            // look at the log file and see if there were any error
            string log_file = System.IO.Path.Combine(out_dir, "transformix.log");
            if (!System.IO.File.Exists(log_file))
                global_variables.log_error("Something went wrong... cannot find the transformix log file..." + log_file);
            //string log = System.IO.File.ReadAllText(log_file);
            //if (log.ToLower().Contains("error"))
            //{
            //    global_variables.log_error("Something went wrong... it seems like there was some error... check the log_file!" + log_file);
            //}

            string out_img = global_variables.combine(out_dir, "result.mha");
            if (!System.IO.File.Exists(out_img))
            {
                global_variables.log_error("Output image file not found! - " + out_img);
            }

            return out_img;
        }

    }
}
