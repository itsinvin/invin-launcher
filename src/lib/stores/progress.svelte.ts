import { onProgress } from '$lib/api';
import type { ProgressEvent } from '$lib/types';

class ProgressStore {
  /** Active tasks keyed by taskId. */
  tasks = $state<Record<string, ProgressEvent>>({});

  async init() {
    onProgress((e) => {
      if (e.total > 0 && e.current >= e.total) {
        // Completed: remove after a short delay so the bar can finish.
        const { [e.taskId]: _done, ...rest } = this.tasks;
        this.tasks = { ...rest, [e.taskId]: e };
        setTimeout(() => {
          const { [e.taskId]: _drop, ...remaining } = this.tasks;
          this.tasks = remaining;
        }, 1200);
      } else {
        this.tasks = { ...this.tasks, [e.taskId]: e };
      }
    });
  }

  get active(): ProgressEvent[] {
    return Object.values(this.tasks);
  }
}

export const progress = new ProgressStore();
