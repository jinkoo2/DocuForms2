using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Diagnostics;
using System.Threading;
using System.IO;

namespace ctqa_lib
{
    public static class global_variables
    {

        public static param service_param = null;

        //public static string param_file = "";
        public static param machine_param = null;

        public static string log_file
        {
            get
            {
                if (log_filename == "")
                {
                    log_filename = string.Format("log_{0:D4}{1:D2}{2:D2}_{3:D2}{4:D2}{5:D2}.txt",
                        DateTime.Now.Year,
                        DateTime.Now.Month,
                        DateTime.Now.Day,
                        DateTime.Now.Hour,
                        DateTime.Now.Minute,
                        DateTime.Now.Second);
                }

                return log_path + "\\" + log_filename;
            }
        }
        private static string _log_path = "";
        public static string log_path
        {
            get
            {
                return _log_path;
            }

            set
            {
                _log_path = value;

                if (!System.IO.Directory.Exists(_log_path))
                    System.IO.Directory.CreateDirectory(_log_path);
            }

        }
        public static string log_filename = "";

        public static string combine(string path1, string path2)
        {
            return System.IO.Path.Combine(path1, path2);
        }

        public static string make_date_time_string(DateTime t)
        {
            return string.Format("{0:D4}{1:D2}{2:D2}_{3:D2}{4:D2}{5:D2}",
                t.Year,
                t.Month,
                t.Day,
                t.Hour,
                t.Minute,
                t.Second);
        }

        public static string make_date_time_string_now()
        {
            return make_date_time_string(DateTime.Now);
        }

        public static string find_matching_file_unique(string search_pattern, string dir)
        {
            string[] files = System.IO.Directory.GetFiles(dir, search_pattern, System.IO.SearchOption.TopDirectoryOnly);

            // there should be only one matching file
            if (files.Length == 0)
            {
                log_error(string.Format("there is no file matching '{0}' in {1}", search_pattern, dir));
                return "";
            }
            else if (files.Length > 1)
            {
                log_error(string.Format("there are more than one file matching '{0}' in {1}", search_pattern, dir));
                return "";
            }

            return files[0];
        }

        public static void log_line(string msg)
        {
            Console.WriteLine(msg);
            System.IO.File.AppendAllText(log_file, msg + System.Environment.NewLine);
        }

        public static void log(string msg)
        {
            Console.Write(msg);
            System.IO.File.AppendAllText(log_file, msg);
        }

        public static void email_log(string msg)
        {
            try
            {
                if (global_variables.machine_param != null)
                {
                    param p = global_variables.machine_param;
                    string from = p.get_value("email_from");
                    string to = p.get_value("email_log_to");
                    string from_enc_pw = p.get_value("email_from_enc_pw");
                    string body = msg;
                    string domain = p.get_value("email_domain");
                    string host = p.get_value("email_host_address");
                    int port = System.Convert.ToInt32(p.get_value("email_host_port"));
                    bool enable_ssl = System.Convert.ToBoolean(p.get_value("enable_ssl"));
                    //send
                    email.send(from, from_enc_pw, to, "CTQA (" + p.get_value("machine") + ") Error!", body, domain, host, port, enable_ssl);
                }
                else
                {
                    param p = global_variables.service_param;
                    string from = p.get_value("email_from");
                    string to = p.get_value("email_log_to");
                    string from_enc_pw = p.get_value("email_from_enc_pw");
                    string body = msg;
                    string domain = p.get_value("email_domain");
                    string host = p.get_value("email_host_address");
                    int port = System.Convert.ToInt32(p.get_value("email_host_port"));
                    bool enable_ssl = System.Convert.ToBoolean(p.get_value("enable_ssl"));
                    //send
                    email.send(from, from_enc_pw, to, "CTQA (" + p.get_value("machine") + ") Error!", body, domain, host, port, enable_ssl);
                }
            }catch(Exception exn)
            {
                // don't crash even if it cannot email...
            }

        }

        public static void log_error(string msg)
        {
            Console.WriteLine(msg);
            System.IO.File.AppendAllText(log_file, msg + System.Environment.NewLine);
            email_log(msg);
            throw new Exception(msg);
        }

        public static string file_matching_method;
        public static List<string> required_input_files;
        public static Dictionary<string, string> input_file_dict;

        public static List<string> remove_duplicates(List<string> items)
        {
            Dictionary<string, string> dict = new Dictionary<string, string>();
            foreach (string s in items)
            {
                if (!dict.ContainsKey(s))
                    dict.Add(s, "");
            }
            return dict.Keys.ToList();
        }

        public static string[] find_files_contain_string(string dir, string search_pattern, string str)
        {
            List<string> result_file_list = new List<string>();
            string[] files = System.IO.Directory.GetFiles(dir, search_pattern, SearchOption.TopDirectoryOnly);
            foreach (string file in files)
                if (System.IO.File.ReadAllText(file).Contains(str))
                    result_file_list.Add(file);

            return result_file_list.ToArray();
        }

