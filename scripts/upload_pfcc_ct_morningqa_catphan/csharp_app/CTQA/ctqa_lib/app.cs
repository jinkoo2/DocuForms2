using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ctqa_lib
{
    public class app
    {
        public void run(string case_dir, string service_param_file, string machine_param_file)
        {
            // load param file
            global_variables.service_param = new param(service_param_file);
            global_variables.machine_param = new param(machine_param_file);

            global_variables.log_path = global_variables.log_path = global_variables.service_param.get_value("log_path");
            
            ctqa_lib.ctqa qa = new ctqa();
            qa.run(case_dir);
        }
        
    }
}
