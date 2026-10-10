import net from "node:net";
import tls from "node:tls";

export async function verifySmtpConnection() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  if (!host || ![465, 587].includes(port)) throw new Error("SMTP host or port is not configured");
  return new Promise<void>((resolve, reject) => {
    const socket = port === 465
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
      : net.connect({ host, port });
    const timeout = setTimeout(() => socket.destroy(new Error("SMTP connection timeout")), 10000);
    socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
    socket.once(port === 465 ? "secureConnect" : "connect", () => {
      clearTimeout(timeout);
      socket.end();
      resolve();
    });
  });
}
