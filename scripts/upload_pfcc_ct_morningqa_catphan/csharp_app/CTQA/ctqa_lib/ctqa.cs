using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ctqa_lib
{
    public class ctqa
    {
        string combine(string path1, string path2)
        {
            return System.IO.Path.Combine(path1, path2);
        }
        
        public void process_baseline()
        {
            string baseline_dir = global_variables.machine_param.get_value("baseline_dir");
            analize(baseline_dir, "nrrd", baseline_dir, "nrrd", baseline_dir);
        }

        public void run(string case_dir)
        {

            global_variables.log_line("ctqa.run()");
            global_variables.log_line("case_dir="+case_dir);

            //process_baseline();
            //return;

            string baseline_dir = global_variables.machine_param.get_value("baseline_dir");

            //case_dir = @"W:\RadOnc\Planning\Physics QA\CTQA\GECTSH\cases\20190513_091019";
            //report(case_dir, baseline_dir, case_dir);
            //email_report(case_dir);
            //return;

            ////////////////////////////////////////////////
            // transfer the analysis masks to the case image
            {
                /////////////////////////////
                // do the registration 
                string f = combine(case_dir, "CT.mhd");
                string fMask = "";
                string m = combine(baseline_dir, "CT.nrrd");
                string mMask = combine(baseline_dir, "fuz_mask.nrrd");

                if(!System.IO.File.Exists(f))
                {
                    // case CT not found, try to convert dicom files to CT.mhd
                    global_variables.log_line("CT.mhd not found:" + f);
                    global_variables.log_line("Trying to convert dicom images to CT.mhd...");
                    dicomtools.dicom_series_to_mhd(case_dir, case_dir);

                    if(!System.IO.File.Exists(f))
                    {
                        global_variables.log_error("Count not create CT.mhd! Please check you have dicom CT files or CT.mhd in the case folder:"+case_dir);
                    }
                }

                string elastix_param_dir = global_variables.machine_param.get_value("elastix_param_dir");
                string[] param_files = {
                    combine(elastix_param_dir,"Parameters_Translation.txt"),
                    combine(elastix_param_dir,"Parameters_Rigid.txt")
                };
                if(!System.IO.Directory.Exists(elastix_param_dir))
                {
                    global_variables.log_error("Directory not found: elastix_param_dir=" + elastix_param_dir);
                }
                if (!System.IO.File.Exists(param_files[0]))
                {
                    global_variables.log_error("Param file not found: param_files[0]=" + param_files[0]);
                }
                if (!System.IO.File.Exists(param_files[1]))
                {
                    global_variables.log_error("Param file not found: param_files[1]=" + param_files[1]);
                }


                string reg_out = combine(case_dir, "1.reg");

                global_variables.log_line("running registration...");
                global_variables.log_line("f=" + f);
                global_variables.log_line("fMask=" + fMask);
                global_variables.log_line("m=" + m);
                global_variables.log_line("mMask=" + mMask);
                global_variables.log_line("reg_out=" + reg_out);
                global_variables.log_line("param_files[0]=" + param_files[0]);
                global_variables.log_line("param_files[1]=" + param_files[1]);

                etx.elastix(f, fMask, m, mMask, reg_out, param_files);

                ////////////////////////////
                // transfer masks
                global_variables.log_line("transfering masks...");
                string baseline_ext = "nrrd";
                transfer_masks(baseline_dir, baseline_ext, case_dir, param_files.Length, "HU");
                transfer_masks(baseline_dir, baseline_ext, case_dir, param_files.Length, "UF");
                transfer_masks(baseline_dir, baseline_ext, case_dir, param_files.Length, "HC");
                transfer_masks(baseline_dir, baseline_ext, case_dir, param_files.Length, "LC");
                transfer_masks(baseline_dir, baseline_ext, case_dir, param_files.Length, "geo");
                transfer_masks(baseline_dir, baseline_ext, case_dir, param_files.Length, "DT");
            }

            //////////////////////////
            // do the analysis
            string result_dir = combine(case_dir, "3.analysis");
            global_variables.log_line("analizing data...");
            analize(case_dir, "mhd", combine(case_dir, "2.seg"), "nrrd", result_dir);

            //////////////////
            // make a report
            global_variables.log_line("making a report...");
            report(case_dir, baseline_dir, result_dir);

            ///////////////////
            // email the report
            //case_dir = @"W:\RadOnc\Planning\Physics QA\CTQA\GECTSH\cases\20190412_111928";
            global_variables.log_line("emailing report...");
            email_report(case_dir);

            global_variables.log_line("exiting ctqa.run()...");
        }

        public void email_report(string case_dir)
        {
            string html_file = System.IO.Path.Combine(case_dir, @"3.analysis\report.html");

            param p = global_variables.machine_param;
            string from = p.get_value("email_from");
            string to = p.get_value("email_to");
            string from_enc_pw = p.get_value("email_from_enc_pw");
            string body = System.IO.File.ReadAllText(html_file);
            string domain = p.get_value("email_domain");
            string host = p.get_value("email_host_address");
            int port = System.Convert.ToInt32(p.get_value("email_host_port"));
            bool enable_ssl = System.Convert.ToBoolean(p.get_value("enable_ssl"));
            //send
            email.send(from, from_enc_pw, to, "CTQA (" + p.get_value("machine") + ")", body, domain, host, port, enable_ssl);
        }

        public void email_log(string msg)
        {
            global_variables.email_log(msg);
            //param p = global_variables.machine_param;
            //string from = p.get_value("email_from");
            //string to = p.get_value("email_log_to");
            //string from_enc_pw = p.get_value("email_from_enc_pw");
            //string body = msg;
            //string domain = p.get_value("email_domain");
            //string host = p.get_value("email_host_address");
            //int port = System.Convert.ToInt32(p.get_value("email_host_port"));
            //bool enable_ssl = System.Convert.ToBoolean(p.get_value("enable_ssl"));
            ////send
            //email.send(from, from_enc_pw, to, "Msg - CTQA (" + p.get_value("machine") + ")", body, domain, host, port, enable_ssl);
        }


        string gen_html_table_rows_from_csv(string case_result_dir, string baseline_dir, int num_of_masks, double tol, string filename, string num_format="0.0")
        {

            string id2lable_file = combine(baseline_dir, "id2label.txt");
            param id2label = new param(id2lable_file);

            // read values from baseline
            string file0 = combine(baseline_dir, filename);
            string[] lines0 = System.IO.File.ReadAllLines(file0);
            string[] labels0 = lines0[0].Split(',');
            string[] values0 = lines0[1].Split(',');

            // read values from this case
            string file1 = combine(case_result_dir, filename);
            string[] lines1 = System.IO.File.ReadAllLines(file1);
            string[] labels1 = lines1[0].Split(',');
            string[] values1 = lines1[1].Split(',');

            // add rows
            StringBuilder sb = new StringBuilder();
           
            for (int i = 0; i < num_of_masks; i++)
            {
                string mask_id = labels0[i].Trim();
                string label = id2label.get_value(mask_id).Trim();
                if (label == "")
                    label = mask_id;
                double value0 = System.Convert.ToDouble(values0[i]);
                double value1 = System.Convert.ToDouble(values1[i]);
                double diff = value1 - value0;
                double err = Math.Abs(diff);
                string pass_fail = (err < tol) ? "Pass" : "Fail";

                // add a row
                //< tr >
                //    < td > HU1 </ td >
                //    < td > -1000 </ th >
                //    < td > -999 </ th >
                //    < td > -1 </ th >
                //    < td > Pass </ th >
                //</ tr >
                sb.AppendLine("<tr>");
                sb.AppendLine(string.Format("<td>{0}</td>", label));
                sb.AppendLine(string.Format("<td>{0:"+num_format+"}</td>", value1));
                sb.AppendLine(string.Format("<td>{0:" + num_format + "}</td>", value0));
                sb.AppendLine(string.Format("<td>{0:" + num_format + "}</td>", diff));

                if(pass_fail=="Pass")
                    sb.AppendLine("<td class=\"pass\">Pass<span class=\"glyphicon glyphicon-ok\" aria-hidden=\"true\"></td>");
                else
                    sb.AppendLine("<td class=\"fail\">Fail<span class=\"glyphicon glyphicon-remove\" aria-hidden=\"true\"></td>");

                sb.AppendLine("</tr>");
            }
            return sb.ToString();
        }

        string gen_html_table_rows_from_csv(string case_result_dir, string baseline_dir, string key, string filename, string num_format = "0.0")
        {
            int num_of_masks = System.Convert.ToInt32(global_variables.machine_param.get_value("num_of_" + key + "_masks"));
            double tol = System.Convert.ToDouble(global_variables.machine_param.get_value(key + "_tol"));
            return gen_html_table_rows_from_csv(case_result_dir, baseline_dir, num_of_masks, tol, filename, num_format);
        }

        void report(string case_dir, string baseline_dir, string out_dir)
        {
            string case_result_dir = combine(case_dir, "3.analysis");

            string info_file = combine(case_dir, "info.txt");

            string PatientName = "";
            string user = "";
            string StudyDate = "";
            string StudyTime = "";
            string SeriesNumber = "";

            if (System.IO.File.Exists(info_file))
            {
                param info = new param(info_file);

                PatientName = info.get_value("PatientName");
                if (PatientName.Contains("^"))
                    user = PatientName.Split('^')[0]; // paient last name is the user initial
                else
                    user = PatientName;
                StudyDate = info.get_value("StudyDate");
                StudyTime = info.get_value("StudyTime");
                SeriesNumber = info.get_value("SeriesNumber");
            }
            else
            {
                PatientName = "";
                user = "NA";
                StudyDate = global_variables.make_date_time_string_now().Split('_')[0];
                StudyTime = global_variables.make_date_time_string_now().Split('_')[1];
                SeriesNumber = "";
            }

            // read template 
            string html_template_file = global_variables.machine_param.get_value("html_report_template");
            if(!System.IO.File.Exists(html_template_file))
            {
                global_variables.log_error("report template not found: " + html_template_file);
                return;
            }

            string html = System.IO.File.ReadAllText(html_template_file);

            html = html.Replace("{{{date}}}", StudyDate)
                .Replace("{{{time}}}", StudyTime)
                .Replace("{{{user}}}", user);


            double UF_uniformity_tol = System.Convert.ToDouble(global_variables.machine_param.get_value("UF.uniformity_tol"));
            double HC_RMTF_tol = System.Convert.ToDouble(global_variables.machine_param.get_value("HC_RMTF_tol"));
            double HC_RMTF50_tol = System.Convert.ToDouble(global_variables.machine_param.get_value("HC_RMTF50_tol"));

            html = html
                .Replace("{{{HU_tol}}}", global_variables.machine_param.get_value("HU_tol"))
                .Replace("{{{geo_tol}}}", global_variables.machine_param.get_value("geo_tol"))
                .Replace("{{{DT_tol}}}", global_variables.machine_param.get_value("DT_tol"))
                .Replace("{{{UF_tol}}}", global_variables.machine_param.get_value("UF_tol"))
                .Replace("{{{LC_tol}}}", global_variables.machine_param.get_value("LC_tol"))
                .Replace("{{{UF.uniformity_tol}}}", global_variables.machine_param.get_value("UF.uniformity_tol"))
                .Replace("{{{HC_RMTF_tol}}}", global_variables.machine_param.get_value("HC_RMTF_tol"))
                .Replace("{{{HC_RMTF50_tol}}}", global_variables.machine_param.get_value("HC_RMTF50_tol"));

            html = html
                    .Replace("{{{HU}}}", gen_html_table_rows_from_csv(case_result_dir, baseline_dir, "HU", "HU.csv"))
                    .Replace("{{{DT}}}", gen_html_table_rows_from_csv(case_result_dir, baseline_dir, "DT", "DT.dist.csv"))
                    .Replace("{{{geo}}}", gen_html_table_rows_from_csv(case_result_dir, baseline_dir, "geo", "geo.dist.csv"))
                    .Replace("{{{UF}}}", gen_html_table_rows_from_csv(case_result_dir, baseline_dir, "UF", "UF.csv"))
                    .Replace("{{{UF.uniformity}}}", gen_html_table_rows_from_csv(case_result_dir, baseline_dir, 1, UF_uniformity_tol, "UF.uniformity.csv", "0.00"))
                    .Replace("{{{LC}}}", gen_html_table_rows_from_csv(case_result_dir, baseline_dir, "LC", "LC.csv"))
                    .Replace("{{{HC.RMTF}}}", gen_html_table_rows_from_csv(case_result_dir, baseline_dir, 15, HC_RMTF_tol, "HC.RMTF.csv", "0.00"))
                    .Replace("{{{HC.RMTF.50}}}", gen_html_table_rows_from_csv(case_result_dir, baseline_dir, 1, HC_RMTF50_tol, "HC.RMTF.calc.csv", "0.0"));

            // replace words 
            global_variables.log_line("replacing words for report...");
            string replace_words = global_variables.machine_param.get_value("replace_words_for_report");
            if(replace_words.Trim()!="")
            {
                foreach(string word in replace_words.Split(','))
                {
                    string word_new = global_variables.machine_param.get_value(word);

                    global_variables.log_line(word + "->" + word_new + "...");

                    html = html.Replace(word, word_new);
                }
            }

            // save the report
            string html_file = combine(case_result_dir, "report.html");
            System.IO.File.WriteAllText(html_file, html);
            
        }

        void transfer_masks(string baseline_dir, string ext, string case_dir, int num_of_etx_input_param_files, string key)
        {
            // reg results
            string reg_dir = combine(case_dir, "1.reg");
            string reg_transform_param_file = global_variables.combine(reg_dir, string.Format("TransformParameters.{0}.txt", num_of_etx_input_param_files - 1));

            string seg_dir = combine(case_dir, "2.seg");
            string tmp_img = combine(seg_dir, "tmp1.nrrd");

            int num_of_masks = System.Convert.ToInt32(global_variables.machine_param.get_value("num_of_" + key + "_masks"));
            for (int i = 1; i <= num_of_masks; i++)
            {
                string seg_in = combine(baseline_dir, key + i + ".nrrd");
                string seg_out = combine(seg_dir, key + i + ".nrrd");

                string result_img = etx.transformix(seg_in, seg_dir, reg_transform_param_file);

                // threhold to a binary mask
                imagetools.threshold_3d_f(result_img, 0.0, 0.5, 1.0, tmp_img);

                // cast to uchar image
                imagetools.cast_to_uchar_3d_f(tmp_img, seg_out);

                // remove the tmp image
                System.IO.File.Delete(tmp_img);
            }
        }


        double mean_pixel_value(string img, string mask)
        {
            string stat = mask + ".stat.txt";
            imagetools.calc_image_min_max_mean_std_3d_f(img, mask, stat);

            // get mean value from the output file
            param p = new param(stat);
            double mean = System.Convert.ToDouble(p.get_value("mean"));

            return mean;
        }

        double std_pixel_value(string img, string mask)
        {
            string stat = mask + ".stat.txt";
            imagetools.calc_image_min_max_mean_std_3d_f(img, mask, stat);

            // get mean value from the output file
            param p = new param(stat);
            double std = System.Convert.ToDouble(p.get_value("std"));

            return std;
        }

        void analize(string case_dir, string CT_ext, string mask_dir, string mask_ext, string out_dir)
        {
            if (!System.IO.Directory.Exists(out_dir))
                System.IO.Directory.CreateDirectory(out_dir);

            measure_mean(case_dir,CT_ext, mask_dir, mask_ext, "HU", out_dir);
            measure_mean(case_dir, CT_ext, mask_dir, mask_ext, "UF", out_dir);
            measure_std(case_dir, CT_ext, mask_dir, mask_ext, "HC", out_dir);
            measure_std(case_dir, CT_ext, mask_dir, mask_ext, "LC", out_dir);
            measure_dist(case_dir, CT_ext, mask_dir, mask_ext, "geo", 1.0, -500, 0.0, out_dir);
            measure_dist(case_dir, CT_ext, mask_dir, mask_ext, "DT", 0.0, 200, 1.0, out_dir);

            calc_integral_non_uniformity(out_dir);

            calc_ralative_mtf(out_dir);
        }

        double[] toDouble(string[] values)
        {
            List<double> list = new List<double>();
            foreach (string s in values)
                list.Add(System.Convert.ToDouble(s));

            return list.ToArray();
        }

        string[] toString(double[] values)
        {
            List<string> list = new List<string>();
            foreach (double s in values)
                list.Add(s.ToString());

            return list.ToArray();
        }

        double[] div(double[] values, double denom)
        {
            List<double> list = new List<double>();
            foreach(double v in values)
                list.Add(v/denom);

            return list.ToArray();
        }

        void calc_integral_non_uniformity(string result_dir)
        {
            string hu_file = combine(result_dir, "UF.csv");

            string[] values_str = System.IO.File.ReadAllLines(hu_file)[1].Split(',');
            double[] values = toDouble(values_str);

            double max = values.Max();
            double min = values.Min();
            double inu = (max - min) / (max + min);

            string result_file = combine(result_dir, "UF.uniformity.csv");
            string[] lines =
                {   "Uniformity",
                    inu.ToString()
                };
            System.IO.File.WriteAllLines(result_file, lines);
        }

        void calc_ralative_mtf(string result_dir)
        {
            string file = combine(result_dir, "HC.csv");

            string label_line = System.IO.File.ReadAllLines(file)[0];
            string[] values_str = System.IO.File.ReadAllLines(file)[1].Split(',');
            double[] v1 = toDouble(values_str);
            double[] v2 = div(v1, v1[0]); // normalize

            // find the first crossing to the 50%.
            int index_after_50percent = -1;
            for(int i=0; i<v2.Length;i++)
            {
                if (v2[i] < 0.5)
                {
                    index_after_50percent = i;
                    break;
                }
            }

            if (index_after_50percent == -1)
                global_variables.log_error("calc_ralative_mtf() - Failed finding 50% crossing!");

            double y1 = v2[index_after_50percent - 1];
            double y2 = v2[index_after_50percent];
            double x1 = index_after_50percent - 1;
            double x2 = index_after_50percent;
            double a = (y2 - y1) / (x2 - x1);
            double b = y1 - a * x1;
            double x = (0.5 - b) / a;

            // save rmtf
            {
                string result_file = combine(result_dir, "HC.RMTF.csv");
                string[] lines =
                    {   label_line,
                    string.Join(",", toString(v2))
                };
                System.IO.File.WriteAllLines(result_file, lines);
            }

            // save LP/cm for 0.5 RMTF
            {
                string result_file = combine(result_dir, "HC.RMTF.calc.csv");
                string[] lines =
                    {   "RMTF=0.5",
                     x.ToString() };
                System.IO.File.WriteAllLines(result_file, lines);
            }


        }


        string calcualte_distance(string pt1, string pt2)
        {
            string label1 = pt1.Split(',')[0];
            double x1 = System.Convert.ToDouble(pt1.Split(',')[1]);
            double y1 = System.Convert.ToDouble(pt1.Split(',')[2]);
            double z1 = System.Convert.ToDouble(pt1.Split(',')[3]);

            string label2 = pt2.Split(',')[0];
            double x2 = System.Convert.ToDouble(pt2.Split(',')[1]);
            double y2 = System.Convert.ToDouble(pt2.Split(',')[2]);
            double z2 = System.Convert.ToDouble(pt2.Split(',')[3]);

            string label_d = string.Format("{0}->{1}", label1, label2);
            double dx = x1 - x2;
            double dy = y1 - y2;
            double dz = z1 - z2;

            return label_d + "," + Math.Sqrt(dx * dx + dy * dy + dz*dz).ToString();
        }

        List<string> calculate_distances(List<string> points)
        {
            List<string> list = new List<string>();

            for(int i=0; i<points.Count-1;i++)
            {
                string pt1 = points[i];
                string pt2 = points[i+1];

                string dist = calcualte_distance(pt1, pt2);
                list.Add(dist);
            }

            // last point to the first points
            string dist_last_to_first = calcualte_distance(points[points.Count - 1], points[0]);
            list.Add(dist_last_to_first);
            
            return list;
        }

        void measure_dist(string case_dir, string CT_ext, string mask_dir, string mask_ext, string key, double level0, double th, double level1, string out_dir) 
        {
            // CT image
            string CT = combine(case_dir, "CT." + CT_ext);
            global_variables.log_line("CT=" + CT);
            int num_of_masks = System.Convert.ToInt32(global_variables.machine_param.get_value("num_of_" + key + "_masks"));

            List<string> list = new List<string>();
            for (int i = 1; i <= num_of_masks; i++)
            {
                string mask_name = key + i.ToString();
                string mask = combine(mask_dir,  mask_name + "." + mask_ext);
                global_variables.log_line("mask=" + mask);

                // get image stat
                string com = center_of_mass(CT, mask, mask_name, level0, th, level1, out_dir);
                global_variables.log_line("com = " + com);
                list.Add(mask_name+","+com);
            }
            string outfile = combine(out_dir, key + ".csv");
            global_variables.log_line("saving to " + outfile);
            System.IO.File.WriteAllText(outfile,",x[mm],y[mm],z[mm]"+System.Environment.NewLine);
            System.IO.File.AppendAllLines(outfile, list);

            // calculate distances
            List<string> distList = calculate_distances(list);
            List<string> labels = new List<string>();
            List<string> values = new List<string>();
            foreach (string label_value in distList)
            {
                labels.Add(label_value.Split(',')[0]);
                values.Add(label_value.Split(',')[1]);
            }
            string outfile2 = combine(out_dir, key + ".dist.csv");
            global_variables.log_line("saving to " + outfile2);
            string[] lines = { string.Join(",", labels), string.Join(",", values) };
            System.IO.File.WriteAllLines(outfile2, lines);
        }

        string center_of_mass(string img, string mask, string key, double level0, double th, double level1, string out_dir)
        {
            // get roi from the mask
            string roi_txt = mask + ".roi.txt";
            imagetools.calc_bounding_box_3d(mask, roi_txt);

            // crop around the hole
            string crop_img = combine(out_dir, key + ".crop.mha");
            imagetools.crop_3d_boundingbox_f(img, roi_txt, crop_img);

            // threshold & invert the image (the hole is air [-1000]);
            string th_img = crop_img + ".th.mha";
            imagetools.threshold_3d_f(crop_img, level0, th, level1, th_img);

            // measure the moment
            string moment_file = th_img + ".mnt.txt";
            imagetools.calc_image_moments_3d_f(th_img, moment_file);

            param p = new param(moment_file);
            string com_string  = p.get_value("Center of gravity").Replace("[","").Replace("]","").Trim();

            return com_string;
        }

        void measure_mean(string case_dir, string CT_ext, string mask_dir, string mask_ext, string key, string out_dir) 
        {
            // CT image
            string CT = combine(case_dir, "CT." + CT_ext);
            global_variables.log_line("CT=" + CT);
            int num_of_masks = System.Convert.ToInt32(global_variables.machine_param.get_value("num_of_"+key+"_masks"));

            List<string> list = new List<string>();
            List<string> col_names = new List<string>();
            for (int i = 1; i <= num_of_masks; i++)
            {
                string mask = combine(mask_dir, key + i.ToString() + "." + mask_ext);
                global_variables.log_line("mask=" + mask);

                // get image stat
                string mean = mean_pixel_value(CT, mask).ToString();
                global_variables.log_line("mean pixel value = " + mean);
                list.Add(mean);

                // col name
                string col_name = key + i.ToString();
                col_names.Add(col_name);
            }

            string outfile = combine(out_dir, key+".csv");
            global_variables.log_line("saving to " + outfile);
            string[] lines = { string.Join(",", col_names), string.Join(",", list) };
            System.IO.File.WriteAllLines(outfile, lines);
        }

        void measure_std(string case_dir, string CT_ext, string mask_dir, string mask_ext, string key, string out_dir) // high contrast
        {
            // CT image
            string CT = combine(case_dir, "CT." + CT_ext);
            global_variables.log_line("CT=" + CT);
            int num_of_masks = System.Convert.ToInt32(global_variables.machine_param.get_value("num_of_" + key + "_masks"));

            List<string> list = new List<string>();
            List<string> col_names = new List<string>();
            for (int i = 1; i <= num_of_masks; i++)
            {
                string mask = combine(mask_dir, key + i.ToString() + "." + mask_ext);
                global_variables.log_line("mask=" + mask);

                // get image stat
                string std = std_pixel_value(CT, mask).ToString();
                global_variables.log_line("std pixel value = " + std);
                list.Add(std);
                
                // col name
                string col_name = key + i.ToString();
                col_names.Add(col_name);
            }

            string outfile = combine(out_dir, key + ".csv");
            global_variables.log_line("saving to " + outfile);
            string[] lines = { string.Join(",", col_names), string.Join(",", list) };
            System.IO.File.WriteAllLines(outfile, lines);
        }
     
    }
}
