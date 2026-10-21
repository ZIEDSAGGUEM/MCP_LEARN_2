// Creates the private "campus" bucket and uploads the lab's PDFs. Safe to run twice.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "minio";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "files");
const s3 = new Client({
  endPoint: "127.0.0.1",
  port: 9010,
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
});

const BUCKET = "campus";
if (!(await s3.bucketExists(BUCKET))) await s3.makeBucket(BUCKET);
// no bucket policy: the bucket stays private; only the server (with its keys) can read it

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
let n = 0;
for (const file of walk(root).filter((f) => f.endsWith(".pdf"))) {
  const key = relative(root, file);
  await s3.putObject(BUCKET, key, readFileSync(file), undefined, { "Content-Type": "application/pdf" });
  n++;
}
console.log(`uploaded ${n} PDFs to bucket "${BUCKET}"`);
