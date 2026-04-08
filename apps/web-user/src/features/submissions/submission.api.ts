import { getApiClient } from '../../lib/api-client';

export type SubmissionPayload = {
  content: string;
  imageUrls: string[];
  token: string;
};

export async function createSubmission(taskId: string, payload: SubmissionPayload) {
  return getApiClient().createSubmission({
    taskId,
    content: payload.content,
    imageUrls: payload.imageUrls,
    token: payload.token,
  });
}
