import { createInterface } from "node:readline";

/**
 * Hidden password prompt for operator scripts. Falls back to reading one line
 * from stdin when it is not a TTY (CI, piped input).
 */
export async function promptHidden(question) {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => rl.question(question, resolve));
    rl.close();
    return answer.trim();
  }

  process.stdout.write(question);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  try {
    return await new Promise((resolve) => {
      const onData = (buffer) => {
        const text = buffer.toString("utf8");
        for (const char of text) {
          if (char === "\r" || char === "\n" || char === "\u0004") {
            stdin.removeListener("data", onData);
            process.stdout.write("\n");
            resolve(value);
            return;
          }
          if (char === "\u0003") {
            stdin.removeListener("data", onData);
            process.stdout.write("\n");
            process.exit(130);
          }
          if (char === "\u007f" || char === "\b") {
            value = value.slice(0, -1);
            continue;
          }
          if (char >= " ") value += char;
        }
      };
      stdin.on("data", onData);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
}

export async function promptVisible(question, fallback = "") {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim() || fallback;
}
