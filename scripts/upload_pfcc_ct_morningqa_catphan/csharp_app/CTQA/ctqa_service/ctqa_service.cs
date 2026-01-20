using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Linq;
using System.ServiceProcess;
using System.Text;
using System.Threading.Tasks;

namespace ctqa_service
{
    public partial class ctqa_service : ServiceBase
    {
        public ctqa_service()
        {
            InitializeComponent();
        }

        protected override void OnStart(string[] args)
        {
            var appSettings = System.Configuration.ConfigurationManager.AppSettings;
            
            string service_param_file = appSettings["service_param_file"];
            
            //////////////////////
            // watcher
            ctqa_lib.fswatcher watcher = new ctqa_lib.fswatcher(service_param_file);
        }

        protected override void OnStop()
        {
        }
    }
}
