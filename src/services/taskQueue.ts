/**
 * Task Queue System
 * 
 * Provides named queues with concurrency control, priority support,
 * and AbortController integration for clean task management.
 */

export type TaskId = string;
export type TaskStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface TaskOptions {
  /** Priority level (higher = more urgent, default: 0) */
  priority?: number;
  /** Optional task name for debugging */
  name?: string;
}

export interface Task<T = unknown> {
  id: TaskId;
  name?: string;
  priority: number;
  status: TaskStatus;
  abortController: AbortController;
  execute: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  createdAt: number;
}

export interface QueueOptions {
  /** Maximum concurrent tasks (default: 1 for serialization) */
  concurrency?: number;
  /** Optional callback when a task starts */
  onTaskStart?: (taskId: TaskId, name?: string) => void;
  /** Optional callback when a task completes */
  onTaskComplete?: (taskId: TaskId, name?: string) => void;
  /** Optional callback when a task fails */
  onTaskError?: (taskId: TaskId, error: unknown, name?: string) => void;
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  cancelled: number;
  failed: number;
}

/**
 * A task queue with concurrency control and priority support.
 */
export class TaskQueue {
  private name: string;
  private concurrency: number;
  private pendingTasks: Task[] = [];
  private runningTasks: Map<TaskId, Task> = new Map();
  private stats: QueueStats = {
    pending: 0,
    running: 0,
    completed: 0,
    cancelled: 0,
    failed: 0,
  };
  private callbacks: QueueOptions;
  private taskCounter = 0;

  constructor(name: string, options: QueueOptions = {}) {
    this.name = name;
    this.concurrency = options.concurrency ?? 1;
    this.callbacks = options;
  }

  /**
   * Enqueue a task for execution.
   * @param execute The async function to execute (receives AbortSignal)
   * @param options Optional task configuration
   * @returns A promise that resolves when the task completes
   */
  enqueue<T>(
    execute: (signal: AbortSignal) => Promise<T>,
    options: TaskOptions = {}
  ): { taskId: TaskId; promise: Promise<T> } {
    const taskId = `${this.name}-${++this.taskCounter}-${Date.now()}`;
    const abortController = new AbortController();

    let resolve: (value: T) => void;
    let reject: (reason: unknown) => void;

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const task: Task<T> = {
      id: taskId,
      name: options.name,
      priority: options.priority ?? 0,
      status: 'pending',
      abortController,
      execute,
      resolve: resolve!,
      reject: reject!,
      createdAt: Date.now(),
    };

    // Insert task in priority order (higher priority first)
    const insertIndex = this.pendingTasks.findIndex(
      (t) => t.priority < task.priority
    );
    if (insertIndex === -1) {
      this.pendingTasks.push(task as Task);
    } else {
      this.pendingTasks.splice(insertIndex, 0, task as Task);
    }

    this.stats.pending++;
    this.processQueue();

    return { taskId, promise };
  }

  /**
   * Cancel a task by ID.
   * @param taskId The task ID to cancel
   * @returns true if the task was found and cancelled
   */
  cancel(taskId: TaskId): boolean {
    // Check pending tasks
    const pendingIndex = this.pendingTasks.findIndex((t) => t.id === taskId);
    if (pendingIndex !== -1) {
      const task = this.pendingTasks[pendingIndex];
      this.pendingTasks.splice(pendingIndex, 1);
      task.status = 'cancelled';
      task.abortController.abort();
      task.reject(new DOMException('Task cancelled', 'AbortError'));
      this.stats.pending--;
      this.stats.cancelled++;
      return true;
    }

    // Check running tasks
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      runningTask.status = 'cancelled';
      runningTask.abortController.abort();
      // The task will be removed from running when it completes/fails
      return true;
    }

