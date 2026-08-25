import 'server-only';

/**
 * Batch execution boundary.
 *
 * Today batches run in-process with bounded concurrency, which is correct for a
 * single server and keeps the request/response contract simple. The interface
 * is shaped so a durable queue (BullMQ, SQS, Cloud Tasks) can replace it: jobs
 * carry an id, results are collected by id, and nothing assumes the work
 * happened on this machine or during this request.
 *
 * When moving to a worker: implement `JobRunner` to enqueue and poll, and
 * change the batch route to return a job id plus a status endpoint instead of
 * awaiting `runAll`.
 */

export interface Job<TInput> {
  id: string;
  input: TInput;
}

export type JobOutcome<TOutput> =
  | { id: string; status: 'fulfilled'; value: TOutput }
  | { id: string; status: 'failed'; error: unknown };

export interface JobRunner<TInput, TOutput> {
  runAll(
    jobs: Array<Job<TInput>>,
    handler: (input: TInput, id: string) => Promise<TOutput>,
    options?: { onSettled?: (outcome: JobOutcome<TOutput>) => void; signal?: AbortSignal },
  ): Promise<Array<JobOutcome<TOutput>>>;
}

/**
 * Runs jobs with a fixed worker pool.
 *
 * Concurrency defaults to 2 because the local ONNX provider serialises
 * inference internally — a higher number would only increase peak memory while
 * the extra workers waited on the same lock. Remote providers benefit from a
 * higher value.
 */
export class InProcessJobRunner<TInput, TOutput> implements JobRunner<TInput, TOutput> {
  constructor(private readonly concurrency = 2) {}

  async runAll(
    jobs: Array<Job<TInput>>,
    handler: (input: TInput, id: string) => Promise<TOutput>,
    options: { onSettled?: (outcome: JobOutcome<TOutput>) => void; signal?: AbortSignal } = {},
  ): Promise<Array<JobOutcome<TOutput>>> {
    const results: Array<JobOutcome<TOutput>> = new Array(jobs.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        const index = cursor;
        cursor += 1;
        const job = jobs[index];
        if (!job) return;

        if (options.signal?.aborted) {
          results[index] = {
            id: job.id,
            status: 'failed',
            error: new Error('batch aborted'),
          };
          continue;
        }

        try {
          const value = await handler(job.input, job.id);
          const outcome: JobOutcome<TOutput> = { id: job.id, status: 'fulfilled', value };
          results[index] = outcome;
          options.onSettled?.(outcome);
        } catch (error) {
          const outcome: JobOutcome<TOutput> = { id: job.id, status: 'failed', error };
          results[index] = outcome;
          options.onSettled?.(outcome);
        }
      }
    };

    const workers = Array.from({ length: Math.min(this.concurrency, jobs.length) }, worker);
    await Promise.all(workers);
    return results;
  }
}
