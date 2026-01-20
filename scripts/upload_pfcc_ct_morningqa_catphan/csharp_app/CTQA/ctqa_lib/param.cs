using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace ctqa_lib
{
    public class param
    {
        protected string _file;
        public string file
        {
            get
            {
                return this._file;
            }
        }

        public param(string param_file)
        {
            this._file = param_file;
        }

        public string get_value(string key)
        {
            string[] lines = System.IO.File.ReadAllLines(this._file);

            foreach (string line in lines)
            {
                if (line.Trim() == "")
                    continue;

                if (line.Trim().StartsWith("#"))
                    continue;

                string[] elms = line.Split('=');
                if (elms.Length != 2)
                    continue;

                if (elms[0].Trim().ToLower() == key.Trim().ToLower())
                    return elms[1].Trim();
            }

            return "";
        }

        public string[] get_value_as_array(string key)
        {
            List<string> list = new List<string>();
            string values = get_value(key);
            if (values.Trim() != "")
            {
                foreach (string v in values.Split(','))
                    list.Add(v.Trim());
            }

            return list.ToArray();
        }

    }
}
