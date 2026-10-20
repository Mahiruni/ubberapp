import net from "node:net";
import tls from "node:tls";

type Conn = net.Socket | tls.TLSSocket;
function responseReader(socket: Conn) {
  let buffer = "";
  let currentCode = "";
  const queue: string[] = [];
  let waiter: { resolve: (line: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  let terminalError: Error | null = null;
  const deliver = (line: string) => {
    if (waiter) {
      const pending = waiter;
      waiter = null;
      clearTimeout(pending.timer);
      pending.resolve(line);
    } else queue.push(line);
  };
  const fail = (error: Error) => {
    terminalError = error;
    if (waiter) {
      const pending = waiter;
      waiter = null;
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  };
  socket.on("data", (data: Buffer) => {
    buffer += data.toString("utf8");
    let at: number;
    while ((at = buffer.indexOf("\r\n")) !== -1) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      const match = /^(\d{3})([ -])/.exec(line);
      if (!match) continue;
      if (match[2] === "-") {
        currentCode = match[1];
        continue;
      }
      if (!currentCode || currentCode === match[1]) {
        currentCode = "";
        deliver(line);
      }
    }
  });
  socket.once("error", fail);
  socket.once("close", () => fail(new Error("SMTP connection closed")));
  return async (codes: number[]) => {
    if (terminalError) throw terminalError;
    const line = queue.shift() ?? await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiter = null;
        reject(new Error("SMTP server response timeout"));
      }, 12000);
      waiter = { resolve, reject, timer };
    });
    if (!codes.includes(Number(line.slice(0, 3)))) throw new Error("SMTP rejected request: " + line.slice(0, 3));
  };
}
function connect(host: string, port: number, secure: boolean) {
  return new Promise<Conn>((resolve, reject) => {
    const socket = secure ? tls.connect({ host, port, servername: host, rejectUnauthorized: true }) : net.connect({ host, port });
    socket.setTimeout(12000, () => socket.destroy(new Error("SMTP timeout")));
    socket.once("error", reject);
    socket.once(secure ? "secureConnect" : "connect", () => resolve(socket));
  });
}
const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
export async function sendSmtpTest(to: string, subject: string, body: string) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  if (!host || ![465, 587].includes(port) || !user || !password || !from) throw new Error("SMTP configuration incomplete");
  if (![to, from].every(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) throw new Error("Invalid email address");
  let socket = await connect(host, port, port === 465);
  try {
    let read = responseReader(socket);
    const send = (command: string) => socket.write(command + "\r\n");
    await read([220]);
    send("EHLO ubberapp.vercel.app"); await read([250]);
    if (port === 587) {
      send("STARTTLS"); await read([220]);
      socket.removeAllListeners("data");
      socket.removeAllListeners("close");
      socket.removeAllListeners("error");
      socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const upgraded = tls.connect({ socket, servername: host, rejectUnauthorized: true }, () => resolve(upgraded));
        upgraded.once("error", reject);
      });
      read = responseReader(socket);
      socket.write("EHLO ubberapp.vercel.app\r\n"); await read([250]);
    }
    const command = async (value: string, expected: number[]) => { socket.write(value + "\r\n"); await read(expected); };
    await command("AUTH LOGIN", [334]);
    await command(b64(user), [334]);
    await command(b64(password), [235]);
    await command("MAIL FROM:<" + from + ">", [250]);
    await command("RCPT TO:<" + to + ">", [250, 251]);
    await command("DATA", [354]);
    const headers = [
      "From: " + from, "To: " + to,
      "Subject: =?UTF-8?B?" + b64(subject) + "?=",
      "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64", "X-Biloo-Campaign: test", ""
    ];
    await command(headers.join("\r\n") + "\r\n" + (b64(body).match(/.{1,76}/g) || []).join("\r\n") + "\r\n.", [250]);
    socket.write("QUIT\r\n");
  } finally { socket.destroy(); }
}