    return false;
  }

  /**
   * Cancel all pending and running tasks.
   */
  cancelAll(): void {
    // Cancel all pending tasks
    for (const task of this.pendingTasks) {
      task.status = 'cancelled';
      task.abortController.abort();
      task.reject(new DOMException('Task cancelled', 'AbortError'));
      this.stats.cancelled++;
    }
    this.stats.pending = 0;
    this.pendingTasks = [];

    // Cancel all running tasks
    for (const task of this.runningTasks.values()) {
      task.status = 'cancelled';
      task.abortController.abort();
    }
  }

  /**
   * Get current queue statistics.
   */
  getStats(): QueueStats {
    return { ...this.stats };
  }

  /**
   * Get the number of pending tasks.
   */
  get pendingCount(): number {
    return this.pendingTasks.length;
  }

  /**
   * Get the number of running tasks.
   */
  get runningCount(): number {
    return this.runningTasks.size;
  }

  /**
   * Check if the queue is empty (no pending or running tasks).
   */
  get isEmpty(): boolean {
    return this.pendingTasks.length === 0 && this.runningTasks.size === 0;
  }

  /**
   * Process the next task(s) in the queue.
   */
  private processQueue(): void {
    while (
      this.pendingTasks.length > 0 &&
      this.runningTasks.size < this.concurrency
    ) {
      const task = this.pendingTasks.shift()!;
      this.stats.pending--;
      this.runTask(task);
    }
  }

  /**
   * Run a single task.
   */
  private async runTask(task: Task): Promise<void> {
    task.status = 'running';
    this.runningTasks.set(task.id, task);
    this.stats.running++;

    this.callbacks.onTaskStart?.(task.id, task.name);

    try {
      const result = await task.execute(task.abortController.signal);
      
      // Check if cancelled during execution (status may have changed via cancel())
      const currentStatus = task.status as TaskStatus;
      if (currentStatus === 'cancelled') {
        this.stats.running--;
        this.stats.cancelled++;
        this.runningTasks.delete(task.id);
        task.reject(new DOMException('Task cancelled', 'AbortError'));
      } else {
        task.status = 'completed';
        this.stats.running--;
        this.stats.completed++;
        this.runningTasks.delete(task.id);
        task.resolve(result);
        this.callbacks.onTaskComplete?.(task.id, task.name);
      }
    } catch (error) {
      this.runningTasks.delete(task.id);
      this.stats.running--;

      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        task.status = 'cancelled';
        this.stats.cancelled++;
        task.reject(error);
      } else {
        task.status = 'failed';
        this.stats.failed++;
        task.reject(error);
        this.callbacks.onTaskError?.(task.id, error, task.name);
      }
    }

    // Process next task
    this.processQueue();
  }
}

/**
 * Registry of named task queues.
 */
class TaskQueueRegistry {
  private queues: Map<string, TaskQueue> = new Map();
  private defaultOptions: QueueOptions = { concurrency: 1 };

  /**
   * Get or create a named queue.
   * @param name The queue name
   * @param options Optional queue configuration (only used on creation)
   */
  getQueue(name: string, options?: QueueOptions): TaskQueue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new TaskQueue(name, options ?? this.defaultOptions);
      this.queues.set(name, queue);
    }
    return queue;
  }

  /**
   * Check if a queue exists.
   */
  hasQueue(name: string): boolean {
    return this.queues.has(name);
  }

  /**
   * Get all queue names.
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Cancel all tasks in all queues.
   */
  cancelAll(): void {
    for (const queue of this.queues.values()) {
      queue.cancelAll();
    }
  }

  /**
   * Get combined stats from all queues.
   */
  getAllStats(): Record<string, QueueStats> {
    const stats: Record<string, QueueStats> = {};
    for (const [name, queue] of this.queues) {
      stats[name] = queue.getStats();
    }
    return stats;
  }
}

// Export singleton registry
export const taskQueueRegistry = new TaskQueueRegistry();

// Convenience function to get a queue
export function getTaskQueue(name: string, options?: QueueOptions): TaskQueue {
  return taskQueueRegistry.getQueue(name, options);
}
