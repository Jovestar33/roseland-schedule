import 'server-only';
import nodemailer from 'nodemailer';
import {PlatformHttpError} from './server';

export function readNotificationMailConfig(env:NodeJS.ProcessEnv=process.env){
 const host=env.ROSELAND_SMTP_HOST,port=Number(env.ROSELAND_SMTP_PORT);
 const user=env.ROSELAND_SMTP_USERNAME,password=env.ROSELAND_SMTP_PASSWORD,from=env.ROSELAND_SMTP_FROM;
 // This deployment is authorized to send from John's Roseland alias only.
 if(env.ROSELAND_HOSTED_NOTIFICATIONS!=='smtp'||!host||!['smtp.zoho.com','smtppro.zoho.com'].includes(host)||![465,587].includes(port)||!['john@salukimedia.com','john@roseland-pictures.com'].includes(user??'')||from!=='action@roseland-pictures.com'||!password)
  throw new PlatformHttpError(503,'Notification delivery unavailable');
 return {host,port,user:user!,password,from};
}
export async function sendHostedNotification(config:ReturnType<typeof readNotificationMailConfig>,message:{recipient:string;event:string;subject:string;text:string}):Promise<boolean>{
 if(!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(message.recipient)||message.recipient.length>254)throw new Error('Invalid notification recipient');
 const transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.port===465,requireTLS:true,
  auth:{user:config.user,pass:config.password},tls:{rejectUnauthorized:true,minVersion:'TLSv1.2'},
  connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,dnsTimeout:5000,
  logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
 try{
  const result=await transport.sendMail({from:{name:'Roseland Pictures',address:config.from},to:{address:message.recipient,name:''},
   envelope:{from:config.from,to:[message.recipient]},subject:message.subject,text:message.text,
   headers:{'X-Roseland-Event':message.event},disableFileAccess:true,disableUrlAccess:true});
  // SMTP acceptance is recorded; it does not prove arrival in an inbox.
  return result.accepted.some(value=>value.toLowerCase()===message.recipient.toLowerCase())&&result.rejected.length===0;
 }finally{transport.close();}
}
