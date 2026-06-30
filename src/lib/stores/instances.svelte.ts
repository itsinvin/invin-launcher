import {
  cloneInstance,
  createInstance,
  deleteInstance,
  killInstance,
  launchInstance,
  listInstances,
  onInstanceExit,
  updateInstance
} from '$lib/api';
import type { Instance, InstanceDraft } from '$lib/types';

class InstancesStore {
  list = $state<Instance[]>([]);
  loaded = $state(false);
  /** Set of instance ids currently running. */
  running = $state<Set<string>>(new Set());

  async init() {
    await this.load();
    onInstanceExit((id) => {
      const next = new Set(this.running);
      next.delete(id);
      this.running = next;
      void this.load();
    });
  }

  async load() {
    try {
      this.list = await listInstances();
    } catch (e) {
      console.error('Failed to load instances', e);
      this.list = [];
    }
    this.loaded = true;
  }

  async create(draft: InstanceDraft): Promise<Instance> {
    const created = await createInstance(draft);
    await this.load();
    return created;
  }

  async update(instance: Instance) {
    await updateInstance(instance);
    await this.load();
  }

  async clone(id: string, name: string) {
    await cloneInstance(id, name);
    await this.load();
  }

  async remove(id: string) {
    await deleteInstance(id);
    await this.load();
  }

  async launch(id: string) {
    const next = new Set(this.running);
    next.add(id);
    this.running = next;
    try {
      await launchInstance(id);
    } catch (e) {
      const revert = new Set(this.running);
      revert.delete(id);
      this.running = revert;
      throw e;
    }
  }

  async kill(id: string) {
    await killInstance(id);
  }

  isRunning(id: string): boolean {
    return this.running.has(id);
  }
}

export const instances = new InstancesStore();
