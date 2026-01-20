using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace analysis
{
    public static class db
    {
        public static string db_file = "C:\\apps\\CTQA\\sqlite\\my.db";
        public static System.Data.SQLite.SQLiteConnection con = null;

        public static bool initalized()
        {
            if (System.IO.File.Exists(db_file))
                return true;
            else
                return false;
        }

        public static void setup()
        {
            System.Data.SQLite.SQLiteConnection.CreateFile(db_file);

            open_connection();
            {
                // create table
                string sql = "create table highscores (name varchar(20), score int)";
                exec_non_query(sql);
            }
            close_connection();
        }

        public static void open_connection()
        {
            // if already open close
            if (con != null)
                close_connection();
              
            string conString = string.Format("Data Source={0};Version=3", db_file);
            con = new SQLiteConnection(conString);
            con.Open();
        }

        public static void close_connection()
        {
            con.Close();
            con = null;
        }

        public static void exec_non_query(string sql)
        {
            SQLiteCommand command = new SQLiteCommand(sql, con);
            command.ExecuteNonQuery();
        }
               
    }
}
