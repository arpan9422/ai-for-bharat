import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function uploadCallRecording(
  callId: string,
  audioBuffer: Buffer,
  mimeType = 'audio/webm'
): Promise<{ key: string; sizeBytes: number }> {
  const BUCKET = process.env.AWS_BUCKET_NAME;
  if (!BUCKET) throw new Error('AWS_BUCKET_NAME is not set');

  const key = `recordings/${callId}/${callId}.webm`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: audioBuffer,
    ContentType: mimeType,
    Metadata: { callId },
  }));

  return { key, sizeBytes: audioBuffer.byteLength };
}

export async function getRecordingUrl(key: string): Promise<string> {
  const BUCKET = process.env.AWS_BUCKET_NAME;
  if (!BUCKET) throw new Error('AWS_BUCKET_NAME is not set');

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: 3600, // Valid for 1 hour
  });
}
