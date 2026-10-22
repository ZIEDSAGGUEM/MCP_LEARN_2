// File storage (MinIO, S3-compatible). Keys are always chosen by the server, never taken from a client.
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "./config.js";

const s3 = new S3Client({
  endpoint: config.s3Endpoint,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: config.s3AccessKey, secretAccessKey: config.s3SecretKey },
});

export async function readFile(key: string): Promise<Buffer> {
  const out = await s3.send(new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }));
  return Buffer.from(await out.Body!.transformToByteArray());
}
