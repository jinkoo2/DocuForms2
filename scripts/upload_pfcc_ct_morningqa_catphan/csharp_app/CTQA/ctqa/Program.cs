using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ctqa
{
    class Program
    {
        static void Main(string[] args)
        {
            if(args.Length !=2)
            {
                Console.WriteLine("USAGE: ctqa_cmd.exe case_dir param_file");
                return;
            }

            //string case_dir = args[0];

            /////////////////
            // command line
            if (false)
            {
                //string machine_param_file = @"W:\RadOnc\Planning\Physics QA\CTQA\TrueBeamSH\param.txt";
                //string service_param_file = @"W:\RadOnc\Planning\Physics QA\CTQA\param.txt";
                ////string case_dir = @"W:\RadOnc\Planning\Physics QA\CTQA\TrueBeamSH\cases\20190529_000000";
                ////string case_dir = @"W:\RadOnc\Planning\Physics QA\CTQA\CATPHAN604\TrueBeamSH\cases\20191025_000000";
                //string case_dir = @"W:\RadOnc\Planning\Physics QA\CTQA\CATPHAN604\TrueBeamSH\cases\20200106_000000";

                //(new ctqa_lib.app()).run(case_dir, service_param_file, machine_param_file);
            }
            else
            {
                //////////////////////
                // watcher
                //string param_file = @"\\uhmc-fs-share\shares\RadOnc\Applications\Morning QA\CTQA\param.txt";
                string param_file = @"\\uhmc-fs-share\shares\RadOnc\Applications\Morning QA\CTQA\param_rophysicsqa.txt";
                ctqa_lib.fswatcher watcher = new ctqa_lib.fswatcher(param_file);
                Console.WriteLine("Hit Enter to quit...");
                Console.ReadLine();
            }
        }
    }
}
