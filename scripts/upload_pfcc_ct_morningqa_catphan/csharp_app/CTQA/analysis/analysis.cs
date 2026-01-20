using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Transactions;

namespace analysis
{
    static class analysis
    {
        // read the analysis data and save them to Numbers 
        static string cases_dir = @"W:\RadOnc\Applications\Morning QA\CTQA\GECTSH\cases";
        static string baseline_dir = @"W:\RadOnc\Applications\Morning QA\CTQA\GECTSH\baseline";
        static string numbers_db_dir = @"C:\apps\Numbers\db";
        static string app_id = "GECTSH.DailyQA";

        private static void md(string dir)
        {
            if (!System.IO.Directory.Exists(dir))
                System.IO.Directory.CreateDirectory(dir);
        }

        private static DateTime datetime(string case_dirname)
        {
            string yyyymmdd = case_dirname.Split('_')[0];
            string hhmmss = case_dirname.Split('_')[1];

            string year_string = yyyymmdd.Substring(0, 4);
            int year = Convert.ToInt32(year_string);

            string MM_string = yyyymmdd.Substring(4, 2);
            int MM = Convert.ToInt32(MM_string);

            string dd_string = yyyymmdd.Substring(6, 2);
            int dd = Convert.ToInt32(dd_string);

            string hh_string = hhmmss.Substring(0, 2);
            int hh = Convert.ToInt32(hh_string);

            string mm_string = hhmmss.Substring(2, 2);
            int mm = Convert.ToInt32(mm_string);

            string ss_string = hhmmss.Substring(4, 2);
            int ss = Convert.ToInt32(ss_string);

            return new DateTime(year, MM, dd, hh, mm, ss, 0);
        }


        static void collect_datetime_value_ref_error(string table_id, int row, int col, string csv_file, string header_line)
        {
            StringBuilder sb = new StringBuilder();
            sb.AppendLine(header_line);

            // get all case dir
            foreach (string case_dir in System.IO.Directory.GetDirectories(cases_dir))
            {
                string case_dirname = System.IO.Path.GetFileName(case_dir);
                Console.WriteLine(case_dirname.Length);

                if (case_dirname.Length != 15)
                    continue;

                ////////////////////
                //  test datetime
                string date_time = case_dirname;

                //////////
                // value
                string value = "";
                {
                    string file = case_dir + "//3.analysis//" + csv_file;
                    string[] elms = System.IO.File.ReadAllLines(file)[row].Split(',');
                    value = elms[col];
                }

                ////////////////////
                // baseline, error 
                string error = "";
                string value_baseline = "";
                {
                    string file = baseline_dir + "//" + csv_file;
                    string[] elms = System.IO.File.ReadAllLines(file)[row].Split(',');
                    value_baseline = elms[col];

                    error = (System.Convert.ToDouble(value) - System.Convert.ToDouble(value_baseline)).ToString();
                }

                // save 
                sb.AppendLine(string.Format("{0},{1},{2},{3}", datetime(date_time), value, value_baseline, error));
            }

            // app id dir
            string app_id_dir = numbers_db_dir + "//" + app_id;
            md(app_id_dir);

            string table_file = app_id_dir + "//" + table_id + ".csv";
            System.IO.File.WriteAllText(table_file, sb.ToString());
        }
        
        public static void run()
        {
            db.setup();

            //using (TransactionScope trans = new TransactionScope())
            {
                db.open_connection();
                {
                    db.exec_non_query("insert into highscores (name, score) values ('Me', 9001)");
                }
                db.close_connection();

              //  trans.Complete();
            }

            return;

            string id2label_param_file = baseline_dir + "//id2label.txt";
            ctqa_lib.param id2label = new ctqa_lib.param(id2label_param_file);

            // HU consistancy
            {
                string name = "HU";
                for (int i = 1; i <= 9; i++)
                {
                    string label = id2label.get_value("HU" + i.ToString()).Trim();
                    collect_datetime_value_ref_error(name + "." + label, 1, i - 1, "hu.csv", "DateTime,HU,Ref,Error");
                }
            }

            // geometric accuracy
            {
                string name = "Geometry";
                {
                    string label = "pt1-pt2";
                    collect_datetime_value_ref_error(name+"." + label, 1, 0, "geo.dist.csv", "DateTime,Dist,Ref,Error");
                }

                {
                    string label = "pt2-pt3";
                    collect_datetime_value_ref_error(name + "." + label, 1, 1, "geo.dist.csv", "DateTime,Dist,Ref,Error");
                }

                {
                    string label = "pt3-pt4";
                    collect_datetime_value_ref_error(name + "." + label, 1, 2, "geo.dist.csv", "DateTime,Dist,Ref,Error");
                }

                {
                    string label = "pt4-pt1";
                    collect_datetime_value_ref_error(name + "." + label, 1, 3, "geo.dist.csv", "DateTime,Dist,Ref,Error");
                }

                {
                    string label = "pt5-pt6";
                    collect_datetime_value_ref_error(name + "." + label, 1, 0, "DT.dist.csv", "DateTime,Dist,Ref,Error");
                }

            }

            // Uniformity
            {
                string name = "Uniformity";
                {
                    string label = "HU_CTR";
                    collect_datetime_value_ref_error(name + "." + label, 1, 0, "UF.csv", "DateTime,HU,Ref,Error");
                }

                {
                    string label = "HU_ANT";
                    collect_datetime_value_ref_error(name + "." + label, 1, 1, "UF.csv", "DateTime,HU,Ref,Error");
                }

                {
                    string label = "HU_RT";
                    collect_datetime_value_ref_error(name + "." + label, 1, 2, "UF.csv", "DateTime,HU,Ref,Error");
                }

                {
                    string label = "HU_PST";
                    collect_datetime_value_ref_error(name + "." + label, 1, 3, "UF.csv", "DateTime,HU,Ref,Error");
                }

                {
                    string label = "HU_LT";
                    collect_datetime_value_ref_error(name + "." + label, 1, 3, "UF.csv", "DateTime,HU,Ref,Error");
                }

                {
                    string label = "Uniformity";
                    collect_datetime_value_ref_error(name + "." + label, 1, 0, "UF.uniformity.csv", "DateTime,Uniformity,Ref,Error");
                }
            }


            // Low Contrast
            {
                string name = "Low_Contrast";
                {
                    string label = "HU_STD";
                    collect_datetime_value_ref_error(name + "." + label, 1, 0, "LC.csv", "DateTime,HU(STD),Ref,Error");
                }
            }


            // RMTF
            {
                string name = "High_Contrast_RMTF";
                for (int i = 1; i <= 15; i++)
                {
                    string label = "LinePairPerCM" + i.ToString();
                    collect_datetime_value_ref_error(name + "." + label, 1, i-1, "HC.RMTF.csv", "DateTime,RMTF,Ref,Error");
                }
            }

            { 
                string name = "High_Contrast";
                {
                    string label = "MRTF=50";
                    collect_datetime_value_ref_error(name + "." + label, 1, 0, "HC.RMTF.calc.csv", "DateTime,LP/CM,Ref,Error");
                }
            }

        }
    }
}
