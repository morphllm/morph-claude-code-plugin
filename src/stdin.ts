import { text } from "node:stream/consumers";

export async function readStdinText(): Promise<string> {
  return await text(process.stdin);
}
