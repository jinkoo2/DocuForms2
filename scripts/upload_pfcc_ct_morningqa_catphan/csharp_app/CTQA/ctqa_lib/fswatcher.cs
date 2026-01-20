using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace ctqa_lib
{
    public class fswatcher
    {

        public void email_log(string sub, string msg)
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
            email.send(from, from_enc_pw, to, sub, body, domain, host, port, enable_ssl);
        }

        public fswatcher(string service_param_file)
        {
            try
            {
                global_variables.service_param = new param(service_param_file);

                string watch_path = global_variables.service_param.get_value("watch_path");
                global_variables.log_path = global_variables.service_param.get_value("log_path");
                global_variables.log_line("watch_path=" + watch_path);

                // email the start
                email_log("CTQA starting", "CTQA file watcher starting...");

                // Create a new FileSystemWatcher and set its properties.
                FileSystemWatcher watcher = new FileSystemWatcher();
                watcher.Path = watch_path;
                /* Watch for directory creaation*/
                watcher.NotifyFilter =
                    NotifyFilters.CreationTime |
                    NotifyFilters.DirectoryName;

                watcher.IncludeSubdirectories = false;

                // Add event handlers.
                //watcher.Changed += new FileSystemEventHandler(OnChanged);
                log_line("subscribing to create event:" + watch_path + ".");

                watcher.Created += new FileSystemEventHandler(OnChanged);
                //watcher.Deleted += new FileSystemEventHandler(OnChanged);
                watcher.Renamed += new RenamedEventHandler(OnRenamed);

                // Begin watching.
                watcher.EnableRaisingEvents = true;
            }
            catch (Exception exn)
            {
                log_line(exn.ToString());
            }
        }

        private void log_line(string msg)
        {
            global_variables.log_line(msg);
        }

        private void log(string msg)
        {
            global_variables.log(msg);
        }

        public void Run(string import_dir)
        {
            log_line("import_dir=" + import_dir);
            
            /////////////////////////////////////////////////
            //// sort the data by patient id, study, series
            string dicom_sort_base_dir = global_variables.service_param.get_value("dicom_sort_base_dir");

            if(!System.IO.Directory.Exists(dicom_sort_base_dir))
            {
                log_line("directory not found, so creating directory: " + dicom_sort_base_dir);
                System.IO.Directory.CreateDirectory(dicom_sort_base_dir);
            }

            string sort_dir = System.IO.Path.Combine(dicom_sort_base_dir, global_variables.make_date_time_string_now());

            log_line("creating sort_dir=" + sort_dir);
            System.IO.Directory.CreateDirectory(sort_dir);

            log_line("sorting dicom files...patient->study->series...");
            email_log("CTQA Log", "sorting dicom files...patient->study->series..., sort_dir=" + sort_dir);
            dicomtools.sort_files_by_patient_study_series(import_dir, sort_dir, "no");

            ///////////////////////////////////////
            // find the CT series of this patient
            global_variables.log_line("seraching CT data to process...");
            foreach (string pt_dir in System.IO.Directory.GetDirectories(sort_dir))
            {
                global_variables.log_line("pt_dir="+pt_dir);
                foreach (string study_dir in System.IO.Directory.GetDirectories(pt_dir))
                {
                    global_variables.log_line("study_dir=" + study_dir);
                    foreach (string series_dir in System.IO.Directory.GetDirectories(study_dir))
                    {
                        global_variables.log_line("series_dir=" + series_dir);

                        // check the number of dicom files
                        string[] dicom_files = System.IO.Directory.GetFiles(series_dir, "*.dcm", SearchOption.TopDirectoryOnly);
                        global_variables.log_line("the number of dicom files = " + dicom_files.Length);

                        if (dicom_files.Length<100) // if there are more then 100 images, we consider this is a CT volume
                        {
                            global_variables.log_line("the number of dicom files are too little (<100), so skipping...");
                            continue;
                        }

                        // determine the machine name based the series dicom information 
                        string info_file = System.IO.Path.Combine(series_dir, "info.txt");
                        param p = new param(info_file);
                        string PatientName = p.get_value("PatientName");

                        // get the last name
                        string LastName = "";
                        if (PatientName.Contains("^"))
                            LastName = PatientName.Split('^')[0];
                        else if (PatientName.Contains(","))
                            LastName = PatientName.Split(',')[0];
                        else
                            LastName = PatientName;

                        // CT station name
                        string StationName = p.get_value("StationName");

                        // get the mahcine directory
                        //string machine_key = string.Format("{0}_{1}", LastName.Trim().ToLower(), StationName.Trim().ToLower());
                        string machine_key = string.Format("{0}", StationName.Trim().ToLower());
                        string machine_dir = global_variables.service_param.get_value(machine_key);

                        global_variables.log_line("LastName=" + LastName);
                        global_variables.log_line("StationName=" + StationName);
                        global_variables.log_line("machine_key=" + machine_key);
                        global_variables.log_line("machine_dir=" + machine_dir);

                        if (machine_dir == "")
                        {
                            global_variables.log_error("machine_dir not found in the service param file. Make sure there is a key-value pair with key=" + machine_key+". Skipping...");
                            continue;
                        }

                        if (!System.IO.Directory.Exists(machine_dir))
                        {
                            global_variables.log_error("machine_dir does not exist: " + machine_dir + ". Skipping...");
                            continue;
                        }

                        string machine_param_file = System.IO.Path.Combine(machine_dir, "param.txt");
                        if (!System.IO.File.Exists(machine_param_file))
                        {
                            global_variables.log_error("param file does not exist: " + machine_param_file + ". Skipping...");
                            continue;
                        }

                        email_log("CTQA Log", "machine_dir = " + machine_dir);

                        global_variables.machine_param = new param(machine_param_file);

                        global_variables.log_line("machine param file=" + machine_param_file);

                        email_log("CTQA Log", "start processing data...");

                        // convert dicom files to mhd file
                        dicomtools.dicom_series_to_mhd(series_dir, series_dir);

                        // run CTQA
                        ctqa_lib.ctqa qa = new ctqa();
                        qa.run(series_dir);
                        
                        // copy all files to the QA case folder
                        string SeriesDate = p.get_value("SeriesDate");
                        string StudyTime = p.get_value("StudyTime");
                        string cases_dir = global_variables.machine_param.get_value("cases_dir");
                        string case_dir = System.IO.Path.Combine(cases_dir, SeriesDate + "_" + StudyTime);

                        email_log("CTQA Log", "processing complete. coping all data to ... " + cases_dir);

                        System.IO.Directory.CreateDirectory(case_dir);
                        global_variables.copy_files(series_dir, case_dir, true);

                        email_log("CTQA Log - Done", "done.");
                    }
                }
            }
        }

        private void Update(string changed, bool renamed)
        {
            try
            {
                string dir = changed;

                // check if directory name meets the requirement
                string directory_name_contains = global_variables.service_param.get_value("directory_name_contains");
                if(!dir.ToLower().Contains(directory_name_contains.ToLower()))
                {
                    log_line("Not a DailyQA folder, skipping...");
                    return;
                }

                // email log
                 email_log("CTQA Log", "DailyQA folder detected - "+dir);

                // check if the containing files meet the minimum number of file requirement
                // wait up to 10 minutes
                int num_of_files = System.IO.Directory.GetFiles(dir).Length;
                int min_num_of_files = System.Convert.ToInt32(global_variables.service_param.get_value("min_num_of_files"));
                int wait_count = 180; // 10 sec x 180 = 30 min
                int count = 0;
                while (true)
                {
                    if (num_of_files >= min_num_of_files)
                    {
                        log_line("the num of files (" + num_of_files + ") meets the min required num_of_files (" + min_num_of_files + "). So moving on.");
                        break;
                    }
                    else
                    {
                        log_line("the num of files (" + num_of_files + ") does NOT meets the min required num_of_files (" + min_num_of_files + ")...");
                    }

                    if (count> wait_count)
                    {
                        log_line("WAITED ENOUGH!... quit waiting.");
                        email_log("CTQA Log - WAITED ENOUGH!", "waited enough... quit waiting.");
                        return;
                    }
                    else
                    {
                        log_line("wait count("+count+") is smaller than the max wait count("+wait_count+")...");
                    }

                    log_line("waitign for 10 seconds...");

                    Thread.Sleep(10 * 1000); // wait 30 seconds... hoping to get more files

                    num_of_files = System.IO.Directory.GetFiles(dir).Length;
                    count++;
                }

                //// wait until files are ready to process
                //int notification_to_process_sec = System.Convert.ToInt32(global_variables.service_param.get_value("notification_to_process_sec"));
                //log_line("waiting "+ notification_to_process_sec + " seconds to be sure that all images are saved...");
                //Thread.Sleep(notification_to_process_sec * 1000); // wait some seconds 

                email_log("CTQA Log", "start processing files...");
                Run(changed);
            }
            catch (Exception exn)
            {
                log_line(exn.ToString());
            }
        }

        // Define the event handlers.
        private void OnChanged(object source, FileSystemEventArgs e)
        {
            // Specify what is done when a file is changed, created, or deleted.
            log_line("Folder: " + e.FullPath + " " + e.ChangeType);

            Update(e.FullPath, false);
        }

        private void OnRenamed(object source, RenamedEventArgs e)
        {
            // Specify what is done when a file is renamed.
            log_line(string.Format("File: {0} renamed to {1}", e.OldFullPath, e.FullPath));

            Update(e.FullPath, true);
        }
    }
}
