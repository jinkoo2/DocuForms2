using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Net.Mail;

namespace ctqa_lib
{
    public class email
    {
        public static void send(
            string from, 
            string from_enc_pw, 
            string to, 
            string subject, 
            string body, 
            string domain, 
            string host, 
            int port, 
            bool enable_ssl)
        {
            MailMessage msg = new MailMessage();

            //global_variables.log_line("email.send()");

            //global_variables.log_line("from=" + from);
            //global_variables.log_line("from_enc_pw=" + from_enc_pw);
            //global_variables.log_line("to=" + to);
            //global_variables.log_line("subject=" + subject);
            //global_variables.log_line("body=" + body);
            //global_variables.log_line("domain=" + domain);
            //global_variables.log_line("host=" + host);
            //global_variables.log_line("port=" + port);
            //global_variables.log_line("enable_ssl=" + enable_ssl);


            string[] elms = to.Split(',');
            foreach (string elm in elms)
            {
                // need to check if valid email address
                msg.To.Add(new MailAddress(elm.Trim() + "@" + domain.Trim()));
            }

            msg.From = new MailAddress(from + "@" + domain);
            msg.Subject = subject;
            msg.Body = body;
            msg.IsBodyHtml = true;

            SmtpClient client = new SmtpClient();
            client.UseDefaultCredentials = false;

            if (from_enc_pw.Trim() != "")
            {
                global_variables.log_line("from_enc_pw is not empty, so setting password for the credential.");
                string pw = Crypt.StringCipher.Decrypt(from_enc_pw, "qwert12345!@#$%");
                client.Credentials = new System.Net.NetworkCredential(from + "@" + domain, pw);
            }

            client.Port = port;
            client.Host = host;
            client.DeliveryMethod = SmtpDeliveryMethod.Network;
            client.EnableSsl = enable_ssl;

            try
            {
                //global_variables.log_line("email send initiated...");
                client.Send(msg);
                global_variables.log_line("email send complete.");
            }
            catch(Exception exn)
            {
                global_variables.log_line("email send failed:"+exn.Message);
                return;
            }
        }
    }
}