        //public static List<Process> process_list = new List<Process>();

        public static void run_cmd(string cmd)
        {
            Process p = System.Diagnostics.Process.Start("CMD.exe", "/C " + cmd);
            p.WaitForExit();


            // the dependent process dcmdump.exe does not exit...

            //process_list.Add(p);

            ////// wait until the process finishes
            ////int wait_second = 0;
            ////if(!p.HasExited)
            ////{
            ////    if (wait_second < max_time_to_wait)
            ////    {
            ////        Thread.Sleep(1000);
            ////        wait_second++;
            ////    }
            ////    else
            ////    {
            ////        log_error("Error: time out - the cmd time exceeded the specidied time out;max_time_to_wait="+ max_time_to_wait+".");
            ////    }
            ////}

            //////p.CloseMainWindow();
        }

        public static string run_cmd(string prog, string args)
        {
            log_line("run_cmd()...");
            log_line("prog=" + prog);
            log_line("args=" + args);

            try
            {
                //string strCmdText;
                //strCmdText = "/C "+prog+ " "+args;
                //System.Diagnostics.Process.Start("CMD.exe", strCmdText);

                Process process = new Process();
                process.StartInfo.FileName = prog;
                process.StartInfo.Arguments = args;
                process.EnableRaisingEvents = true;
                process.Start();

                process.WaitForExit(1000 * 60 * 5);    // Wait up to five minutes.

                process.WaitForExit();

                //string output = cmd.StandardOutput.ReadToEnd();
                //string error = cmd.StandardError.ReadToEnd();
                //return output;

                return "";
            }
            catch (Exception exn)
            {
                log_line(exn.ToString());
                return "";
            }
        }


        //public static void email_report(string html_file)
        //{
        //    log_line("sending email:" + html_file);

        //    param p = global_variables.machine_param;
        //    string from = p.get_value("email_from");
        //    string to = p.get_value("email_to");
        //    string from_enc_pw = p.get_value("email_from_enc_pw");
        //    string body = System.IO.File.ReadAllText(html_file);
        //    string domain = p.get_value("email_domain");
        //    string host = p.get_value("email_host_address");
        //    string machine = p.get_value("machine");
        //    int port = System.Convert.ToInt32(p.get_value("email_host_port"));

        //    //send
        //    email.send(from, from_enc_pw, to, "MLCQA(" + machine + ")", body, domain, host, port);
        //}

        public static void copy_files(string src, string dst, bool recursive = false)
        {
            if(!System.IO.Directory.Exists(dst))
                System.IO.Directory.CreateDirectory(dst);

            global_variables.log_line("copy_files() - copying files from " + src + " to " + dst);
            foreach (string src_file in System.IO.Directory.GetFiles(src))
            {
                string filename = System.IO.Path.GetFileName(src_file);
                string dst_file = System.IO.Path.Combine(dst, filename);

                global_variables.log_line("copy_files() - " + filename);

                if (!System.IO.File.Exists(dst_file))
                {
                    try
                    {
                        System.IO.File.Copy(src_file, dst_file);
                    }
                    catch (Exception exn)
                    {
                        global_variables.log_line("copy_files() FAILED for " + filename + "," + exn.Message);
                    }
                }
            }

            if (recursive)
            {
                // copy sub folders
                foreach (string src_sub_dir in System.IO.Directory.GetDirectories(src))
                {
                    string dir_name = System.IO.Path.GetFileName(src_sub_dir);
                    string dst_sub_dir = System.IO.Path.Combine(dst, dir_name);
                    copy_files(src_sub_dir, dst_sub_dir);
                }
            }
        }

        public static void move_files(string src, string dst, bool recursive = false)
        {
            if (!System.IO.Directory.Exists(dst))
                System.IO.Directory.CreateDirectory(dst);

            global_variables.log_line("move_files() - moving files from " + src + " to " + dst);
            foreach (string src_file in System.IO.Directory.GetFiles(src))
            {
                string filename = System.IO.Path.GetFileName(src_file);
                string dst_file = System.IO.Path.Combine(dst, filename);

                global_variables.log_line("move_files() - " + filename);

                if (!System.IO.File.Exists(dst_file))
                {
                    try
                    {
                        System.IO.File.Move(src_file, dst_file);
                    }
                    catch(Exception exn)
                    {
                        global_variables.log_line("move_files() FAILED for " + filename+","+exn.Message);
                    }
                }
            }

            if (recursive)
            {
                // copy sub folders
                foreach (string src_sub_dir in System.IO.Directory.GetDirectories(src))
                {
                    string dir_name = System.IO.Path.GetFileName(src_sub_dir);
                    string dst_sub_dir = System.IO.Path.Combine(dst, dir_name);
                    move_files(src_sub_dir, dst_sub_dir);
                }
            }
        }
    }
}
