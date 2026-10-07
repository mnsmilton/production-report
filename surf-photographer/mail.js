import nodemailer from 'nodemailer';
import { config } from './config.js';

const { smtp } = config;
const transport = smtp.host
  ? nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined })
  : null;

export const mailEnabled = Boolean(transport);

export async function sendDownloadEmail({ to, title, url }) {
  if (!transport) return;
  await transport.sendMail({
    from: smtp.from || smtp.user,
    to,
    subject: `Tu descarga de ${config.brand} / Your ${config.brand} download`,
    text: `¡Gracias por tu compra! Descarga tu archivo original aquí (${config.maxDownloads} descargas, ${config.downloadDays} días):\n${url}\n\n` +
      `Thanks for your purchase! Download your original file here:\n${url}\n\n${title || ''}`,
  });
}
